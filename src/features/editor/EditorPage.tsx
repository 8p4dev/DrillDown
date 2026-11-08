import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { logEvent } from '../../core/events'
import { nodesToOutline, outlineToNodes, parseOutline, serializeOutline } from '../../core/outline'
import { childrenOf, deleteNodes, descendantsOf, getTreeNodes, putNodes } from '../../core/repo'
import { getSrsMap, missHeat } from '../../core/srs'
import type { ID, NodeSrs, TreeNode } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { clipboardPaste, copy, eraser, highlighter, keyboard, list, maximize, network, zoomIn, zoomOut } from '../../ui/icons.all'
import NodeRow from './NodeRow'
import NoteEditor, { type NoteApi, type NoteOp } from './content/NoteEditor'
import GraphView from './graph/GraphView'
import TreeHeader from '../TreeHeader'
import { toast } from '../Toast'
// import { hint } from '../Toast' // DS 가 hint 를 내보내면 주석을 푼다 (plan 변경 사항)
import { haptic } from '../feel'
import { ensureVisible, startViewport, subscribeViewport } from '../viewport'
import './editor.css'

const UNDO_LIMIT = 50
const UNDO_MS = 10_000 // 노드 삭제 되돌리기(02 §3.5: 트리 삭제와 같은 10초)
const narrow = () => matchMedia('(max-width: 760px)').matches
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
const visibleRows = (ns: TreeNode[], root: TreeNode) => {
  const out: { node: TreeNode; depth: number; hasChildren: boolean }[] = []
  const walk = (n: TreeNode, depth: number) => {
    const kids = childrenOf(ns, n.id)
    out.push({ node: n, depth, hasChildren: kids.length > 0 })
    if (!n.collapsed) for (const k of kids) walk(k, depth + 1)
  }
  walk(root, 0)
  return out
}
const newNode = (treeId: ID, parentId: ID, order: number): TreeNode => ({
  id: crypto.randomUUID(), treeId, parentId, order, title: '', aliases: [], updatedAt: Date.now(),
})
const isComposing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229
/** 노드별 자식 유무·하위 수를 한 번에 계산 (O(n)). 노드마다 childrenOf/descendantsOf 를 부르면 O(n²) */
function countTree(ns: TreeNode[]) {
  const kids = new Map<ID, ID[]>()
  for (const n of ns) {
    if (n.parentId === null) continue
    const k = kids.get(n.parentId)
    if (k) k.push(n.id)
    else kids.set(n.parentId, [n.id])
  }
  const desc = new Map<ID, number>()
  const walk = (id: ID): number => {
    const total = (kids.get(id) ?? []).reduce((sum, k) => sum + 1 + walk(k), 0)
    desc.set(id, total)
    return total
  }
  for (const n of ns) if (n.parentId === null) walk(n.id)
  return { hasKids: (id: ID) => kids.has(id), desc: (id: ID) => desc.get(id) ?? 0 }
}

