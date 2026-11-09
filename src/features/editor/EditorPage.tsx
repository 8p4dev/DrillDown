import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { logEvent } from '../../core/events'
import { cloneBranch, nodesToOutline, outlineToNodes, parseOutline, serializeOutline, splitTitle } from '../../core/outline'
import { childrenOf, deleteNodes, descendantsOf, getTreeNodes, putNodes } from '../../core/repo'
import { getSrsMap, missHeat } from '../../core/srs'
import { ancestorsOf } from '../../core/path'
import { CAP, type ID, type NodeSrs, type TreeNode } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { NodePath } from '../../ui/NodePath'
import { clipboardPaste, copy, cornerDownRight, eraser, highlighter, keyboard, list, maximize, network, search, undo2, x, zoomIn, zoomOut } from '../../ui/icons.all'
import NodeRow from './NodeRow'
import NoteEditor, { type NoteApi, type NoteOp } from './content/NoteEditor'
import GraphView from './graph/GraphView'
import { isOpen } from './graph/layout'
import { searchNodes, SEARCH_LIMIT } from './search'
import { changedNode } from './edit'
import TreeHeader from '../TreeHeader'
import { hint, toast } from '../Toast'
import { haptic } from '../feel'
import { ensureVisible, startViewport, subscribeViewport } from '../viewport'
import './editor.css'

const UNDO_LIMIT = 50
const UNDO_MS = 10_000 // 노드 삭제 되돌리기(02 §3.5: 트리 삭제와 같은 10초)
const narrow = () => matchMedia('(max-width: 760px)').matches
const coarse = () => matchMedia('(pointer: coarse)').matches
const clampZoom = (z: number) => Math.min(2, Math.max(0.3, Math.round(z * 100) / 100))

// ---- 순수 트리 연산 (노드 배열은 불변으로 다룬다: 바뀐 노드만 새 객체) ----
const patch = (ns: TreeNode[], id: ID, p: Partial<TreeNode>) =>
  ns.map((n) => (n.id === id ? { ...n, ...p, updatedAt: Date.now() } : n))
const nextOrder = (ns: TreeNode[], parentId: ID) => {
  const k = childrenOf(ns, parentId)
  return k.length ? k[k.length - 1].order + 1 : 0
}
/** node 바로 뒤 형제 자리의 order (types.ts 규약: 중간값) */
const orderAfter = (ns: TreeNode[], node: TreeNode) => {
  const sib = childrenOf(ns, node.parentId!)
  const next = sib[sib.indexOf(node) + 1]
  return next ? (node.order + next.order) / 2 : node.order + 1
}
type Open = (n: TreeNode, depth: number) => boolean
/** 화면에 그려지는 노드(전위 순서). open = 접기 + 보기 깊이(C3), depth 는 root(포커스 루트) 기준 */
const visibleRows = (ns: TreeNode[], root: TreeNode, open: Open = isOpen) => {
  const out: { node: TreeNode; depth: number }[] = []
  const walk = (n: TreeNode, depth: number) => {
    out.push({ node: n, depth })
    if (open(n, depth)) for (const k of childrenOf(ns, n.id)) walk(k, depth + 1)
  }
  walk(root, 0)
  return out
}
const newNode = (treeId: ID, parentId: ID, order: number): TreeNode => ({
  id: crypto.randomUUID(), treeId, parentId, order, title: '', aliases: [], updatedAt: Date.now(),
})
const FULL_MSG = '트리 하나에 노드는 5,000개까지입니다' // 계약 C5
/** 실행 취소 1단계: 되돌아갈 노드 배열 + 무엇이었는지(U09 토스트 "가져오기 222개 되돌림") */
type Step = { ns: TreeNode[]; label: string }
const isComposing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229
/** 노드별 자식 유무·하위 수·형제 위치를 한 번에 계산 (O(n log n)). 노드마다 childrenOf/descendantsOf 를 부르면 O(n²) */
function countTree(ns: TreeNode[]) {
  const kids = new Map<ID, TreeNode[]>()
  for (const n of ns) {
    if (n.parentId === null) continue
    const k = kids.get(n.parentId)
    if (k) k.push(n)
    else kids.set(n.parentId, [n])
  }
  const pos = new Map<ID, [number, number]>()
  for (const k of kids.values()) k.sort((a, b) => a.order - b.order).forEach((n, i) => pos.set(n.id, [i + 1, k.length]))
  const desc = new Map<ID, number>()
  const walk = (id: ID): number => {
    const total = (kids.get(id) ?? []).reduce((sum, k) => sum + 1 + walk(k.id), 0)
    desc.set(id, total)
    return total
  }
  for (const n of ns) if (n.parentId === null) walk(n.id)
  return { hasKids: (id: ID) => kids.has(id), desc: (id: ID) => desc.get(id) ?? 0, pos: (id: ID) => pos.get(id) ?? [1, 1] }
}

// ---- 트리별 보기 상태(U18): 선택·배율·스크롤·보기 깊이. 실패해도(사생활 모드 등) 기본값으로 동작 ----
type View = { sel?: ID; zoom?: number; sx?: number; sy?: number; depth?: number; root?: string }
const viewKey = (treeId: string) => `dd:editor-view:${treeId}`
function loadView(treeId: string): View {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(treeId)) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function saveView(treeId: string, v: View) {
  try {
    localStorage.setItem(viewKey(treeId), JSON.stringify(v))
  } catch { /* 저장 못 해도 편집은 계속 */ }
}
const DEPTHS = [1, 2, 3, 0] as const // 0 = ∞ (보기 깊이 제한 없음)
const mapOf = (ns: TreeNode[]) => new Map(ns.map((n) => [n.id, n]))

