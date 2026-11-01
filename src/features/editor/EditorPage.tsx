import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { logEvent } from '../../core/events'
import { nodesToOutline, outlineToNodes, parseOutline, serializeOutline } from '../../core/outline'
import { childrenOf, deleteNodes, descendantsOf, getTreeNodes, putNodes } from '../../core/repo'
import { colorClass, colorMap, getSrsMap } from '../../core/srs'
import type { ID, NodeSrs, TreeNode } from '../../core/types'
import { href } from '../../router'
import NodeRow from './NodeRow'
import GraphView from './graph/GraphView'
import TreeHeader from '../TreeHeader'
import './editor.css'

const UNDO_LIMIT = 50

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

export default function EditorPage({ treeId }: { treeId: string }) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  const [srs, setSrs] = useState<{ map: Map<ID, NodeSrs>; at: Date }>({ map: new Map(), at: new Date(0) })
  const [selId, setSelId] = useState<ID>('')
  const [editId, setEditId] = useState<ID | null>(null)
  const [draft, setDraft] = useState('')
  const [cutId, setCutId] = useState<ID | null>(null)
  const [msg, setMsg] = useState('')
  const [importText, setImportText] = useState('')
  const [exportText, setExportText] = useState('')
  // 핸들러가 같은 이벤트 안에서 여러 번 commit 해도 최신 상태를 보도록 ref 를 기준으로 삼는다
  const nodesRef = useRef<TreeNode[]>([])
  const editRef = useRef<ID | null>(null)
  const draftRef = useRef('')
  const undoRef = useRef<TreeNode[][]>([])
  const redoRef = useRef<TreeNode[][]>([])
  const saveRef = useRef<Promise<unknown>>(Promise.resolve())
  const outlineRef = useRef<HTMLDivElement>(null)

  useEffect(() => void getSrsMap(treeId).then((map) => setSrs({ map, at: new Date() })), [treeId])
  // 학습 상태 색: 부모 집계 포함 (core/srs). 편집 중 새 노드는 기록이 없어 c-none
  const colors = useMemo(() => (nodes ? colorMap(nodes, srs.map, srs.at) : new Map()), [nodes, srs])
  const colorClassOf = (id: ID) => colorClass(colors.get(id) ?? { color: 'none', misplaced: false })
  useEffect(() => {
    let alive = true
    getTreeNodes(treeId).then((ns) => {
      if (!alive) return
      nodesRef.current = ns
      undoRef.current = []
      redoRef.current = []
      setNodes(ns)
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

  // 편집 종료로 입력창이 사라지면 아웃라이너로 포커스 복귀 (메모 칸 등 다른 곳으로 간 경우는 건드리지 않음)
  useLayoutEffect(() => {
    if (editId === null && (document.activeElement === document.body || document.activeElement === null))
      outlineRef.current?.focus()
  }, [editId])

  const root = nodes?.find((n) => n.parentId === null)
  if (!nodes) return <p>불러오는 중…</p>
  if (!root) return <p>트리를 찾을 수 없습니다. <a href={href.trees()}>목록으로</a></p>

  const get = (id: ID) => nodesRef.current.find((n) => n.id === id)

  function persist(prev: TreeNode[], next: TreeNode[]) {
    const before = new Map(prev.map((n) => [n.id, n]))
    const ids = new Set(next.map((n) => n.id))
    const changed = next.filter((n) => before.get(n.id) !== n)
    const removed = prev.filter((n) => !ids.has(n.id)).map((n) => n.id)
    saveRef.current = saveRef.current
      .then(() => putNodes(changed))
      .then(() => deleteNodes(removed))
      .catch((e) => setMsg(`저장 실패: ${e}`))
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
    if (!snap) return setMsg(`${label}할 것이 없습니다`)
    to.current.push(nodesRef.current)
    persist(nodesRef.current, snap)
    nodesRef.current = snap
    setNodes(snap)
    if (!snap.some((n) => n.id === selId)) setSelId(root!.id)
    if (cutId && !snap.some((n) => n.id === cutId)) setCutId(null)
    setMsg('')
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
    if (!prev) return setMsg('위에 형제가 없어 들여쓸 수 없습니다')
    commit(patch(patch(ns, prev.id, { collapsed: false }), n.id, { parentId: prev.id, order: nextOrder(ns, prev.id) }))
  }
  /** 부모 바로 뒤 형제로 */
  function outdent(id: ID) {
    const n = get(id)!
    const parent = n.parentId ? get(n.parentId) : undefined
    if (!parent || parent.parentId === null) return setMsg('루트 바로 아래 항목은 내어쓸 수 없습니다')
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
    if (n.parentId === null) return setMsg('루트는 지울 수 없습니다 (트리 목록에서 트리를 삭제하세요)')
    const ns = nodesRef.current
    const sub = descendantsOf(ns, id)
    if (!confirm(`"${n.title}"${sub.length ? ` 와 하위 ${sub.length}개 항목` : ''}을 삭제할까요?`)) return
    const gone = new Set([id, ...sub.map((x) => x.id)])
    const rows = visibleRows(ns, root!)
    const i = rows.findIndex((r) => r.node.id === id)
    commit(ns.filter((x) => !gone.has(x.id)))
    setSelId(rows[i - 1]?.node.id ?? root!.id)
    if (cutId && gone.has(cutId)) setCutId(null)
  }
  /** 잘라낸 서브트리를 선택 노드의 마지막 자식으로 이동 (id 유지 → 학습 기록 보존) */
  function paste(targetId: ID) {
    if (!cutId) return setMsg('잘라낸 항목이 없습니다 (Ctrl+X)')
    const ns = nodesRef.current
    if (targetId === cutId || descendantsOf(ns, cutId).some((d) => d.id === targetId))
      return setMsg('자기 자신이나 그 하위 항목 아래에는 붙여넣을 수 없습니다')
    commit(patch(patch(ns, targetId, { collapsed: false }), cutId, { parentId: targetId, order: nextOrder(ns, targetId) }))
    setSelId(cutId)
    setCutId(null)
    setMsg('')
  }

  // ---- 탐색 모드 ----
  function onNavKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || isComposing(e)) return
    const sel = get(selId) ?? root!
    const ctrl = e.ctrlKey || e.metaKey
    const hasKids = childrenOf(nodesRef.current, sel.id).length > 0
    let handled = true
    // 문자 단축키는 e.code 로 판정 → 한글 자판 상태에서도 동작
    if (ctrl && e.code === 'KeyZ') restore(e.shiftKey ? redoRef : undoRef, e.shiftKey ? undoRef : redoRef, e.shiftKey ? '다시 실행' : '실행 취소')
    else if (ctrl && e.code === 'KeyY') restore(redoRef, undoRef, '다시 실행')
    else if (ctrl && e.code === 'KeyX') {
      if (sel.parentId === null) setMsg('루트는 잘라낼 수 없습니다')
      else {
        setCutId(sel.id)
        setMsg(`"${sel.title}" 잘라냄 — 넣을 노드를 선택하고 Ctrl+V`)
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
      setMsg('')
    }
    else handled = false
    if (handled) e.preventDefault()
  }

  // ---- 가져오기 / 내보내기 ----
  function importOutline(asRoot: boolean) {
    const items = parseOutline(importText)
    if (!items.length) return setMsg('가져올 항목이 없습니다')
    const ns = nodesRef.current
    const target = asRoot ? root! : (get(selId) ?? root!)
    const list = asRoot ? [...items[0].children, ...items.slice(1)] : items
    const added = outlineToNodes(list, treeId, target.id, nextOrder(ns, target.id))
    const base = patch(ns, target.id, asRoot ? { title: items[0].text, collapsed: false } : { collapsed: false })
    commit([...base, ...added])
    void logEvent('outline_imported', { nodeCount: added.length + (asRoot ? 1 : 0) }, treeId)
    setImportText('')
    setMsg(`${added.length + (asRoot ? 1 : 0)}개 항목을 가져왔습니다`)
  }
  function exportOutline() {
    const text = serializeOutline(nodesToOutline(nodesRef.current, root!.id, true))
    setExportText(text)
    navigator.clipboard?.writeText(text).then(
      () => setMsg('개요를 클립보드에 복사했습니다'),
      () => setMsg('아래 텍스트를 직접 복사하세요'),
    )
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
      <TreeHeader treeId={treeId} active="edit" title={root.title}>
        <button type="button" onClick={autoArrange} disabled={!nodes.some((n) => n.offset)} title="드래그로 옮긴 위치를 모두 되돌립니다">
          자동 정렬
        </button>
      </TreeHeader>
      <div className="outline" role="tree" aria-label="아웃라이너" tabIndex={0} ref={outlineRef} onKeyDown={onNavKey}>
        <GraphView
          nodes={nodes}
          rootId={root.id}
          onMove={(id, offset) => commit(patch(nodesRef.current, id, { offset }))}
          renderNode={(n, box) => {
            const kids = childrenOf(nodes, n.id)
            return (
              <NodeRow
                key={n.id}
                node={n}
                depth={box.depth}
                x={box.x}
                y={box.y}
                hasChildren={kids.length > 0}
                hiddenCount={n.collapsed && kids.length ? descendantsOf(nodes, n.id).length : 0}
                selected={n.id === sel.id}
                cut={n.id === cutId}
                draft={n.id === editId ? draft : null}
                onDraft={(v) => ((draftRef.current = v), setDraft(v))}
                onEditKey={onEditKey}
                onBlurEdit={() => onBlurEdit(n.id)}
                onSelect={() => setSelId(n.id)}
                onStartEdit={() => startEdit(n.id)}
                onToggle={() => toggle(n)}
                colorClassOf={colorClassOf}
              />
            )
          }}
        />
      </div>
      <aside className="side">
        <p className="status" role="status">{msg}</p>
        <DetailPanel key={sel.id} node={sel} onSave={(p) => commit(patch(nodesRef.current, sel.id, p))} />
        <p className="help">
          ↑ 부모 · ↓ 첫 자식 · ←→ 형제 · Alt+←→ 순서 · Space·F2 편집 · Enter 형제 추가 · Tab 자식 추가 · Shift+Tab 내어쓰기 · H 접기 ·
          Delete 삭제 · Ctrl+X/V 잘라내기·붙여넣기 · Ctrl+Z / Ctrl+Shift+Z 실행취소·다시실행 · 편집 중 Enter 확정+형제, Tab 들여쓰기, Esc 확정 ·
          노드를 끌어 위치 조정(하위 함께)
        </p>
      </aside>
      <div className="io">
        <h2>개요 붙여넣기</h2>
        <textarea
          aria-label="개요 텍스트"
          rows={6}
          value={importText}
          placeholder={'들여쓰기 목차를 붙여넣으세요 (탭·스페이스, -, 1., 가., ① 등 허용)\n노동법\n  개별적 근로관계법\n    근로계약'}
          onChange={(e) => setImportText(e.target.value)}
        />
        <button type="button" onClick={() => importOutline(false)}>선택 노드의 자식으로 추가</button>{' '}
        <button type="button" onClick={() => importOutline(true)}>첫 줄을 루트로</button>{' '}
        <button type="button" onClick={exportOutline}>개요 내보내기</button>
        {exportText && <textarea aria-label="내보낸 개요" readOnly rows={6} value={exportText} />}
      </div>
    </section>
  )
}

function DetailPanel({ node, onSave }: { node: TreeNode; onSave: (p: Partial<TreeNode>) => void }) {
  const [note, setNote] = useState(node.note ?? '')
  const [aliases, setAliases] = useState(node.aliases.join(', '))
  const saveNote = () => note !== (node.note ?? '') && onSave({ note })
  const saveAliases = () => {
    const list = [...new Set(aliases.split(/[,，]/).map((s) => s.trim()).filter(Boolean))]
    if (list.join('\u0000') !== node.aliases.join('\u0000')) onSave({ aliases: list })
    setAliases(list.join(', '))
  }
  return (
    <div className="detail">
      <h2>{node.title || '(제목 없음)'}</h2>
      <label>
        메모
        <textarea aria-label="메모" rows={5} value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} />
      </label>
      <label>
        허용 표현 (쉼표 구분)
        <input aria-label="허용 표현" value={aliases} onChange={(e) => setAliases(e.target.value)} onBlur={saveAliases} />
      </label>
    </div>
  )
}