export default function EditorPage({ treeId }: { treeId: string }) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  const [srs, setSrs] = useState<Map<ID, NodeSrs>>(new Map())
  const [selId, setSelId] = useState<ID>('')
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
  const undoRef = useRef<TreeNode[][]>([])
  const redoRef = useRef<TreeNode[][]>([])
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
      setIoOpen(ns.length === 1)
      setSelId(ns.find((n) => n.parentId === null)?.id ?? '')
    })
    return () => {
      alive = false
    }
  }, [treeId])

  const loaded = nodes !== null
  useEffect(() => {
    if (loaded) outlineRef.current?.focus() // 진입 즉시 키보드로 편집 가능
  }, [loaded])
  // 키보드(--kb)·시각 뷰포트 추적. 키보드가 열리면 단축키 시트는 닫는다(02 규칙 4(b))
  useEffect(() => {
    startViewport()
    // if (matchMedia('(pointer: coarse)').matches) hint('editor', '카드 두 번 탭 = 제목') // 1회성 힌트 — DS hint 머지 뒤
    return subscribeViewport((v) => {
      if (v.open) document.getElementById(KEYS_ID)?.hidePopover()
    })
  }, [])

  // 편집 종료로 입력창이 사라지면 아웃라이너로 포커스 복귀 (메모 칸 등 다른 곳으로 간 경우는 건드리지 않음)
  useLayoutEffect(() => {
    if (editId === null && (document.activeElement === document.body || document.activeElement === null))
      outlineRef.current?.focus()
  }, [editId])

  // ---- 확대·축소: 버튼, Ctrl+휠, 핀치, 탐색 모드 키 - = 0 ----
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
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
    box.scrollTo(0, 0)
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
  const fitPending = useRef(true)
  const centerPending = useRef<number | null>(null)
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
    if (!fitPending.current || !box) return
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

  const root = nodes?.find((n) => n.parentId === null)
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
  function commit(next: TreeNode[], undoable = true) {
    const prev = nodesRef.current
    if (next === prev) return
    persist(prev, next)
    if (undoable) {
      undoRef.current = [...undoRef.current.slice(-(UNDO_LIMIT - 1)), prev]
      redoRef.current = []
    }
    nodesRef.current = next
    setNodes(next)
  }
  function restore(from: React.RefObject<TreeNode[][]>, to: React.RefObject<TreeNode[][]>, label: string) {
    const snap = from.current.pop()
    if (!snap) return toast(`${label}할 것이 없음`)
    to.current.push(nodesRef.current)
    persist(nodesRef.current, snap)
    nodesRef.current = snap
    setNodes(snap)
    if (!snap.some((n) => n.id === selId)) setSelId(root!.id)
    if (cutId && !snap.some((n) => n.id === cutId)) setCutId(null)
  }

  // ---- 실시간 편집 (패널 제목·내용, 카드 내용): 입력마다 저장, 편집 1회 = 실행취소 1단계 ----
  function beginLive() {
    liveBase.current ??= nodesRef.current
  }
  function endLive() {
    const base = liveBase.current
    liveBase.current = null
    if (!base || base === nodesRef.current) return
    undoRef.current = [...undoRef.current.slice(-(UNDO_LIMIT - 1)), base]
    redoRef.current = []
  }
  const live = (id: ID, p: Partial<TreeNode>) => commit(patch(nodesRef.current, id, p), false)
  function startNoteEdit(id: ID) {
    setSelId(id)
    setNoteEditId(id)
  }
  const toOutline = () => outlineRef.current?.focus()

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
      if (title !== n.title) commit(patch(nodesRef.current, n.id, { title }))
      return true
    }
    const ns = nodesRef.current
    if (allowRemove && n.parentId !== null && !childrenOf(ns, n.id).length) {
      const rows = visibleRows(ns, root!)
      const i = rows.findIndex((r) => r.node.id === n.id)
      commit(ns.filter((x) => x.id !== n.id))
      setSelId(rows[i - 1]?.node.id ?? root!.id)
      return false
    }
    return true // 빈 제목은 무시하고 기존 제목 유지
  }
  function onEditKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (isComposing(e)) return // 한글 조합 중: 브라우저/IME 에 맡긴다 (글자 중복·유실 방지)
    if (e.key === 'Enter') {
      e.preventDefault()
      const id = editRef.current!
      if (!applyDraft(true)) return stopEdit()
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
  /** 형제로 아래에 삽입(루트면 첫 자식). 새 id 반환 */
  function insertBelow(id: ID): ID {
    const n = get(id)!
    const ns = nodesRef.current
    const nn =
      n.parentId === null
        ? newNode(treeId, n.id, (childrenOf(ns, n.id)[0]?.order ?? 1) - 1)
        : newNode(treeId, n.parentId, orderAfter(ns, n))
    commit([...(n.parentId === null ? patch(ns, n.id, { collapsed: false }) : ns), nn])
    return nn.id
  }
  function addChild(id: ID): ID {
    const ns = nodesRef.current
    const nn = newNode(treeId, id, nextOrder(ns, id))
    commit([...patch(ns, id, { collapsed: false }), nn])
    return nn.id
  }
  /** 직전 형제의 마지막 자식으로 */
  function indent(id: ID) {
    const n = get(id)!
    if (n.parentId === null) return
    const ns = nodesRef.current
    const sib = childrenOf(ns, n.parentId)
    const prev = sib[sib.indexOf(n) - 1]
    if (!prev) return toast('첫 항목은 들여쓸 수 없음')
    commit(patch(patch(ns, prev.id, { collapsed: false }), n.id, { parentId: prev.id, order: nextOrder(ns, prev.id) }))
  }
  /** 부모 바로 뒤 형제로 */
  function outdent(id: ID) {
    const n = get(id)!
    const parent = n.parentId ? get(n.parentId) : undefined
    if (!parent || parent.parentId === null) return toast('더 내어쓸 수 없음')
    const ns = nodesRef.current
    commit(patch(ns, n.id, { parentId: parent.parentId, order: orderAfter(ns, parent) }))
  }
  function moveSibling(id: ID, dir: -1 | 1) {
    const n = get(id)!
    if (n.parentId === null) return
    const ns = nodesRef.current
    const sib = childrenOf(ns, n.parentId)
    const other = sib[sib.indexOf(n) + dir]
    if (!other) return
    commit(patch(patch(ns, n.id, { order: other.order }), other.id, { order: n.order }))
  }
  function removeSubtree(id: ID) {
    const n = get(id)!
    if (n.parentId === null) return toast('루트는 지울 수 없음')
    const ns = nodesRef.current
    const sub = descendantsOf(ns, id)
    const gone = new Set([id, ...sub.map((x) => x.id)])
    const rows = visibleRows(ns, root!)
    const i = rows.findIndex((r) => r.node.id === id)
    commit(ns.filter((x) => !gone.has(x.id)))
    haptic('warn')
    setSelId(rows[i - 1]?.node.id ?? root!.id)
    if (cutId && gone.has(cutId)) setCutId(null)
    // 확인창 대신 되돌리기. 그 사이 다른 변경이 있으면 엉뚱한 단계를 되돌리지 않는다
    toast(`"${n.title}" 삭제${sub.length ? ` (하위 ${sub.length}개)` : ''}`, {
      label: '실행 취소',
      run: () => {
        if (undoRef.current.at(-1) !== ns) return toast('Ctrl+Z 로 되돌리세요')
        restore(undoRef, redoRef, '실행 취소')
        setSelId(id)
        toOutline()
      },
    }, UNDO_MS)
  }
  /** 잘라낸 서브트리를 선택 노드의 마지막 자식으로 이동 (id 유지 → 학습 기록 보존) */
  function paste(targetId: ID) {
    if (!cutId) return toast('잘라낸 항목 없음 (Ctrl+X)')
    const ns = nodesRef.current
    if (targetId === cutId || descendantsOf(ns, cutId).some((d) => d.id === targetId))
      return toast('자기 하위에는 붙여넣기 불가')
    commit(patch(patch(ns, targetId, { collapsed: false }), cutId, { parentId: targetId, order: nextOrder(ns, targetId) }))
    setSelId(cutId)
    setCutId(null)
  }

  // ---- 탐색 모드 ----
  function onNavKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || isComposing(e)) return
    const sel = get(selId) ?? root!
    const ctrl = e.ctrlKey || e.metaKey
    const hasKids = childrenOf(nodesRef.current, sel.id).length > 0
    let handled = true
    // 문자 단축키는 e.code 로 판정 → 한글 자판 상태에서도 동작
    if (!ctrl && !e.altKey && (e.code === 'Equal' || e.code === 'NumpadAdd')) zoomBy(1.2)
    else if (!ctrl && !e.altKey && (e.code === 'Minus' || e.code === 'NumpadSubtract')) zoomBy(1 / 1.2)
    else if (!ctrl && !e.altKey && (e.code === 'Digit0' || e.code === 'Numpad0')) zoomTo(1)
    else if (ctrl && e.code === 'KeyZ') restore(e.shiftKey ? redoRef : undoRef, e.shiftKey ? undoRef : redoRef, e.shiftKey ? '다시 실행' : '실행 취소')
    else if (ctrl && e.code === 'KeyY') restore(redoRef, undoRef, '다시 실행')
    else if (ctrl && e.code === 'KeyX') {
      if (sel.parentId === null) toast('루트는 잘라낼 수 없음')
      else {
        setCutId(sel.id)
        haptic('warn')
        toast('잘라냄 · 대상 선택 후 Ctrl+V')
      }
    } else if (ctrl && e.code === 'KeyV') paste(sel.id)
    else if (ctrl) handled = false
    // 그래프 방향: ↑ 부모 · ↓ 첫 자식 · ←→ 형제 (plan G4)
    else if (e.altKey && e.key === 'ArrowLeft') moveSibling(sel.id, -1)
    else if (e.altKey && e.key === 'ArrowRight') moveSibling(sel.id, 1)
    else if (e.key === 'ArrowUp') {
      if (sel.parentId) setSelId(sel.parentId)
    } else if (e.key === 'ArrowDown') {
      if (hasKids) {
        if (sel.collapsed) commit(patch(nodesRef.current, sel.id, { collapsed: false }), false)
        setSelId(childrenOf(nodesRef.current, sel.id)[0].id)
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const sib = sel.parentId ? childrenOf(nodesRef.current, sel.parentId) : [sel]
      const to = sib[sib.indexOf(sel) + (e.key === 'ArrowLeft' ? -1 : 1)]
      if (to) setSelId(to.id)
    } else if (e.key === ' ' || e.key === 'F2') startEdit(sel.id)
    else if (e.key === 'Enter') startEdit(insertBelow(sel.id), '')
    else if (e.key === 'Tab') {
      if (e.shiftKey) outdent(sel.id)
      else startEdit(addChild(sel.id), '')
    } else if (e.code === 'KeyH' && !e.altKey) {
      if (hasKids) commit(patch(nodesRef.current, sel.id, { collapsed: !sel.collapsed }), false)
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
    const target = asRoot ? root! : (get(selId) ?? root!)
    const list = asRoot ? [...items[0].children, ...items.slice(1)] : items
    const added = outlineToNodes(list, treeId, target.id, nextOrder(ns, target.id))
    const base = patch(ns, target.id, asRoot ? { title: items[0].text, collapsed: false } : { collapsed: false })
    if (added.length) fitPending.current = true // 통째로 들어온 트리는 진입과 같게 맞춘다
    commit([...base, ...added])
    void logEvent('outline_imported', { nodeCount: added.length + (asRoot ? 1 : 0) }, treeId)
    setImportText('')
    toast(`${added.length + (asRoot ? 1 : 0)}개 가져옴`)
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
    commit(ns.map((n) => (n.offset ? { ...n, offset: undefined, updatedAt: Date.now() } : n)))
  }
  const toggle = (n: TreeNode) => commit(patch(nodesRef.current, n.id, { collapsed: !n.collapsed }), false)

  const sel = nodes.find((n) => n.id === selId) ?? root
  return (
    <section className="editor">
      <TreeHeader treeId={treeId} active="edit" title={root.title} />
      <div className="canvas">
      <div className="outline" role="tree" aria-label="아웃라이너" tabIndex={0} ref={outlineRef} onKeyDown={onNavKey}>
        <GraphView
          zoom={zoom}
          nodes={nodes}
          rootId={root.id}
          onZoomAt={zoomTo}
          onSettled={onSettled}
          onMove={(id, offset) => commit(patch(nodesRef.current, id, { offset }))}
          renderNode={(n, box, m) => {
            return (
              <NodeRow
                key={n.id}
                node={n}
                depth={box.depth}
                x={box.x}
                y={box.y}
                hasChildren={counts.hasKids(n.id)}
                hiddenCount={n.collapsed ? counts.desc(n.id) : 0}
                selected={n.id === sel.id}
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
                onWidth={(width) => commit(patch(nodesRef.current, n.id, { width }))}
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
      <div className="zoom-tools">
        <span className="zoom-group" role="group" aria-label="확대·축소">
          <button type="button" aria-label="축소" data-tip="축소 (-)" onClick={() => zoomBy(1 / 1.2)}><Icon d={zoomOut} size={20} /></button>
          <button type="button" className="zoom-reset" data-tip="100%로 (0)" onClick={() => zoomTo(1)}>
            <output aria-label="배율">{Math.round(zoom * 100)}%</output>
          </button>
          <button type="button" aria-label="확대" data-tip="확대 (=)" onClick={() => zoomBy(1.2)}><Icon d={zoomIn} size={20} /></button>
        </span>
        <button type="button" aria-label="화면 맞춤" data-tip="화면 맞춤" onClick={fitZoom}><Icon d={maximize} size={20} /></button>
        {nodes.some((n) => n.offset) && (
          <button type="button" className="arrange" aria-label="자동 정렬" data-tip="자동 정렬" onClick={autoArrange}><Icon d={network} size={20} /></button>
        )}
        <button type="button" aria-label="단축키" data-tip="단축키 (?)" popoverTarget={KEYS_ID}><Icon d={keyboard} size={20} /></button>
      </div>
      </div>
      <aside className="side">
        <DetailPanel
          key={sel.id}
          node={sel}
          titleDraft={editId === sel.id ? draft : null}
          api={panelNote}
          onLive={(p) => live(sel.id, p)}
          onBegin={beginLive}
          onEnd={endLive}
          onEscape={toOutline}
          onWidth={(width) => width !== (sel.width ?? 1) && commit(patch(nodesRef.current, sel.id, { width }))}
          onFormat={(op) => (noteEditId === sel.id ? cardNote : panelNote).current?.apply(op)}
        />
        <details className="io" open={ioOpen} onToggle={(e) => setIoOpen(e.currentTarget.open)}>
          <summary><Icon d={clipboardPaste} />개요 붙여넣기 · 내보내기</summary>
          <textarea
            aria-label="개요 텍스트"
            rows={narrow() ? 3 : 5}
            value={importText}
            placeholder={'들여쓰기 목차를 붙여넣으세요 (탭·스페이스, -, 1., 가., ① 등 허용)\n노동법\n  개별적 근로관계법\n    근로계약'}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="io-actions">
            <button type="button" onClick={() => importOutline(false)}>선택 노드의 자식으로 추가</button>
            <button type="button" onClick={() => importOutline(true)}>첫 줄을 루트로</button>
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
/** 단축키 팝오버: [키(공백 = 여러 키), 2~3단어 동작] */
const KEYS: [string, string][] = [
  ['↑ ↓', '부모 · 첫 자식'],
  ['← →', '형제 이동'],
  ['Alt+← Alt+→', '순서 바꾸기'],
  ['Space F2', '제목 편집'],
  ['Enter', '형제 추가'],
  ['Tab', '자식 추가'],
  ['Shift+Tab', '내어쓰기'],
  ['H', '접기 · 펼치기'],
  ['Delete', '삭제'],
  ['Ctrl+X Ctrl+V', '잘라내기 · 붙여넣기'],
  ['Ctrl+Z', '실행 취소'],
  ['Ctrl+Shift+Z', '다시 실행'],
  ['- = 0', '축소 · 확대 · 100%'],
  ['Shift+H', '형광펜'],
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
}) {
  const [title, setTitle] = useState<string | null>(null) // 입력 중일 때만 로컬 값 (빈 제목은 저장하지 않음)
  const width = p.node.width ?? 1
  return (
    <div className="detail">
      <input
        className="detail-title"
        aria-label="패널 제목"
        placeholder="제목"
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
