import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { logEvent } from '../../core/events'
import { cloneBranch, nodesToOutline, outlineToNodes, parseOutline, serializeOutline, splitTitle } from '../../core/outline'
import { childIndex, childrenOf, deleteNodes, descendantsOf, getTreeNodes, putNodes } from '../../core/repo'
import { getSrsMap, missHeat } from '../../core/srs'
import { ancestorsOf } from '../../core/path'
import { CAP, type ID, type NodeSrs, type TreeNode } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { NodePath } from '../../ui/NodePath'
import { Sheet } from '../../ui/Sheet'
import { arrowDown, arrowUp, clipboardPaste, copy, copyPlus, cornerDownRight, eraser, foldVertical, highlighter, indentDecrease, indentIncrease, keyboard, list, listTree, network, redo2, scissors, search, sparkles, unfoldVertical, zoomIn, zoomOut } from '../../ui/icons.all'
import NodeRow from './NodeRow'
import NoteEditor, { type NoteApi, type NoteOp } from './content/NoteEditor'
import GraphView from './graph/GraphView'
import { isOpen, type Dir } from './graph/layout'
import { clampZoom, useZoom } from './graph/useZoom'
import { searchNodes, SEARCH_LIMIT } from './search'
import { changedNode, isComposing } from './edit'
import TreeHeader from '../TreeHeader'
import { hint, toast } from '../Toast'
import { haptic } from '../feel'
import { ensureVisible, startViewport, subscribeViewport } from '../viewport'
import './editor.css'

const UNDO_LIMIT = 50
const UNDO_MS = 10_000 // 노드 삭제 되돌리기(02 §3.5: 트리 삭제와 같은 10초)
// 좁은 화면(760px): 카드 폭 단계(NodeRow)·개요 칸 줄 수. 카드마다 구독하지 않고 여기서 1회 구독해 prop 으로 내린다(r3 L3)
const narrowMq = matchMedia('(max-width: 760px)')
const subscribeNarrow = (cb: () => void) => {
  narrowMq.addEventListener('change', cb)
  return () => narrowMq.removeEventListener('change', cb)
}
const coarse = () => matchMedia('(pointer: coarse)').matches

// ---- 순수 트리 연산 (노드 배열은 불변으로 다룬다: 바뀐 노드만 새 객체) ----
const patch = (ns: TreeNode[], id: ID, p: Partial<TreeNode>) =>
  ns.map((n) => (n.id === id ? { ...n, ...p, updatedAt: Date.now() } : n))