/** rootId = 서브트리 포커스(T1, C2): 그 가지만 그린다. 없거나 지워진 노드면 전체 */
export default function EditorPage({ treeId, rootId }: { treeId: string; rootId?: string }) {
  const [saved] = useState(() => loadView(treeId))
  const sameRoot = (saved.root ?? '') === (rootId ?? '')
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  const [srs, setSrs] = useState<Map<ID, NodeSrs>>(new Map())
  const [selId, setSelId] = useState<ID>('')
  // 보기 깊이(C3): 에디터 로컬 상태. collapsed·outbox·undo 와 무관. reveal = 깊이 제한을 넘어 펼친 노드(배지·검색·추가)
  const [viewDepth, setViewDepth] = useState<number>(() => ((DEPTHS as readonly number[]).includes(saved.depth ?? 0) ? (saved.depth ?? 0) : 0))
  const [reveal, setReveal] = useState<ReadonlySet<ID>>(new Set())
  const [searching, setSearching] = useState(false)
  const [editId, setEditId] = useState<ID | null>(null)
  const [draft, setDraft] = useState('')
  const [noteEditId, setNoteEditId] = useState<ID | null>(null) // 카드 안에서 내용 편집 중인 노드
  const [cutId, setCutId] = useState<ID | null>(null)
  const [ioOpen, setIoOpen] = useState(false) // 개요 붙여넣기: 빈 트리일 때만 펼친 채 시작
  const [importText, setImportText] = useState('')
  const [exportText, setExportText] = useState('')
  // 핸들러가 같은 이벤트 안에서 여러 번 commit 해도 최신 상태를 보도록 ref 를 기준으로 삼는다
  const nodesRef = useRef<TreeNode[]>([])
  const editRef = useRef<ID | null>(null)
  const draftRef = useRef('')
  const undoRef = useRef<Step[]>([])
  const redoRef = useRef<Step[]>([])
  const outlineRef = useRef<HTMLDivElement>(null)
  const liveBase = useRef<TreeNode[] | null>(null) // 실시간 편집 시작 시점 스냅샷 (끝날 때 실행취소 1단계로)
  const cardNote = useRef<NoteApi | null>(null)
  const panelNote = useRef<NoteApi | null>(null)

  // 오답 농도(붉은색)만 쓴다. 숙련도 색(c-*)은 플래시카드 화면 전용 (plan §0)
  useEffect(() => void getSrsMap(treeId).then(setSrs), [treeId])
  useEffect(() => {
    let alive = true
    getTreeNodes(treeId).then((ns) => {
      if (!alive) return
      nodesRef.current = ns
      undoRef.current = []
      redoRef.current = []
      setNodes(ns)
      if (saved.depth === undefined && ns.length > 1000) setViewDepth(3) // U21: 큰 트리 첫 열기는 깊이 3(저장된 보기 상태 없을 때만)
      setIoOpen(ns.length === 1)
      setSelId(ns.some((n) => n.id === saved.sel) ? saved.sel! : (ns.find((n) => n.id === rootId)?.id ?? ns.find((n) => n.parentId === null)?.id ?? ''))
    })
    return () => {
      alive = false
    }
  }, [treeId]) // oxlint-disable-line react-hooks/exhaustive-deps -- 진입 시 1회: saved·rootId 는 처음 값

  const loaded = nodes !== null
  useEffect(() => {
    if (loaded) outlineRef.current?.focus() // 진입 즉시 키보드로 편집 가능
  }, [loaded])
  // 동기화 엔진이 pull 뒤 쏘는 dd:remote{treeIds}: 내 트리면 노드를 다시 읽어 교체한다.
  // undo 스택은 그대로 두고, 편집 중인 노드(카드 제목·카드 내용·패널 live)는 로컬 값을 유지해 입력칸을 덮지 않는다.
  useEffect(() => {
    const onRemote = (e: Event) => {
      if (!(e as CustomEvent<{ treeIds: string[] }>).detail?.treeIds?.includes(treeId)) return
      const keep = new Set([editId, noteEditId, liveBase.current ? selId : null])
      getTreeNodes(treeId).then((remote) => {
        const local = new Map(nodesRef.current.map((n) => [n.id, n]))
        const next = remote.map((n) => (keep.has(n.id) && local.get(n.id)) || n)
        nodesRef.current = next
        setNodes(next)
        setSelId((id) => (next.some((n) => n.id === id) ? id : (next.find((n) => n.parentId === null)?.id ?? '')))
        setCutId((id) => (id && next.some((n) => n.id === id) ? id : null))
      })
    }
    addEventListener('dd:remote', onRemote)
    return () => removeEventListener('dd:remote', onRemote)
  }, [treeId, editId, noteEditId, selId])
  // 키보드(--kb)·시각 뷰포트 추적. 키보드가 열리면 단축키 시트는 닫는다(02 규칙 4(b))
  useEffect(() => {
    startViewport()
    if (coarse()) hint('editor', '카드 두 번 탭 = 제목') // 1회성 힌트
    return subscribeViewport((v) => {
      if (v.open) document.getElementById(KEYS_ID)?.hidePopover()
    })
  }, [])
  // '/' = 검색 (입력 중이 아닐 때). Ctrl+F 는 브라우저 찾기 그대로
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      const t = e.target as HTMLElement | null
      if (t?.isContentEditable || t?.closest?.('input, textarea, select')) return
      e.preventDefault()
      setSearching(true)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  // 편집 종료로 입력창이 사라지면 아웃라이너로 포커스 복귀 (메모 칸 등 다른 곳으로 간 경우는 건드리지 않음)
  useLayoutEffect(() => {
    if (editId === null && (document.activeElement === document.body || document.activeElement === null))
      outlineRef.current?.focus()
  }, [editId])

  // ---- 확대·축소: 버튼, Ctrl+휠, 핀치, 탐색 모드 키 - = 0 ----
  const [zoom, setZoom] = useState(() => (sameRoot && saved.zoom ? clampZoom(saved.zoom) : 1))
  const zoomRef = useRef(zoom)
  /** 화면 좌표 (cx, cy) 아래의 그래프 지점을 그대로 둔 채 배율 변경. 기준점을 안 주면 캔버스 중앙 */
  function zoomTo(next: number, cx?: number, cy?: number) {
    const box = outlineRef.current
    const g = box?.querySelector<HTMLElement>('.graph')
    const z = zoomRef.current
    next = clampZoom(next)
    if (!box || !g || next === z) return
    const b = box.getBoundingClientRect()
    const x = cx ?? b.left + box.clientWidth / 2
    const y = cy ?? b.top + box.clientHeight / 2
    const r = g.getBoundingClientRect()
    const [gx, gy] = [(x - r.left) / z, (y - r.top) / z]
    zoomRef.current = next
    flushSync(() => setZoom(next))
    const r2 = g.getBoundingClientRect()
    box.scrollLeft += r2.left + gx * next - x
    box.scrollTop += r2.top + gy * next - y
  }
  const zoomBy = (f: number) => zoomTo(zoomRef.current * f)
  function fitZoom() {
    const box = outlineRef.current
    const g = box?.querySelector<HTMLElement>('.graph')
    if (!box || !g) return
    zoomTo(Math.min(1, (box.clientWidth - 16) / g.offsetWidth, (box.clientHeight - 16) / g.offsetHeight))
    centerOn(selRef.current) // U15: 맞춤 뒤에도 선택 노드가 화면 가운데에 남는다
  }
  /** 카드 중심을 캔버스 가운데로. 카드 rect 는 재배치 트랜지션 중일 수 있어 목표 좌표(style left/top)를 쓴다 */
  function centerOn(id: ID) {
    const box = outlineRef.current
    const g = box?.querySelector('.graph')
    const card = box?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)
    if (!box || !g || !card) return
    const [r, b, z] = [g.getBoundingClientRect(), box.getBoundingClientRect(), zoomRef.current]
    box.scrollLeft += r.left + (parseFloat(card.style.left) + card.offsetWidth / 2) * z - (b.left + box.clientWidth / 2)
    box.scrollTop += r.top + (parseFloat(card.style.top) + card.offsetHeight / 2) * z - (b.top + box.clientHeight / 2)
  }
  useEffect(() => {
    const el = outlineRef.current
    if (!el) return
    // React 의 wheel 리스너는 passive 라 preventDefault 가 안 된다 → 직접 등록
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomTo(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [loaded]) // oxlint-disable-line react-hooks/exhaustive-deps -- zoomTo 는 ref 와 setState 만 쓴다

  // ---- 자동 맞춤: 진입·개요 가져오기 뒤 1회, 넘칠 때만. 일반 편집 중에는 카드가 튀지 않게 하지 않는다 ----
  const restorePending = useRef(sameRoot && typeof saved.sx === 'number' ? { x: saved.sx, y: saved.sy ?? 0 } : null)
  const fitPending = useRef(!restorePending.current) // oxlint-disable-line react/refs -- 첫 렌더 초기값만 읽는다
  const centerPending = useRef<number | null>(null)
  const centerAfter = useRef<ID | null>(null) // 검색·포커스 해제 뒤 배치가 끝나면 이 카드를 가운데로
  const settledRoot = useRef(rootId)
  const settled = useRef(false) // 첫 배치 전에는 보기 상태를 저장하지 않는다(복원 전 0 으로 덮지 않게)
  /** rootX = 배치 좌표의 루트 중심. 루트 카드의 rect 는 재배치 트랜지션 중이라 쓸 수 없다 */
  function centerRoot(rootX: number) {
    const box = outlineRef.current
    const g = box?.querySelector('.graph')
    if (!box || !g) return
    box.scrollTop = 0
    box.scrollLeft += g.getBoundingClientRect().left + rootX * zoomRef.current - (box.getBoundingClientRect().left + box.clientWidth / 2)
  }
  /** GraphView 가 실측 크기로 배치를 마칠 때마다 호출 (FALLBACK 크기로는 호출되지 않음) */
  function onSettled(w: number, h: number, rootX: number) {
    const box = outlineRef.current
    if (!box) return
    settled.current = true
    // 포커스가 바뀐 뒤 첫 배치: 들어가면 그 가지를 맞추고, 전체로 나오면 선택을 가운데로. (부모 이펙트는 이 콜백보다 늦게 돈다)
    if (settledRoot.current !== rootId) {
      settledRoot.current = rootId
      if (rootId) fitPending.current = true
      else centerAfter.current ??= selRef.current
    }
    const r = restorePending.current
    if (r) {
      restorePending.current = null
      fitPending.current = false
      return box.scrollTo(r.x, r.y)
    }
    if (centerAfter.current) {
      fitPending.current = false
      centerOn(centerAfter.current)
      centerAfter.current = null
      return
    }
    if (!fitPending.current) return
    fitPending.current = false
    box.scrollIntoView({ block: 'nearest' }) // 모바일: 아래쪽 개요 칸에서 가져오면 캔버스로 돌아온다
    const [cw, ch] = [box.clientWidth, box.clientHeight]
    if (w <= cw && h <= ch) return
    const next = clampZoom(Math.max(0.5, Math.min(1, (cw - 16) / w, (ch - 16) / h)))
    if (next === zoomRef.current) return centerRoot(rootX)
    // 레이아웃 이펙트 안이라 flushSync 불가: 배율이 반영된 뒤 아래 이펙트에서 페인트 전에 스크롤한다
    centerPending.current = rootX
    zoomRef.current = next
    setZoom(next)
  }
  useLayoutEffect(() => {
    if (centerPending.current === null) return
    centerRoot(centerPending.current)
    centerPending.current = null
  }, [zoom])

  const counts = useMemo(() => countTree(nodes ?? []), [nodes])
  const open = useMemo<Open>(() => (n, d) => !n.collapsed && (!viewDepth || d + 1 < viewDepth || reveal.has(n.id)), [viewDepth, reveal])

  const root = nodes?.find((n) => n.parentId === null)
  const top = (rootId && nodes?.find((n) => n.id === rootId)) || root
  const focused = !!top && top !== root
  const rows = useMemo(() => (nodes && top ? visibleRows(nodes, top, open) : []), [nodes, top, open])
  const shown = useMemo(() => new Set(rows.map((r) => r.node.id)), [rows])
  const byId = useMemo(() => mapOf(nodes ?? []), [nodes])
  // 선택이 숨겨지면(보기 깊이·접기·포커스 밖) 보이는 가장 가까운 조상을 선택으로 본다. 상태(selId)는 그대로 — 다시 보이면 돌아온다
  const sel = (shown.has(selId) ? byId.get(selId) : ancestorsOf(byId, selId).reverse().find((n) => shown.has(n.id))) ?? top
  // NodeRow 콜백은 이전 렌더의 것이 불릴 수 있다(memo) → 최신 보기 상태는 ref 로
  const viewRef = useRef({ open, depth: viewDepth, top: '' as ID })
  const selRef = useRef<ID>('')
  useLayoutEffect(() => {
    viewRef.current = { open, depth: viewDepth, top: top?.id ?? '' }
    selRef.current = sel?.id ?? ''
  })
  // U18: 선택·배율·깊이가 바뀔 때, 스크롤이 멈출 때, 떠날 때 저장
  const saveNow = () => {
    const box = outlineRef.current
    if (!settled.current || !box) return
    saveView(treeId, { sel: selRef.current, zoom: zoomRef.current, sx: Math.round(box.scrollLeft), sy: Math.round(box.scrollTop), depth: viewRef.current.depth, root: rootId ?? '' })
  }
  const saveRef = useRef(saveNow)
  useLayoutEffect(() => void (saveRef.current = saveNow))
  useEffect(() => void saveRef.current(), [sel?.id, zoom, viewDepth, rootId])
  useEffect(() => {
    const on = () => saveRef.current()
    addEventListener('pagehide', on)
    return () => (removeEventListener('pagehide', on), on())
  }, [])
  const scrollTimer = useRef(0)

  if (!nodes) return <p>불러오는 중…</p>
  if (!root) return <p>트리를 찾을 수 없습니다. <a href={href.trees()}>목록으로</a></p>

  const get = (id: ID) => nodesRef.current.find((n) => n.id === id)

  function persist(prev: TreeNode[], next: TreeNode[]) {
    const before = new Map(prev.map((n) => [n.id, n]))
    const ids = new Set(next.map((n) => n.id))
    const changed = next.filter((n) => before.get(n.id) !== n)
    const removed = prev.filter((n) => !ids.has(n.id)).map((n) => n.id)
    // 바로 시작: 겹치는 readwrite 트랜잭션은 IndexedDB 가 생성 순서대로 처리한다.
    // (앞 저장이 끝난 뒤 시작하도록 줄 세우면, 입력 직후 새로고침·닫기 시 뒤쪽 저장이 시작도 못 하고 사라진다)
    Promise.all([putNodes(changed), deleteNodes(removed)]).catch((e) => toast(`저장 실패: ${e}`))
  }
  /** label = 실행 취소 단계 이름, false = 실행 취소 대상 아님(접기·실시간 입력) */
  function commit(next: TreeNode[], label: string | false = '편집') {
    const prev = nodesRef.current
    if (next === prev) return
    persist(prev, next)
    if (label) {
      undoRef.current = [...undoRef.current.slice(-(UNDO_LIMIT - 1)), { ns: prev, label }]
      redoRef.current = []
    }
    nodesRef.current = next
    setNodes(next)
  }
  /** 실행 취소(redo=false)·다시 실행. 바뀐 곳을 선택·스크롤하고(숨겨져 있으면 펼침) 무엇을 했는지 알린다(U09) */
  function restore(redo: boolean) {
    const [from, to] = redo ? [redoRef, undoRef] : [undoRef, redoRef]
    const step = from.current.pop()
    if (!step) return toast(`${redo ? '다시 실행' : '실행 취소'}할 것이 없음`)
    const prev = nodesRef.current
    to.current.push({ ns: prev, label: step.label })
    persist(prev, step.ns)
    nodesRef.current = step.ns
    setNodes(step.ns)
    if (cutId && !step.ns.some((n) => n.id === cutId)) setCutId(null)
    const id = changedNode(prev, step.ns)
    if (id) jump(id)
    else if (!step.ns.some((n) => n.id === selId)) setSelId(topNode().id)
    toast(`${step.label} ${redo ? '다시 실행' : '되돌림'}`, undefined, 4000, true) // 떠 있는 [되돌리기] 토스트는 이제 무의미 → 대체
  }
  /** 토스트 [되돌리기]: 그 사이 다른 변경이 있으면 엉뚱한 단계를 되돌리지 않는다 */
  function undoIf(ns: TreeNode[]) {
    if (undoRef.current.at(-1)?.ns !== ns) return toast('실행 취소 버튼(Ctrl+Z)으로 되돌리세요')
    restore(false)
    toOutline()
  }

  // ---- 실시간 편집 (패널 제목·내용, 카드 내용): 입력마다 저장, 편집 1회 = 실행취소 1단계 ----
  function beginLive() {
    liveBase.current ??= nodesRef.current
  }
  function endLive() {
    const base = liveBase.current
    liveBase.current = null
    if (!base || base === nodesRef.current) return
    undoRef.current = [...undoRef.current.slice(-(UNDO_LIMIT - 1)), { ns: base, label: '편집' }]
    redoRef.current = []
  }
  const live = (id: ID, p: Partial<TreeNode>) => commit(patch(nodesRef.current, id, p), false)
  function startNoteEdit(id: ID) {
    setSelId(id)
    setNoteEditId(id)
  }
  const toOutline = () => outlineRef.current?.focus()
  /** 루트 또는 포커스 루트: 지우기·내어쓰기·형제 추가·순서 바꾸기 불가(C2) */
  const isTop = (n: TreeNode) => n.parentId === null || n.id === viewRef.current.top
  const topNode = () => get(viewRef.current.top) ?? root!
  /** 포커스 루트 기준 깊이 */
  const depthOf = (id: ID) => {
    const p = ancestorsOf(mapOf(nodesRef.current), id)
    return p.length - 1 - Math.max(0, p.findIndex((n) => n.id === viewRef.current.top))
  }
  /** 보기 깊이에 막힌 노드의 자식을 보이게 (collapsed 는 건드리지 않음) */
  const showKids = (...ids: ID[]) => setReveal((s) => (ids.every((id) => s.has(id)) ? s : new Set([...s, ...ids])))
  /** 접기 배지·H·↓: collapsed 와 보기 깊이를 함께 다룬다 */
  function setOpen(n: TreeNode, want: boolean) {
    const vd = viewRef.current.depth
    const byDepth = !!vd && depthOf(n.id) + 1 >= vd // 보기 깊이 때문에 닫히는 자리
    if (want) {
      if (n.collapsed) commit(patch(nodesRef.current, n.id, { collapsed: false }), false)
      if (byDepth) showKids(n.id)
    } else if (byDepth) setReveal((s) => new Set([...s].filter((x) => x !== n.id)))
    else commit(patch(nodesRef.current, n.id, { collapsed: true }), false)
  }
  const toggle = (n: TreeNode) => setOpen(n, !viewRef.current.open(n, depthOf(n.id)))
  /** 검색 결과로 이동(U16): 포커스 밖이면 포커스 해제, 조상 펼침(collapsed·보기 깊이), 선택, 가운데 */
  function jump(id: ID) {
    const ns = nodesRef.current
    const path = ancestorsOf(mapOf(ns), id)
    const outside = !path.some((n) => n.id === viewRef.current.top)
    const anc = path.slice(0, -1)
    const had = !outside && !!outlineRef.current?.querySelector(`[data-node-id="${CSS.escape(id)}"]`) // 옛 렌더 콜백(토스트)에서도 맞게 DOM 으로
    flushSync(() => {
      if (anc.some((n) => n.collapsed)) commit(ns.map((n) => (n.collapsed && anc.includes(n) ? { ...n, collapsed: false, updatedAt: Date.now() } : n)), false)
      showKids(...anc.map((n) => n.id))
      setSelId(id)
    })
    if (had) centerOn(id)
    else centerAfter.current = id // 새로 그려지는 카드: 배치가 끝난 뒤(onSettled)
    if (outside) location.hash = href.edit(treeId) // oxlint-disable-line react/immutability -- 이벤트(검색·실행 취소)에서만 불린다
  }

  // ---- 편집 모드 ----
  function startEdit(id: ID, text = get(id)?.title ?? '') {
    setSelId(id)
    editRef.current = id
    draftRef.current = text
    setEditId(id)
    setDraft(text)
  }
  function stopEdit() {
    editRef.current = null
    setEditId(null)
  }
  /** draft 를 저장. 비어 있으면 (루트·자식 있는 노드가 아니면) 노드를 지우고 false */
  function applyDraft(allowRemove: boolean): boolean {
    const id = editRef.current
    const n = id && get(id)
    if (!n) return false
    const title = draftRef.current.trim()
    if (title) {
      if (title !== n.title) commit(patch(nodesRef.current, n.id, { title }), '제목 편집')
      return true
    }
    const ns = nodesRef.current
    if (allowRemove && !isTop(n) && !childrenOf(ns, n.id).length) {
      const rows = visibleRows(ns, topNode(), viewRef.current.open)
      const i = rows.findIndex((r) => r.node.id === n.id)
      commit(ns.filter((x) => x.id !== n.id), '빈 항목 삭제')
      setSelId(rows[i - 1]?.node.id ?? topNode().id)
      return false
    }
    return true // 빈 제목은 무시하고 기존 제목 유지
  }
  function onEditKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (isComposing(e)) return // 한글 조합 중: 브라우저/IME 에 맡긴다 (글자 중복·유실 방지)
    if (e.key === 'Enter') {
      e.preventDefault()
      const id = editRef.current!
      if (!applyDraft(true) || isFull()) return stopEdit()
      const newId = insertBelow(id)
      startEdit(newId, '')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const id = editRef.current!
      if (draftRef.current.trim()) applyDraft(false)
      if (e.shiftKey) outdent(id)
      else indent(id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      applyDraft(true)
      stopEdit()
    }
  }
  function onBlurEdit(id: ID) {
    if (editRef.current !== id) return
    applyDraft(true)
    stopEdit()
  }

  // ---- 구조 편집 ----
  /** 노드 한도(CAP.nodesPerTree)면 토스트하고 true — 서버가 거부할 노드를 만들지 않는다 */
  function isFull(adding = 1): boolean {
    if (nodesRef.current.length + adding <= CAP.nodesPerTree) return false
    toast(FULL_MSG)
    return true
  }
  /** 형제로 아래에 삽입(루트·포커스 루트면 첫 자식). 새 id 반환 */
  function insertBelow(id: ID): ID {
    const n = get(id)!
    const ns = nodesRef.current
    const first = isTop(n)
    const nn = first ? newNode(treeId, n.id, (childrenOf(ns, n.id)[0]?.order ?? 1) - 1) : newNode(treeId, n.parentId!, orderAfter(ns, n))
    commit([...(first ? patch(ns, n.id, { collapsed: false }) : ns), nn], '추가')
    if (first) showKids(n.id)
    return nn.id
  }
  /** 직전 형제의 마지막 자식으로 */
  function indent(id: ID) {
    const n = get(id)!
    if (isTop(n) || n.parentId === null) return
    const ns = nodesRef.current
    const sib = childrenOf(ns, n.parentId)
    const prev = sib[sib.indexOf(n) - 1]
    if (!prev) return toast('첫 항목은 들여쓸 수 없음')
    commit(patch(patch(ns, prev.id, { collapsed: false }), n.id, { parentId: prev.id, order: nextOrder(ns, prev.id) }), '들여쓰기')
    showKids(prev.id)
  }
  /** 부모 바로 뒤 형제로 */
  function outdent(id: ID) {
    const n = get(id)!
    const parent = n.parentId ? get(n.parentId) : undefined
    if (!parent || parent.parentId === null || isTop(n)) return toast('더 내어쓸 수 없음')
    if (parent.id === viewRef.current.top) return toast('포커스 밖으로는 내어쓸 수 없음 · 전체 보기에서')
    const ns = nodesRef.current
    commit(patch(ns, n.id, { parentId: parent.parentId, order: orderAfter(ns, parent) }), '내어쓰기')
  }
  function moveSibling(id: ID, dir: -1 | 1) {
    const n = get(id)!
    if (isTop(n) || n.parentId === null) return
    const ns = nodesRef.current
    const sib = childrenOf(ns, n.parentId)
    const other = sib[sib.indexOf(n) + dir]
    if (!other) return
    commit(patch(patch(ns, n.id, { order: other.order }), other.id, { order: n.order }), '순서 바꾸기')
  }
  function removeSubtree(id: ID) {
    const n = get(id)!
    if (isTop(n)) return toast(n.parentId === null ? '루트는 지울 수 없음' : '포커스 루트는 지울 수 없음 · 전체 보기에서')
    const ns = nodesRef.current
    const sub = descendantsOf(ns, id)
    const gone = new Set([id, ...sub.map((x) => x.id)])
    const rows = visibleRows(ns, topNode(), viewRef.current.open)
    const i = rows.findIndex((r) => r.node.id === id)
    commit(ns.filter((x) => !gone.has(x.id)), `"${n.title}" 삭제`)
    haptic('warn')
    setSelId(rows[i - 1]?.node.id ?? topNode().id)
    if (cutId && gone.has(cutId)) setCutId(null)
    // 확인창 대신 되돌리기
    toast(`"${n.title}" 삭제${sub.length ? ` (하위 ${sub.length}개)` : ''}`, { label: '실행 취소', run: () => undoIf(ns) }, UNDO_MS)
  }
  /** 잘라낸 서브트리를 선택 노드의 마지막 자식으로 이동 (id 유지 → 학습 기록 보존) */
  function paste(targetId: ID) {
    if (!cutId) return toast('잘라낸 항목 없음 (Ctrl+X)')
    const ns = nodesRef.current
    if (targetId === cutId || descendantsOf(ns, cutId).some((d) => d.id === targetId))
      return toast('자기 하위에는 붙여넣기 불가')
    commit(patch(patch(ns, targetId, { collapsed: false }), cutId, { parentId: targetId, order: nextOrder(ns, targetId) }), '옮기기')
    showKids(targetId)
    setSelId(cutId)
    setCutId(null)
  }

  function cut(n: TreeNode) {
    if (isTop(n)) return toast(n.parentId === null ? '루트는 잘라낼 수 없음' : '포커스 루트는 잘라낼 수 없음')
    setCutId(n.id)
    haptic('warn')
    toast(coarse() ? '잘라냄 · 옮길 곳 선택 후 붙이기' : '잘라냄 · 대상 선택 후 Ctrl+V')
  }
  /** U26 가지 복제: 서브트리 사본(새 id)을 바로 아래 형제로. 실행 취소 1회 */
  function duplicate(id: ID) {
    const n = get(id)!
    if (isTop(n)) return toast(n.parentId === null ? '루트는 복제할 수 없음' : '포커스 루트는 복제할 수 없음')
    const ns = nodesRef.current
    if (isFull(1 + descendantsOf(ns, id).length)) return
    const copy = cloneBranch(ns, id, orderAfter(ns, n))
    commit([...ns, ...copy], `"${n.title}" 복제`)
    setSelId(copy[0].id)
    toast(`"${n.title}" 복제${copy.length > 1 ? ` (하위 ${copy.length - 1}개)` : ''}`, { label: '되돌리기', run: () => undoIf(ns) }, UNDO_MS)
  }
  /** 마지막 자식으로 새 노드를 만들고 제목 편집 (구조 바 +자식 — 키보드의 Enter 후 Tab) */
  function addChild(id: ID) {
    if (isFull()) return
    const ns = nodesRef.current
    const nn = newNode(treeId, id, nextOrder(ns, id))
    commit([...patch(ns, id, { collapsed: false }), nn], '추가')
    showKids(id)
    startEdit(nn.id, '')
  }

  // ---- 탐색 모드 ----
  function onNavKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || isComposing(e) || !sel) return
    const ctrl = e.ctrlKey || e.metaKey
    const hasKids = childrenOf(nodesRef.current, sel.id).length > 0
    let handled = true
    // 문자 단축키는 e.code 로 판정 → 한글 자판 상태에서도 동작
    if (!ctrl && !e.altKey && (e.code === 'Equal' || e.code === 'NumpadAdd')) zoomBy(1.2)
    else if (!ctrl && !e.altKey && (e.code === 'Minus' || e.code === 'NumpadSubtract')) zoomBy(1 / 1.2)
    else if (!ctrl && !e.altKey && (e.code === 'Digit0' || e.code === 'Numpad0')) zoomTo(1)
    else if (ctrl && e.code === 'KeyZ') restore(e.shiftKey)
    else if (ctrl && e.code === 'KeyY') restore(true)
    else if (ctrl && e.code === 'KeyX') cut(sel)
    else if (ctrl && e.code === 'KeyV') paste(sel.id)
    else if (ctrl) handled = false
    // 그래프 방향: ↑ 부모 · ↓ 첫 자식 · ←→ 형제 (plan G4)
    else if (e.altKey && e.key === 'ArrowLeft') moveSibling(sel.id, -1)
    else if (e.altKey && e.key === 'ArrowRight') moveSibling(sel.id, 1)
    else if (e.key === 'ArrowUp') {
      if (sel.parentId && !isTop(sel)) setSelId(sel.parentId)
    } else if (e.key === 'ArrowDown') {
      if (hasKids) {
        const first = childrenOf(nodesRef.current, sel.id)[0]
        if (!shown.has(first.id)) setOpen(sel, true)
        setSelId(first.id)
      }
    } else if (e.key === 'Home') setSelId(top!.id) // U19: 루트(포커스면 포커스 루트)
    else if (e.key === 'End') setSelId(rows[rows.length - 1].node.id) // 마지막 보이는 노드(전위 순서, R6-M6)
    else if (e.key === '.') centerOn(sel.id) // U15: 선택으로 이동
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // U19: 보이는 같은 깊이의 이웃 — 형제가 먼저, 형제 끝에서는 사촌으로(전위 순서라 형제 사이엔 더 깊은 줄만 있다)
      const d = rows.find((r) => r.node.id === sel.id)?.depth
      const same = rows.filter((r) => r.depth === d)
      const to = same[same.findIndex((r) => r.node.id === sel.id) + (e.key === 'ArrowLeft' ? -1 : 1)]
      if (to) setSelId(to.node.id)
    } else if (e.key === ' ' || e.key === 'F2') startEdit(sel.id)
    else if (e.key === 'Enter') {
      if (!isFull()) startEdit(insertBelow(sel.id), '')
    }
    // Tab 은 가로채지 않는다(U49: 키보드 트랩 금지). 자식 추가 = Enter 후 Tab(편집 중 들여쓰기)
    else if (e.code === 'KeyH' && !e.altKey && !e.shiftKey) {
      if (hasKids) toggle(sel)
    }
    else if (e.key === 'Delete') removeSubtree(sel.id)
    else if (e.key === 'Escape') {
      setCutId(null)
      document.getElementById(KEYS_ID)?.hidePopover()
    }
    else if (e.key === '?') document.getElementById(KEYS_ID)?.togglePopover()
    else handled = false
    if (handled) e.preventDefault()
  }

  // ---- 가져오기 / 내보내기 ----
  function importOutline(asRoot: boolean) {
    const items = parseOutline(importText)
    if (!items.length) return toast('가져올 항목 없음')
    const ns = nodesRef.current
    const target = asRoot ? root! : sel!
    const have = new Set(childrenOf(ns, target.id).map((n) => n.title))
    const list = asRoot ? [...items[0].children, ...items.slice(1)] : items
    const added = outlineToNodes(list, treeId, target.id, nextOrder(ns, target.id))
    if (isFull(added.length)) return
    const rootTitle = asRoot ? splitTitle(items[0].text) : null
    // 긴 루트 제목의 나머지·`:: 메모`(C6)는 기존 메모 앞에 붙인다(C5)
    const rootMemo = [rootTitle?.note, asRoot ? items[0].note : undefined].filter(Boolean)
    const rootNote = rootMemo.length ? { note: [...rootMemo, target.note].filter(Boolean).join('\n') } : {}
    const base = patch(ns, target.id, rootTitle ? { title: rootTitle.title, collapsed: false, ...rootNote } : { collapsed: false })
    const long = added.filter((n) => n.title.length === CAP.title && n.note !== undefined).length + (rootTitle?.note !== undefined ? 1 : 0)
    if (added.length) fitPending.current = true // 통째로 들어온 트리는 진입과 같게 맞춘다
    const count = added.length + (asRoot ? 1 : 0)
    // U11: 같은 개요를 두 번 붙이는 실수 — 최상위 항목만 기존 자식 제목과 비교(R4-A3)
    const dup = added.filter((n) => n.parentId === target.id && have.has(n.title)).length
    commit([...base, ...added], `가져오기 ${count}개`)
    showKids(target.id)
    void logEvent('outline_imported', { nodeCount: count }, treeId)
    setImportText('')
    toast(
      `${count}개 추가${dup ? ` · 최상위 중복 ${dup}개` : ''}${long ? ` · 긴 제목 ${long}개를 잘라 메모로 옮겼습니다` : ''}`,
      { label: '되돌리기', run: () => undoIf(ns) },
      UNDO_MS,
    )
  }
  function copyText(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast('개요 복사됨'),
      () => toast('직접 복사하세요'),
    )
  }
  function exportOutline() {
    const text = serializeOutline(nodesToOutline(nodesRef.current, root!.id, true))
    setExportText(text)
    copyText(text)
  }

  /** 드래그로 옮긴 위치를 모두 지운다 (실행취소 가능) */
  function autoArrange() {
    const ns = nodesRef.current
    if (!ns.some((n) => n.offset)) return
    commit(ns.map((n) => (n.offset ? { ...n, offset: undefined, updatedAt: Date.now() } : n)), '자동 정렬')
  }
  function pickDepth(d: number) {
    setViewDepth(d)
    setReveal(new Set())
    fitPending.current = true // 깊이를 바꾸면 보이는 만큼 다시 맞춘다(넘칠 때만)
  }
  const cur = sel!
  const selPath = ancestorsOf(byId, cur.id)
  const panelPath = selPath.slice(Math.max(0, selPath.findIndex((n) => n.id === top!.id)))

  // ---- U23 구조 바(coarse 전용, CSS 로 표시): 키보드 함수를 그대로 부른다. 포커스 루트 규칙(C2)은 함수가 지키고, 버튼은 미리 막는다 ----
  const atTop = cur.id === top!.id
  const [at, of] = atTop ? [1, 1] : counts.pos(cur.id)
  const kids = counts.hasKids(cur.id)
  const opened = open(cur, rows.find((r) => r.node.id === cur.id)?.depth ?? 0)
  function act(k: string) {
    // 편집 중이면 Esc 처럼 먼저 끝낸다(제목 저장, 빈 새 항목은 지워짐). 입력칸 blur 는 한 틱 늦어 기다리지 않는다
    if (editRef.current) {
      applyDraft(true)
      stopEdit()
    }
    toOutline()
    const n = get(cur.id)
    if (!n) return
    if (k === 'child') addChild(n.id)
    else if (k === 'sib') { if (!isFull()) startEdit(insertBelow(n.id), '') }
    else if (k === 'up' || k === 'down') moveSibling(n.id, k === 'up' ? -1 : 1)
    else if (k === 'outdent') outdent(n.id)
    else if (k === 'indent') indent(n.id)
    else if (k === 'paste') paste(n.id)
    else if (k === 'cut') cut(n)
    else if (k === 'del') removeSubtree(n.id)
    else if (k === 'fold') toggle(n)
    else restore(k === 'redo')
  }
  const tools: [key: string, label: string, icon: string, disabled?: boolean][] = [
    ['child', '자식 추가', cornerDownRight],
    ['sib', '아래에 형제 추가', I.plus, atTop],
    ['up', '위로 옮기기', ICON.up, at === 1],
    ['down', '아래로 옮기기', ICON.down, at === of],
    ['outdent', '내어쓰기', ICON.outdent, atTop || cur.parentId === top!.id],
    ['indent', '들여쓰기', ICON.indent, at === 1],
    cutId ? ['paste', '여기에 붙이기', clipboardPaste] : ['cut', '잘라내기', ICON.scissors, atTop],
    ['del', '삭제', I.trash2, atTop],
    ['fold', opened ? '접기' : '펼치기', opened ? ICON.fold : ICON.unfold, !kids],
    ['undo', '실행 취소', undo2],
    ['redo', '다시 실행', ICON.redo],
  ]
  const struct = (
    <div className="struct" role="toolbar" aria-label="구조 편집">
      {tools.map(([k, label, icon, disabled]) => (
        <button key={k} type="button" aria-label={label} data-tip={label} disabled={disabled} aria-pressed={k === 'paste' || undefined} onClick={() => act(k)}>
          <Icon d={icon} size={20} />
        </button>
      ))}
    </div>
  )
  // U11·R4-A12: '첫 줄을 루트로' 는 루트만 있는 트리에서만(제목 덮어쓰기). 포커스 중엔 없음
  const asRootOk = !focused && nodes.length === 1
  function openImport() {
    flushSync(() => setIoOpen(true))
    document.querySelector<HTMLTextAreaElement>('textarea[aria-label="개요 텍스트"]')?.focus()
  }

  const header = focused && (
    <>
      <NodePath path={ancestorsOf(byId, top!.id)} label="포커스 위치" onPick={(id) => (location.hash = href.edit(treeId, id === root.id ? undefined : id))} />
      <a className="focus-all" href={href.edit(treeId)}>전체 보기</a>
    </>
  )
  return (
    <section className="editor">
      <TreeHeader treeId={treeId} active="edit" title={root.title} rootId={focused ? top!.id : undefined} sub={header} />
      <div className="canvas">
      {struct}
      <div
        className="outline"
        role="tree"
        aria-label="아웃라이너"
        aria-activedescendant={`node-${cur.id}`}
        tabIndex={0}
        ref={outlineRef}
        onKeyDown={onNavKey}
        onScroll={() => (clearTimeout(scrollTimer.current), (scrollTimer.current = window.setTimeout(() => saveRef.current(), 300)))}
      >
        <GraphView
          zoom={zoom}
          nodes={nodes}
          rootId={top!.id}
          open={open}
          onZoomAt={zoomTo}
          onSettled={onSettled}
          onMove={(id, offset) => commit(patch(nodesRef.current, id, { offset }), '위치 조정')}
          renderNode={(n, box, m) => {
            const [pos, setSize] = n.id === top!.id ? [1, 1] : counts.pos(n.id)
            return (
              <NodeRow
                key={n.id}
                node={n}
                depth={box.depth}
                x={box.x}
                y={box.y}
                hasChildren={counts.hasKids(n.id)}
                pos={pos}
                setSize={setSize}
                hiddenCount={open(n, box.depth) ? 0 : counts.desc(n.id)}
                selected={n.id === cur.id}
                cut={n.id === cutId}
                heat={missHeat(srs.get(n.id))}
                miss={srs.get(n.id)?.miss ?? 0}
                still={m.still}
                lifted={m.lifted}
                spawn={m.spawn}
                draft={n.id === editId ? draft : null}
                onDraft={(v) => ((draftRef.current = v), setDraft(v))}
                onEditKey={onEditKey}
                onBlurEdit={() => onBlurEdit(n.id)}
                onSelect={() => setSelId(n.id)}
                onStartEdit={() => startEdit(n.id)}
                onStartNoteEdit={() => startNoteEdit(n.id)}
                onToggle={() => toggle(n)}
                onWidth={(width) => commit(patch(nodesRef.current, n.id, { width }), '너비')}
                noteEditor={
                  n.id === noteEditId && (
                    <NoteEditor
                      label="노드 내용"
                      value={n.note ?? ''}
                      onChange={(note) => live(n.id, { note })}
                      ref={cardNote}
                      autoFocus
                      onFocus={beginLive}
                      onBlur={() => (endLive(), setNoteEditId(null))}
                      onEscape={toOutline}
                    />
                  )
                }
              />
            )
          }}
        />
      </div>
      {searching && (
        <SearchBox
          nodes={nodes}
          byId={byId}
          onPick={(id) => (setSearching(false), jump(id), toOutline())}
          onClose={() => (setSearching(false), toOutline())}
        />
      )}
      <div className="zoom-tools">
        <span className="zoom-group depth-group" role="group" aria-label="보기 깊이">
          {DEPTHS.map((d) => (
            <button key={d} type="button" aria-label={d ? `깊이 ${d}까지 보기` : '모두 보기'} data-tip={d ? `깊이 ${d}까지` : '모두 보기'} aria-pressed={viewDepth === d} onClick={() => pickDepth(d)}>
              {d || '∞'}
            </button>
          ))}
        </span>
        <span className="zoom-group" role="group" aria-label="확대·축소">
          <button type="button" aria-label="축소" data-tip="축소 (-)" onClick={() => zoomBy(1 / 1.2)}><Icon d={zoomOut} size={20} /></button>
          <button type="button" className="zoom-reset" data-tip="100%로 (0)" onClick={() => zoomTo(1)}>
            <output className="tnum" aria-label="배율">{Math.round(zoom * 100)}%</output>
          </button>
          <button type="button" aria-label="확대" data-tip="확대 (=)" onClick={() => zoomBy(1.2)}><Icon d={zoomIn} size={20} /></button>
        </span>
        <button type="button" aria-label="화면 맞춤" data-tip="화면 맞춤" onClick={fitZoom}><Icon d={maximize} size={20} /></button>
        {nodes.some((n) => n.offset) && (
          <button type="button" className="arrange" aria-label="자동 정렬" data-tip="자동 정렬" onClick={autoArrange}><Icon d={network} size={20} /></button>
        )}
        <button type="button" aria-label="검색" data-tip="검색 (/)" aria-expanded={searching} onMouseDown={(e) => e.preventDefault()} onClick={() => setSearching((v) => !v)}><Icon d={search} size={20} /></button>
        <button type="button" aria-label="단축키" data-tip="단축키 (?)" popoverTarget={KEYS_ID}><Icon d={keyboard} size={20} /></button>
      </div>
      </div>
      <aside className="side">
        <DetailPanel
          key={cur.id}
          node={cur}
          path={<NodePath path={panelPath} label="선택 위치" onPick={setSelId} />}
          focusHref={cur.id !== top!.id && counts.hasKids(cur.id) ? href.edit(treeId, cur.id) : undefined}
          titleDraft={editId === cur.id ? draft : null}
          api={panelNote}
          onLive={(p) => live(cur.id, p)}
          onBegin={beginLive}
          onEnd={endLive}
          onEscape={toOutline}
          onWidth={(width) => width !== (cur.width ?? 1) && commit(patch(nodesRef.current, cur.id, { width }), '너비')}
          onFormat={(op) => (noteEditId === cur.id ? cardNote : panelNote).current?.apply(op)}
          onImport={openImport}
          onAliases={(aliases) => commit(patch(nodesRef.current, cur.id, { aliases }), '별칭')}
          onDuplicate={cur.id !== top!.id ? () => duplicate(cur.id) : undefined}
          onExport={() => copyText(serializeOutline(nodesToOutline(nodesRef.current, cur.id, true)))}
        />
        <details className="io" open={ioOpen} onToggle={(e) => setIoOpen(e.currentTarget.open)}>
          <summary><Icon d={clipboardPaste} />개요 붙여넣기 · 내보내기</summary>
          <textarea
            aria-label="개요 텍스트"
            rows={narrow() ? 3 : 5}
            value={importText}
            placeholder={'들여쓰기 목차를 붙여넣으세요 (탭·스페이스, -, 1., 가., ①, # 허용 · 제목 :: 메모)\n노동법\n  개별적 근로관계법\n    근로계약 :: 근로자와 사용자의 합의'}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="io-actions">
            <button type="button" onClick={() => importOutline(false)}>선택 노드의 자식으로 추가</button>
            {asRootOk && <button type="button" onClick={() => importOutline(true)}>첫 줄을 루트로</button>}
            <button type="button" onClick={exportOutline}>개요 내보내기</button>
          </div>
          {exportText && (
            // I7: readonly textarea 는 접고, 복사 버튼으로 대신한다
            <div className="io-export">
              <button type="button" onClick={() => copyText(exportText)}><Icon d={copy} />복사</button>
              <details>
                <summary>내보낸 개요</summary>
                <textarea aria-label="내보낸 개요" readOnly rows={5} value={exportText} />
              </details>
            </div>
          )}
        </details>
      </aside>
      <div id={KEYS_ID} className="keys" popover="auto">
        <dl>
          {KEYS.map(([k, v]) => (
            <div key={v}>
              <dt>{k.split(' ').map((x) => <kbd key={x}>{x}</kbd>)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

const KEYS_ID = 'editor-keys'
/** 구조 바 아이콘 (Lucide 1.70.0, ISC — ui/icons.all 에 없는 것만) */
const ICON = {
  up: '<path d="m5 12 7-7 7 7" /><path d="M12 19V5" />',
  down: '<path d="M12 5v14" /><path d="m19 12-7 7-7-7" />',
  indent: '<path d="M21 5H11" /><path d="M21 12H11" /><path d="M21 19H11" /><path d="m3 8 4 4-4 4" />',
  outdent: '<path d="M21 5H11" /><path d="M21 12H11" /><path d="M21 19H11" /><path d="m7 8-4 4 4 4" />',
  scissors: '<circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12" /><path d="M20 4 8.12 15.88" /><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" />',
  fold: '<path d="m7 20 5-5 5 5" /><path d="m7 4 5 5 5-5" />',
  unfold: '<path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />',
  copyPlus: '<line x1="15" x2="15" y1="12" y2="18" /><line x1="12" x2="18" y1="15" y2="15" /><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
  redo: '<path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />',
}
/** 단축키 팝오버: [키(공백 = 여러 키), 2~3단어 동작] */
const KEYS: [string, string][] = [
  ['↑ ↓', '부모 · 첫 자식'],
  ['← →', '형제 · 사촌 이동'],
  ['Alt+← Alt+→', '순서 바꾸기'],
  ['Space F2', '제목 편집'],
  ['Enter', '형제 추가'],
  ['Enter Tab', '자식 추가 (차례로)'],
  ['Tab Shift+Tab', '편집 중 들여·내어쓰기'],
  ['H', '접기 · 펼치기'],
  ['Delete', '삭제'],
  ['Ctrl+X Ctrl+V', '잘라내기 · 붙여넣기'],
  ['Ctrl+Z', '실행 취소'],
  ['Ctrl+Shift+Z', '다시 실행'],
  ['- = 0', '축소 · 확대 · 100%'],
  ['Shift+H', '형광펜'],
  ['Home End', '처음 · 마지막'],
  ['/', '검색'],
  ['.', '선택으로 이동'],
  ['Esc', '편집 끝내기'],
]

const TOOLS: { op: NoteOp; label: string; icon: string }[] = [
  { op: 'bullet', label: '불릿', icon: list },
  { op: 'p', label: '형광펜 분홍', icon: highlighter },
  { op: 'y', label: '형광펜 노랑', icon: highlighter },
  { op: 'b', label: '형광펜 하늘', icon: highlighter },
  { op: 'clear', label: '형광펜 지우기', icon: eraser },
]

function DetailPanel({ api, ...p }: {
  node: TreeNode
  /** 카드에서 제목 편집 중이면 그 입력값 — 패널에 실시간 표시 */
  titleDraft: string | null
  api: React.RefObject<NoteApi | null>
  onLive: (p: Partial<TreeNode>) => void
  onBegin: () => void
  onEnd: () => void
  onEscape: () => void
  onWidth: (w: 1 | 2 | 3) => void
  onFormat: (op: NoteOp) => void
  /** 제목 위 경로(포커스 루트부터, U15·U51) */
  path: React.ReactNode
  /** '이 가지만 보기' 링크(포커스 루트·잎이면 없음) */
  focusHref?: string
  /** 개요 붙여넣기 칸 열고 포커스(R4-A17) */
  onImport: () => void
  onAliases: (aliases: string[]) => void
  /** U26 가지 복제(포커스 루트·루트면 없음) · 이 가지 내보내기 */
  onDuplicate?: () => void
  onExport: () => void
}) {
  const [title, setTitle] = useState<string | null>(null) // 입력 중일 때만 로컬 값 (빈 제목은 저장하지 않음)
  const width = p.node.width ?? 1
  return (
    <div className="detail">
      <div className="detail-path">
        {p.path}
        {p.focusHref && <a className="focus-here" href={p.focusHref}>이 가지만 보기</a>}
        {p.onDuplicate && <button type="button" className="to-import" aria-label="가지 복제" data-tip="가지 복제" onClick={p.onDuplicate}><Icon d={ICON.copyPlus} /></button>}
        <button type="button" className="to-import" aria-label="이 가지 내보내기" data-tip="이 가지 내보내기 (개요 복사)" onClick={p.onExport}><Icon d={copy} /></button>
        <button type="button" className="to-import" aria-label="개요 붙여넣기 열기" data-tip="개요 붙여넣기" onClick={p.onImport}><Icon d={clipboardPaste} /></button>
      </div>
      <input
        className="detail-title"
        aria-label="패널 제목"
        placeholder="제목"
        maxLength={CAP.title}
        value={title ?? p.titleDraft ?? p.node.title}
        onFocus={(e) => (setTitle(p.node.title), p.onBegin(), ensureVisible(e.currentTarget))}
        onChange={(e) => {
          setTitle(e.target.value)
          const t = e.target.value.trim()
          if (t && t !== p.node.title) p.onLive({ title: t })
        }}
        onBlur={() => (setTitle(null), p.onEnd())}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') p.onEscape()
        }}
      />
      <Aliases value={p.node.aliases} onChange={p.onAliases} />
      <div className="toolbar" role="toolbar" aria-label="내용 서식">
        {TOOLS.map((t) => (
          <button
            key={t.op}
            type="button"
            className={`tool tool-${t.op}`}
            aria-label={t.label}
            data-tip={t.op === 'bullet' ? '불릿 (- )' : t.op === 'clear' ? t.label : `${t.label} (Shift+H)`}
            onMouseDown={(e) => e.preventDefault()} // 편집기의 선택·포커스 유지
            onClick={() => p.onFormat(t.op)}
          >
            <Icon d={t.icon} size={20} />
          </button>
        ))}
        <span className="widths" role="group" aria-label="너비">
          {([1, 2, 3] as const).map((w) => (
            <button key={w} type="button" aria-label={`너비 ${w}단계`} data-tip={`너비 ${w}단계`} aria-pressed={width === w} onClick={() => p.onWidth(w)}>
              {w}
            </button>
          ))}
        </span>
      </div>
      <NoteEditor
        label="패널 내용"
        placeholder="내용"
        value={p.node.note ?? ''}
        onChange={(note) => p.onLive({ note })}
        ref={api}
        onFocus={p.onBegin}
        onBlur={p.onEnd}
        onEscape={p.onEscape}
      />
    </div>
  )
}

/** 서버 map.ts LIMITS 와 같은 값: 별칭 50개, 각 50자 — 넘기 전에 막는다 */
const ALIAS_MAX = 50
/** U28 별칭 칩(C5 aliases): Enter·쉼표로 추가, × 로 삭제. 채점은 기존 별칭 비교가 쓴다 */
function Aliases({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('')
  function add(raw: string) {
    const next = [...value]
    for (const a of raw.split(',').map((s) => s.trim().slice(0, ALIAS_MAX)))
      if (a && !next.includes(a) && next.length < ALIAS_MAX) next.push(a)
    if (next.length !== value.length) onChange(next)
    if (next.length >= ALIAS_MAX) toast(`별칭은 ${ALIAS_MAX}개까지입니다`)
    setText('')
  }
  return (
    <div className="aliases" role="group" aria-label="별칭">
      {value.map((a) => (
        <span key={a} className="alias-chip">
          {a}
          <button type="button" aria-label={`별칭 ${a} 삭제`} onClick={() => onChange(value.filter((v) => v !== a))}><Icon d={x} size={16} /></button>
        </span>
      ))}
      <input
        aria-label="별칭 추가"
        placeholder={value.length ? '별칭 추가' : '별칭 (Enter·쉼표로 추가)'}
        maxLength={ALIAS_MAX}
        value={text}
        disabled={value.length >= ALIAS_MAX}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
        onBlur={() => text.trim() && add(text)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter') { e.preventDefault(); add(text) }
        }}
      />
    </div>
  )
}

/** '/' 검색(U16): 제목 부분 일치, 각 줄에 경로. ↑↓ 고르기 · Enter 이동 · Esc 닫기 */
function SearchBox({ nodes, byId, onPick, onClose }: { nodes: TreeNode[]; byId: ReadonlyMap<ID, TreeNode>; onPick: (id: ID) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const res = useMemo(() => searchNodes(nodes, q), [nodes, q])
  const at = Math.min(i, res.length - 1)
  return (
    <div className="search" role="search">
      <input
        autoFocus
        role="combobox"
        aria-label="노드 검색"
        aria-expanded={res.length > 0}
        aria-controls="editor-search-results"
        aria-activedescendant={res[at] ? `sr-${res[at].id}` : undefined}
        placeholder="제목 검색"
        value={q}
        onChange={(e) => (setQ(e.target.value), setI(0))}
        onBlur={onClose}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (res.length) setI((at + (e.key === 'ArrowDown' ? 1 : -1) + res.length) % res.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (res[at]) onPick(res[at].id)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      {q.trim() && (
        <ul id="editor-search-results" role="listbox" aria-label="검색 결과">
          {res.map((n, k) => (
            <li
              key={n.id}
              id={`sr-${n.id}`}
              role="option"
              aria-selected={k === at}
              onMouseDown={(e) => e.preventDefault()} // 입력칸 blur(닫힘) 전에 클릭을 받는다
              onClick={() => onPick(n.id)}
            >
              <span className="search-title">{n.title}</span>
              <NodePath path={ancestorsOf(byId, n.id).slice(0, -1)} skipRoot label="경로" />
            </li>
          ))}
          {!res.length && <li className="search-none">찾는 제목이 없습니다</li>}
          {res.length >= SEARCH_LIMIT && <li className="search-none">처음 {SEARCH_LIMIT}개만 보입니다</li>}
        </ul>
      )}
    </div>
  )
}