const nextOrder = (ns: TreeNode[], parentId: ID) => {
  const k = childrenOf(ns, parentId)
  return k.length ? k[k.length - 1].order + 1 : 0
}
/** 형제를 sib 순서대로 0..n 재번호(E6: 중간값이 안 나오거나 order 가 같을 때). 바뀐 노드만 새 객체 */
const renumber = (ns: TreeNode[], sib: TreeNode[]) => {
  const at = new Map(sib.map((s, k) => [s.id, k]))
  return ns.map((n) => {
    const k = at.get(n.id)
    return k === undefined || n.order === k ? n : { ...n, order: k, updatedAt: Date.now() }
  })
}
/** node 바로 뒤 형제 자리의 order (types.ts 규약: 중간값). 중간값이 이웃 사이에 엄밀히 안 들어가면(부동소수 한계·동률) 형제를 재번호한 배열과 i+0.5 */
const orderAfter = (ns: TreeNode[], node: TreeNode): [TreeNode[], number] => {
  const sib = childrenOf(ns, node.parentId!)
  const i = sib.indexOf(node)
  const next = sib[i + 1]
  if (!next) return [ns, node.order + 1]
  const mid = (node.order + next.order) / 2
  return mid > node.order && mid < next.order ? [ns, mid] : [renumber(ns, sib), i + 0.5]
}
/** 그 방향에서 손으로 옮긴 위치가 있는가 (C1: down = x·y, right = vx·vy) */
const moved = (n: TreeNode, d: Dir) => !!(d === 'right' ? n.offset?.vx || n.offset?.vy : n.offset?.x || n.offset?.y)
/** 그 방향의 위치만 지운 offset. 두 방향 모두 비면 undefined */
function clearOffset(o: NonNullable<TreeNode['offset']>, d: Dir): TreeNode['offset'] {
  if (d === 'right') return o.x || o.y ? { x: o.x, y: o.y } : undefined
  return o.vx || o.vy ? { x: 0, y: 0, vx: o.vx, vy: o.vy } : undefined
}
type Open = (n: TreeNode, depth: number) => boolean
/** 화면에 그려지는 노드(전위 순서). open = 접기 + 보기 깊이(C3), depth 는 root(포커스 루트) 기준. O(n) */
const visibleRows = (ns: TreeNode[], root: TreeNode, open: Open = isOpen) => {
  const out: { node: TreeNode; depth: number }[] = []
  const kids = childIndex(ns)
  const walk = (n: TreeNode, depth: number) => {
    out.push({ node: n, depth })
    if (open(n, depth)) for (const k of kids.get(n.id) ?? []) walk(k, depth + 1)
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
/** E14: 가져오기 칸에 그대로 붙일 수 있는 개요를 AI 에게 요청하는 고정 문구 */
const AI_PROMPT = `다음 주제를 공부용 트리(개요)로 정리해 주세요.
형식 규칙:
- 들여쓰기 개요만 출력합니다(설명·머리말 없이). 한 단계 = 공백 2칸.
- 첫 줄은 주제(루트), 그 아래로 큰 갈래 → 세부 개념 순서로 3~4단계.
- 각 줄은 짧은 제목 하나. 필요하면 " :: " 뒤에 한 줄 메모를 붙입니다. 예) 근로계약 :: 근로자와 사용자의 합의
- 번호·기호·마크다운은 쓰지 않습니다.

주제: `
/** 노드별 자식 유무·하위 수·형제 위치를 한 번에 계산 (O(n log n)). 노드마다 childrenOf/descendantsOf 를 부르면 O(n²) */
function countTree(ns: TreeNode[]) {
  const kids = childIndex(ns)
  kids.delete(null)
  const pos = new Map<ID, [number, number]>()
  for (const k of kids.values()) k.forEach((n, i) => pos.set(n.id, [i + 1, k.length]))
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
// 그래프 방향(세로 보기) — 기기별 선호, 모든 트리 공통
const DIR_KEY = 'dd:editor-dir'
const loadDir = (): Dir => { try { return localStorage.getItem(DIR_KEY) === 'right' ? 'right' : 'down' } catch { return 'down' } }
const saveDir = (d: Dir) => { try { localStorage.setItem(DIR_KEY, d) } catch { /* 저장 못 해도 이번 화면은 바뀐다 */ } }
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
  const narrow = useSyncExternalStore(subscribeNarrow, () => narrowMq.matches)
  const [cutId, setCutId] = useState<ID | null>(null)
  const [ioOpen, setIoOpen] = useState(false) // 개요 붙여넣기 · 내보내기 시트. 루트만 있는 트리에 들어오면 자동으로 1회 연다(A2)
  const [importText, setImportText] = useState('')
  const [exportText, setExportText] = useState('')
  // 핸들러가 같은 이벤트 안에서 여러 번 commit 해도 최신 상태를 보도록 ref 를 기준으로 삼는다
  const nodesRef = useRef<TreeNode[]>([])
  const editRef = useRef<ID | null>(null)
  const noteRef = useRef<ID | null>(null) // noteEditId 의 ref 판 — dd:remote 리스너가 의존성 없이 읽는다
  const draftRef = useRef('')
  const undoRef = useRef<Step[]>([])
  const redoRef = useRef<Step[]>([])
  const outlineRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLTextAreaElement>(null)
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
    if (!loaded) return
    // 진입 즉시 키보드로 편집 가능. 개요 시트가 자동으로 열렸으면 캔버스 대신 시트 입력칸(터치는 키보드가 튀어나오므로 시트 기본 포커스)
    if (!ioOpen) outlineRef.current?.focus()
    else if (!coarse()) importRef.current?.focus()
  }, [loaded]) // oxlint-disable-line react-hooks/exhaustive-deps -- 진입 1회: ioOpen 은 nodes 와 같은 배치에서 정해진다
  // 동기화 엔진이 pull 뒤 쏘는 dd:remote{treeIds}: 내 트리면 노드·학습 기록을 다시 읽어 교체한다(E16).
  // undo/redo 스택은 비운다(E2: 옛 스냅샷으로 되돌리면 다른 기기가 추가한 노드가 지워진다).
  // 편집 중인 노드(카드 제목·카드 내용·패널 live)는 로컬 값을 유지해 입력칸을 덮지 않는다. 편집 상태는 ref 로 읽어 리스너를 다시 붙이지 않는다(r3 L2).
  useEffect(() => {
    const onRemote = (e: Event) => {
      if (!(e as CustomEvent<{ treeIds: string[] }>).detail?.treeIds?.includes(treeId)) return
      const keep = new Set([editRef.current, noteRef.current, liveBase.current ? selRef.current : null])
      getSrsMap(treeId).then(setSrs)
      getTreeNodes(treeId).then((remote) => {
        const local = new Map(nodesRef.current.map((n) => [n.id, n]))
        const next = remote.map((n) => (keep.has(n.id) && local.get(n.id)) || n)
        undoRef.current = []
        redoRef.current = []
        nodesRef.current = next
        // r3 H1: 실시간 편집 중이면 시작 스냅샷도 원격 반영 뒤 배열로 — endLive 가 원격 이전 배열을 undo 에 넣고 Ctrl+Z 가 다른 기기 노드를 지우는 경로 차단
        if (liveBase.current) liveBase.current = next
        setNodes(next)
        setSelId((id) => (next.some((n) => n.id === id) ? id : (next.find((n) => n.parentId === null)?.id ?? '')))
        setCutId((id) => (id && next.some((n) => n.id === id) ? id : null))
      })
    }
    addEventListener('dd:remote', onRemote)
    return () => removeEventListener('dd:remote', onRemote)
  }, [treeId])
  // 키보드(--kb)·시각 뷰포트 추적. 키보드가 열리면 단축키 시트는 닫는다(02 규칙 4(b))
  useEffect(() => {
    startViewport()
    if (coarse()) hint('editor', '카드 두 번 탭 = 제목') // 1회성 힌트
    return subscribeViewport((v) => {
      if (v.open) document.getElementById(KEYS_ID)?.hidePopover()
    })
  }, [])
  // '/' 또는 Ctrl/⌘+K = 검색 (입력 중이 아닐 때, E13). Ctrl+F 는 브라우저 찾기 그대로
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey
      const k = e.code === 'KeyK' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
      if ((!slash && !k) || e.isComposing) return
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

  // ---- 확대·축소: 버튼, 휠, 핀치, 탐색 모드 키 - = 0 (graph/useZoom, 계약 C2) ----
  const { zoom, zoomRef, setZoom, zoomTo, zoomBy, fit, centerOn } = useZoom(outlineRef, sameRoot && saved.zoom ? saved.zoom : 1, loaded)

  // ---- 자동 맞춤(R8): 보이는 카드 집합(또는 방향)이 바뀌어 배치가 끝날 때마다 전체가 보이는 배율(≤100%, 하한 clampZoom)로 맞추고 선택을 가운데에.
  // 입력·드래그·너비 변경은 집합이 그대로라 GraphView 가 onSettled 를 부르지 않는다 ----
  const restorePending = useRef(sameRoot && typeof saved.sx === 'number' ? { x: saved.sx, y: saved.sy ?? 0 } : null)
  const [dir, setDir] = useState<Dir>(loadDir)
  const dirRef = useRef(dir) // 콜백(키)이 최신 방향을 읽는다 — 바꿀 때 flipDir 이 함께 갱신
  const flipDir = () => {
    const d: Dir = dirRef.current === 'right' ? 'down' : 'right'
    dirRef.current = d
    setDir(d)
  }
  const centerAfter = useRef<ID | null>(null) // 검색·실행 취소로 새로 그려지는 카드: 맞춤 뒤 이 카드를 가운데로
  const fitPending = useRef<ID | null>(null) // 맞춤 뒤 가운데 맞출 카드('' = 선택). 레이아웃 이펙트 안에선 flushSync(fit) 를 못 써 배율을 먼저 놓고 다음 커밋에서 스크롤한다
  const settled = useRef(false) // 첫 배치 전에는 보기 상태를 저장하지 않는다(복원 전 0 으로 덮지 않게)
  const fitLater = useRef(false) // F1: 편집 중(카드 제목·카드 내용·패널 실시간)에 집합이 바뀌면(Enter 로 형제 추가 등) 맞춤을 보류했다가 편집이 끝날 때 1회
  const editing = () => editRef.current !== null || noteEditId !== null || liveBase.current !== null
  /** GraphView 가 실측 크기로 배치를 마칠 때마다 호출 (FALLBACK 크기로는 호출되지 않음). w·h = 그래프 배치 크기 */
  function onSettled(w: number, h: number) {
    const box = outlineRef.current
    if (!box) return
    settled.current = true
    const r = restorePending.current
    if (r) {
      restorePending.current = null // 첫 진입: 저장된 스크롤만 복원
      return box.scrollTo(r.x, r.y)
    }
    if (editing()) {
      fitLater.current = true // 입력 중에 배율·스크롤이 튀지 않게. 검색창은 편집이 아니다(A3)
      return
    }
    box.scrollIntoView({ block: 'nearest' }) // 모바일: 패널 쪽으로 내려가 있었으면 캔버스로 돌아온다
    fitPending.current = centerAfter.current ?? ''
    centerAfter.current = null
    const next = clampZoom(Math.min(1, (box.clientWidth - 16) / w, (box.clientHeight - 16) / h))
    if (next === zoomRef.current) return
    zoomRef.current = next
    setZoom(next)
  }

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
    selRef.current = sel?.id ?? '' // oxlint-disable-line react/immutability -- ref 갱신. dd:remote 리스너가 최신 선택을 ref 로 읽는다(의존성 없이)
  })
  // 맞춤의 스크롤 단계: 배율 상태가 zoomRef 를 따라잡은 커밋에서(같으면 같은 커밋). selRef 갱신 뒤에 와야 한다
  useLayoutEffect(() => {
    const id = fitPending.current
    if (id === null || zoomRef.current !== zoom) return
    fitPending.current = null
    centerOn(id || selRef.current)
  })
  // F1: 보류된 맞춤 — 편집이 끝난 커밋 뒤(useEffect 라 fit 의 flushSync 가 된다). 그 시점의 실제 .graph 크기로 맞춰 입력 중 커진 카드도 반영
  function fitIfLater() {
    if (!fitLater.current || editing()) return
    fitLater.current = false
    fit(selRef.current)
  }
  useEffect(fitIfLater, [editId, noteEditId]) // oxlint-disable-line react-hooks/exhaustive-deps -- ref 와 훅 함수만 읽는다
  useEffect(() => saveDir(dir), [dir]) // 방향 전환 뒤 맞춤은 GraphView 가 onSettled 로 다시 부른다
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
    // E1: 되살리거나 되돌린 노드는 새 updatedAt 으로 — 서버 LWW(at > updated_at)에서 톰스톤·이전 쓰기를 이긴다. 스냅샷 자체는 그대로(undoIf 동일성)
    const before = new Map(prev.map((n) => [n.id, n]))
    const next = step.ns.map((n) => (before.get(n.id) === n ? n : { ...n, updatedAt: Date.now() }))
    persist(prev, next)
    nodesRef.current = next
    setNodes(next)
    if (cutId && !next.some((n) => n.id === cutId)) setCutId(null)
    const id = changedNode(prev, next)
    if (id) jump(id)
    else if (!next.some((n) => n.id === selId)) setSelId(topNode().id)
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
    fitIfLater() // 패널 편집 중 원격 동기화 등으로 집합이 바뀌었으면 지금 맞춘다(F1)
    if (!base || base === nodesRef.current) return
    undoRef.current = [...undoRef.current.slice(-(UNDO_LIMIT - 1)), { ns: base, label: '편집' }]
    redoRef.current = []
  }
  const live = (id: ID, p: Partial<TreeNode>) => commit(patch(nodesRef.current, id, p), false)
  function startNoteEdit(id: ID) {
    setSelId(id)
    noteRef.current = id
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
    const [base, order] = first ? [patch(ns, n.id, { collapsed: false }), (childrenOf(ns, n.id)[0]?.order ?? 1) - 1] : orderAfter(ns, n)
    const nn = newNode(treeId, first ? n.id : n.parentId!, order)
    commit([...base, nn], '추가')
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
    const [base, order] = orderAfter(nodesRef.current, parent)
    commit(patch(base, n.id, { parentId: parent.parentId, order }), '내어쓰기')
  }
  function moveSibling(id: ID, dir: -1 | 1) {
    const n = get(id)!
    if (isTop(n) || n.parentId === null) return
    const ns = nodesRef.current
    const sib = childrenOf(ns, n.parentId)
    const i = sib.indexOf(n)
    const other = sib[i + dir]
    if (!other) return
    if (n.order === other.order) {
      // E6: 동률이면 교환이 무효 → 바꾼 순서로 형제 재번호
      const sw = [...sib]
      ;[sw[i], sw[i + dir]] = [other, n]
      return commit(renumber(ns, sw), '순서 바꾸기')
    }
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
    const name = n.title || '제목 없음'
    commit(ns.filter((x) => !gone.has(x.id)), `"${name}" 삭제`)
    haptic('warn')
    setSelId(rows[i - 1]?.node.id ?? topNode().id)
    if (cutId && gone.has(cutId)) setCutId(null)
    // 확인창 대신 되돌리기
    toast(`"${name}" 삭제${sub.length ? ` (하위 ${sub.length}개)` : ''}`, { label: '실행 취소', run: () => undoIf(ns), undo: true }, UNDO_MS)
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
    const [base, order] = orderAfter(ns, n)
    const copy = cloneBranch(ns, id, order)
    const name = n.title || '제목 없음'
    commit([...base, ...copy], `"${name}" 복제`)
    setSelId(copy[0].id)
    toast(`"${name}" 복제${copy.length > 1 ? ` (하위 ${copy.length - 1}개)` : ''}`, { label: '되돌리기', run: () => undoIf(ns), undo: true }, UNDO_MS)
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
    // 세로 보기: 화살표를 화면 방향에 맞춘다(← 부모 · → 첫 자식 · ↑↓ 형제·사촌, Alt+↑↓ 형제 순서) → 아래 분기는 위→아래 기준 그대로
    const ROT: Record<string, string> = { ArrowLeft: 'ArrowUp', ArrowRight: 'ArrowDown', ArrowUp: 'ArrowLeft', ArrowDown: 'ArrowRight' }
    const key = dirRef.current === 'right' ? (ROT[e.key] ?? e.key) : e.key
    const hasKids = childrenOf(nodesRef.current, sel.id).length > 0
    let handled = true
    // 문자 단축키는 e.code 로 판정 → 한글 자판 상태에서도 동작
    if (!ctrl && !e.altKey && (e.code === 'Equal' || e.code === 'NumpadAdd')) zoomBy(1.2)
    else if (!ctrl && !e.altKey && (e.code === 'Minus' || e.code === 'NumpadSubtract')) zoomBy(1 / 1.2)
    else if (!ctrl && !e.altKey && (e.code === 'Digit0' || e.code === 'Numpad0')) zoomTo(1)
    else if (ctrl && e.code === 'KeyZ') restore(e.shiftKey)
    else if (ctrl && e.code === 'KeyY') restore(true)
    else if (ctrl && e.code === 'KeyX') cut(sel)
    else if (ctrl && e.code === 'KeyV' && cutId) paste(sel.id)
    else if (ctrl) handled = false // Ctrl+V(잘라낸 것 없음)는 기본 동작 → 캔버스 onPaste 가 클립보드 개요를 받는다(E21)
    // 그래프 방향: ↑ 부모 · ↓ 첫 자식 · ←→ 형제 (plan G4)
    else if (e.altKey && key === 'ArrowLeft') moveSibling(sel.id, -1)
    else if (e.altKey && key === 'ArrowRight') moveSibling(sel.id, 1)
    else if (key === 'ArrowUp') {
      if (sel.parentId && !isTop(sel)) setSelId(sel.parentId)
    } else if (key === 'ArrowDown') {
      if (hasKids) {
        const first = childrenOf(nodesRef.current, sel.id)[0]
        if (!shown.has(first.id)) setOpen(sel, true)
        setSelId(first.id)
      }
    } else if (e.key === 'Home') setSelId(top!.id) // U19: 루트(포커스면 포커스 루트)
    else if (e.key === 'End') setSelId(rows[rows.length - 1].node.id) // 마지막 보이는 노드(전위 순서, R6-M6)
    else if (e.key === '.') centerOn(sel.id) // U15: 선택으로 이동
    else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      // U19: 보이는 같은 깊이의 이웃 — 형제가 먼저, 형제 끝에서는 사촌으로(전위 순서라 형제 사이엔 더 깊은 줄만 있다)
      const d = rows.find((r) => r.node.id === sel.id)?.depth
      const same = rows.filter((r) => r.depth === d)
      const to = same[same.findIndex((r) => r.node.id === sel.id) + (key === 'ArrowLeft' ? -1 : 1)]
      if (to) setSelId(to.node.id)
    } else if (e.key === ' ' || e.key === 'F2') startEdit(sel.id)
    else if (e.key === 'Enter') {
      if (!isFull()) startEdit(insertBelow(sel.id), '')
    }
    // Tab 은 가로채지 않는다(U49: 키보드 트랩 금지). 자식 추가 = Enter 후 Tab(편집 중 들여쓰기)
    else if (e.code === 'KeyH' && !e.altKey && !e.shiftKey) {
      if (hasKids) toggle(sel)
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') removeSubtree(sel.id) // Backspace: 맥 키보드(E10)
    else if (e.key === 'Escape') {
      setCutId(null)
      document.getElementById(KEYS_ID)?.hidePopover()
    }
    else if (e.key === '?') document.getElementById(KEYS_ID)?.togglePopover()
    else handled = false
    if (handled) e.preventDefault()
  }

  // ---- 가져오기 / 내보내기 ----
  /** text 기본값은 가져오기 칸. 캔버스 Ctrl+V(E21)는 클립보드 텍스트를 넘긴다 */
  function importOutline(asRoot: boolean, text = importText) {
    const items = parseOutline(text)
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
    const rootNote = rootMemo.length ? { note: [...rootMemo, target.note].filter(Boolean).join('\n').slice(0, CAP.note) } : {}
    const base = patch(ns, target.id, rootTitle ? { title: rootTitle.title, collapsed: false, ...rootNote } : { collapsed: false })
    const long = added.filter((n) => n.title.length === CAP.title && n.note !== undefined).length + (rootTitle?.note !== undefined ? 1 : 0)
    const count = added.length + (asRoot ? 1 : 0)
    // U11: 같은 개요를 두 번 붙이는 실수 — 최상위 항목만 기존 자식 제목과 비교(R4-A3)
    const dup = added.filter((n) => n.parentId === target.id && have.has(n.title)).length
    commit([...base, ...added], `가져오기 ${count}개`)
    showKids(target.id)
    void logEvent('outline_imported', { nodeCount: count }, treeId)
    setImportText('')
    setIoOpen(false)
    toast(
      `${count}개 추가${dup ? ` · 최상위 중복 ${dup}개` : ''}${long ? ` · 긴 제목 ${long}개를 잘라 메모로 옮겼습니다` : ''}`,
      { label: '되돌리기', run: () => undoIf(ns), undo: true },
      UNDO_MS,
    )
  }
  function copyText(text: string, done = '개요 복사됨') {
    navigator.clipboard?.writeText(text).then(
      () => toast(done),
      () => toast('직접 복사하세요'),
    )
  }
  /** rootId 가지의 개요 복사. 여러 줄 내용은 개요에 못 실리므로 빠진 수를 알린다(E11) */
  function copyOutline(rootId: ID): string {
    const ns = nodesRef.current
    const text = serializeOutline(nodesToOutline(ns, rootId, true))
    const skipped = [get(rootId)!, ...descendantsOf(ns, rootId)].filter((n) => n.note?.trim() && n.note.includes('\n')).length
    copyText(text, `개요 복사됨${skipped ? ` · 여러 줄 내용 ${skipped}개 제외` : ''}`)
    return text
  }
  const exportOutline = () => setExportText(copyOutline(root!.id))

  /** 현재 방향에서 드래그로 옮긴 위치를 지운다(실행취소 가능). 다른 방향의 위치는 그대로, 둘 다 비면 offset 자체를 뺀다(C1) */
  function autoArrange() {
    const ns = nodesRef.current
    const d = dirRef.current
    if (!ns.some((n) => moved(n, d))) return
    commit(ns.map((n) => (moved(n, d) ? { ...n, offset: clearOffset(n.offset!, d), updatedAt: Date.now() } : n)), '자동 정렬')
  }
  function pickDepth(d: number) {
    setViewDepth(d)
    setReveal(new Set())
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
    ['up', '위로 옮기기', arrowUp, at === 1],
    ['down', '아래로 옮기기', arrowDown, at === of],
    ['outdent', '내어쓰기', indentDecrease, atTop || cur.parentId === top!.id],
    ['indent', '들여쓰기', indentIncrease, at === 1],
    cutId ? ['paste', '여기에 붙이기', clipboardPaste] : ['cut', '잘라내기', scissors, atTop],
    ['del', '삭제', I.trash2, atTop],
    ['fold', opened ? '접기' : '펼치기', opened ? foldVertical : unfoldVertical, !kids],
    ['undo', '실행 취소', I.undo2],
    ['redo', '다시 실행', redo2],
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
    importRef.current?.focus()
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
        onPaste={(e) => {
          // E21: 캔버스 자체에 포커스가 있을 때만(제목 입력·내용 편집 중 붙여넣기는 각자 처리). 잘라낸 것이 있으면 keydown 이 먼저 가로챘다
          if (e.target !== e.currentTarget) return
          const text = e.clipboardData.getData('text/plain')
          if (!text.trim()) return
          e.preventDefault()
          importOutline(false, text)
        }}
        onScroll={() => (clearTimeout(scrollTimer.current), (scrollTimer.current = window.setTimeout(() => saveRef.current(), 300)))}
      >
        <GraphView
          zoom={zoom}
          nodes={nodes}
          rootId={top!.id}
          open={open}
          onZoomAt={zoomTo}
          onSettled={onSettled}
          dir={dir}
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
                narrow={narrow}
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
                      onBlur={() => (endLive(), (noteRef.current = null), setNoteEditId(null))}
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
          <button type="button" className="zoom-step" aria-label="축소" data-tip="축소 (-)" onClick={() => zoomBy(1 / 1.2)}><Icon d={zoomOut} size={20} /></button>
          <button type="button" className="zoom-reset" aria-label={`100%로 (현재 ${Math.round(zoom * 100)}%)`} data-tip="100%로 (0)" onClick={() => zoomTo(1)}>
            <output className="tnum" aria-label="배율">{Math.round(zoom * 100)}%</output>
          </button>
          <button type="button" className="zoom-step" aria-label="확대" data-tip="확대 (=)" onClick={() => zoomBy(1.2)}><Icon d={zoomIn} size={20} /></button>
        </span>
        <button type="button" aria-label="세로 보기" aria-pressed={dir === 'right'} data-tip={dir === 'right' ? '가로 보기로' : '세로 보기'} onClick={flipDir}><Icon d={dir === 'right' ? network : listTree} size={20} /></button>
        {nodes.some((n) => moved(n, dir)) && (
          <button type="button" className="arrange" aria-label="자동 정렬" data-tip="자동 정렬" onClick={autoArrange}><Icon d={sparkles} size={20} /></button>
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
          onExport={() => copyOutline(cur.id)}
        />
        <button type="button" className="io-open" onClick={openImport}><Icon d={clipboardPaste} />개요 붙여넣기 · 내보내기</button>
      </aside>
      <Sheet open={ioOpen} onClose={() => setIoOpen(false)} label="개요 붙여넣기 · 내보내기">
        <div className="io">
          <header className="sheet-head">
            <h2>개요 붙여넣기 · 내보내기</h2>
            <button type="button" className="ghost sheet-x" aria-label="닫기" data-tip="닫기" onClick={() => setIoOpen(false)}><Icon d={I.x} /></button>
          </header>
          <p className="muted">들여쓰기된 목차를 붙여 넣으면 선택한 노드 아래에 트리가 됩니다. 내보내기는 같은 형식의 텍스트를 복사합니다.</p>
          <textarea
            ref={importRef}
            aria-label="개요 텍스트"
            rows={narrow ? 3 : 5}
            value={importText}
            placeholder={'들여쓰기 목차를 붙여넣으세요 (탭·스페이스, -, 1., 가., ①, # 허용 · 제목 :: 메모)\n노동법\n  개별적 근로관계법\n    근로계약 :: 근로자와 사용자의 합의'}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="io-actions">
            <button type="button" onClick={() => importOutline(false)}>선택 노드의 자식으로 추가</button>
            {asRootOk && <button type="button" onClick={() => importOutline(true)}>첫 줄을 루트로</button>}
            <button type="button" onClick={exportOutline}>개요 내보내기</button>
            <button type="button" onClick={() => copyText(AI_PROMPT, 'AI 프롬프트 복사됨 · 답을 이 칸에 붙여넣으세요')}>AI 프롬프트 복사</button>
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
        </div>
      </Sheet>
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
/** 단축키 팝오버: [키(공백 = 여러 키), 2~3단어 동작] */
const KEYS: [string, string][] = [
  ['↑ ↓', '부모 · 첫 자식 (세로 보기는 ← →)'],
  ['← →', '형제 · 사촌 (세로 보기는 ↑ ↓)'],
  ['Alt+← Alt+→', '순서 바꾸기'],
  ['Space F2', '제목 편집'],
  ['Enter', '형제 추가'],
  ['Enter Tab', '자식 추가 (차례로)'],
  ['Tab Shift+Tab', '편집 중 들여·내어쓰기'],
  ['H', '접기 · 펼치기'],
  ['Delete Backspace', '삭제'],
  ['Ctrl+X Ctrl+V', '잘라내기 · 붙여넣기'],
  ['Ctrl+V', '클립보드 개요를 선택 아래에'],
  ['Ctrl+Z', '실행 취소'],
  ['Ctrl+Shift+Z Ctrl+Y', '다시 실행'],
  ['- = 0', '축소 · 확대 · 100%'],
  ['Shift+H', '형광펜'],
  ['Home End', '처음 · 마지막'],
  ['/ Ctrl+K', '검색'],
  ['.', '선택으로 이동'],
  ['Esc', '편집 끝내기'],
  ['?', '이 단축키 표'],
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
        {p.onDuplicate && <button type="button" className="to-import" aria-label="가지 복제" data-tip="가지 복제" onClick={p.onDuplicate}><Icon d={copyPlus} /></button>}
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
          if (isComposing(e)) return
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
/** U28 별칭 칩(C5 aliases): Enter·쉼표로 추가, × 로 삭제. 표시·공유 보기·검색(E13)용 — 지금은 어떤 채점도 별칭을 보지 않는다 */
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
          <button type="button" aria-label={`별칭 ${a} 삭제`} onClick={() => onChange(value.filter((v) => v !== a))}><Icon d={I.x} size={16} /></button>
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
          if (isComposing(e)) return
          if (e.key === 'Enter') { e.preventDefault(); add(text) }
        }}
      />
    </div>
  )
}

/** '/'·Ctrl+K 검색(U16·E13): 제목(위)·내용·별칭 부분 일치, 각 줄에 경로. ↑↓ 고르기 · Enter 이동 · Esc 닫기 */
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
        placeholder="제목 · 내용 · 별칭 검색"
        value={q}
        onChange={(e) => (setQ(e.target.value), setI(0))}
        onBlur={onClose}
        onKeyDown={(e) => {
          if (isComposing(e)) return
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
          {!res.length && <li className="search-none">찾는 노드가 없습니다</li>}
          {res.length >= SEARCH_LIMIT && <li className="search-none">처음 {SEARCH_LIMIT}개만 보입니다</li>}
        </ul>
      )}
    </div>
  )
}
