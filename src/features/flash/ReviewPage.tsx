// 오늘의 복습 (plan §1 F2): 오늘 기한 노드의 부모 큐를 플래시카드로 차례 복습. Dexie 직접(계약 §3.5 — 공유 보기에 없음)
import { useEffect, useMemo, useState } from 'react'
import { ancestorsOf } from '../../core/path'
import { getTreeNodes, listTrees } from '../../core/repo'
import { dexieSource } from '../../core/source'
import { colorMap, dueByTree, getSrsMap } from '../../core/srs'
import type { ID, NodeSrs, Tree, TreeNode } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { NodePath } from '../../ui/NodePath'
import { arrowRight, listChecks } from '../../ui/icons.all'
import { shuffle } from '../dnd/dnd'
import FlashCard, { Summary } from './FlashCard'
import { byOverdue, missedConcepts, parentQueue, requeueMissed } from './flash'
import './flash.css'

const CHUNK = 20 // S10: 한 번에 복습하는 개념 수(plan §2). 남은 것은 '더 하기'

// order = 이번 묶음의 전위 순서(섞기 전), queue = 출제 순서, base = 재출제(U40) 붙기 전 길이, rest = 아직 안 낸 개념,
// due = 오늘 기한 노드(이것만 평가 버튼, R3-P15), missed = 이번 복습에서 평가한 노드(알음/모름), done = 요약 화면
interface Session {
  tree: Tree; nodes: TreeNode[]; order: ID[]; queue: ID[]; base: number; i: number; rest: ID[]
  due: Set<ID>; missed: Map<ID, boolean>; shuffled: boolean; done: boolean
}

/** '오늘의' 복습 = 오늘 안에 기한이 오는 노드 (Again 은 수 분 뒤 기한이라 now 기준이면 방금 틀린 항목이 안 보임) */
const endOfToday = () => {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

const loadSrs = async (treeId: ID) => ({ map: await getSrsMap(treeId), at: new Date() })

export default function ReviewPage() {
  const [rows, setRows] = useState<{ tree: Tree; due: NodeSrs[] }[] | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [srs, setSrs] = useState({ map: new Map<ID, NodeSrs>(), at: new Date(0) })
  useEffect(() => {
    if (session) return
    const load = () =>
      Promise.all([listTrees(), dueByTree(endOfToday())]).then(([trees, due]) =>
        setRows(byOverdue(trees.filter((t) => due.get(t.id)?.length).map((t) => ({ tree: t, due: due.get(t.id)! })))),
      )
    load()
    addEventListener('dd:remote', load) // S7: 다른 기기의 학습 기록·삭제가 pull 되면 목록 갱신(세션 중에는 건드리지 않음)
    return () => removeEventListener('dd:remote', load)
  }, [session])
  const colors = useMemo(() => colorMap(session?.nodes ?? [], srs.map, srs.at), [session?.nodes, srs])

  const start = async (tree: Tree, due: NodeSrs[]) => {
    const [nodes, s] = await Promise.all([getTreeNodes(tree.id), loadSrs(tree.id)])
    setSrs(s)
    const all = parentQueue(nodes, due)
    const order = all.slice(0, CHUNK)
    setSession({ tree, nodes, order, queue: order, base: order.length, i: 0, rest: all.slice(CHUNK), due: new Set(due.map((s) => s.nodeId)), missed: new Map(), shuffled: false, done: false })
  }
  /** 다음 묶음(S10). 섞기 상태는 이어진다 */
  const more = (s: Session): Session => {
    const order = s.rest.slice(0, CHUNK)
    const queue = s.shuffled ? shuffle(order) : order
    return { ...s, order, queue, base: queue.length, i: 0, rest: s.rest.slice(CHUNK), done: false }
  }
  /** 플래시 섞기와 같게: 이번 묶음을 섞어(또는 원래 순서로) 처음 카드부터. 평가는 유지 */
  const toggleShuffle = (s: Session): Session => {
    const queue = s.shuffled ? s.order : shuffle(s.order)
    return { ...s, queue, base: queue.length, i: 0, shuffled: !s.shuffled }
  }

  if (session) {
    const id = session.queue[session.i]
    const byId = new Map(session.nodes.map((n) => [n.id, n]))
    const ext = requeueMissed(session.queue, session.base, session.i, missedConcepts(byId, session.missed)) // U40: 끝에 모름 카드 한 번 더
    const last = session.i >= ext.length - 1
    const step = () => setSession({ ...session, queue: ext, i: session.i + 1 })
    const treeId = session.tree.id
    const known = [...session.missed.values()].filter(Boolean).length
    const unknown = [...session.missed].filter(([, k]) => !k).map(([id]) => byId.get(id)).filter(Boolean) as TreeNode[]
    const moreBtn = session.rest.length > 0 && (
      <button type="button" className="primary" onClick={() => setSession(more(session))}><Icon d={arrowRight} /> 더 하기 ({session.rest.length}개 남음)</button>
    )
    return (
      <section className="review flash">
        <header className="review-head">
          <h1>{session.tree.title} 복습</h1>
          <span className="muted" aria-label="복습 진행">{session.i + 1} / {ext.length}</span>
          <button type="button" className="ghost" aria-pressed={session.shuffled} data-tip="개념 순서 섞기(처음 카드부터)" onClick={() => setSession(toggleShuffle(session))}>섞기</button>
          <div className="review-bar" role="progressbar" aria-valuemin={0} aria-valuemax={ext.length} aria-valuenow={session.i + 1}>
            <span style={{ width: `${((session.i + 1) / ext.length) * 100}%` }} />
          </div>
        </header>
        {session.done ? (
          <Summary known={known} unknown={unknown}>
            {moreBtn}
            <button type="button" className={session.rest.length ? undefined : 'primary'} onClick={() => setSession(null)}>복습 마치기</button>
            <a className="flash-edit-link" href={href.flash(treeId)}><Icon d={I.layers} /> 플래시카드</a>
          </Summary>
        ) : (<>
          {id ? (<>
            <NodePath path={ancestorsOf(byId, id)} label="복습 위치" className="flash-path" />
            <FlashCard key={`${session.i}:${id}`} treeId={treeId} nodes={session.nodes} conceptId={id} colors={colors} srs={srs.map}
              source={dexieSource(treeId)} rateable={session.due}
              onRated={(s, known) => {
                setSrs(({ map }) => ({ map: new Map(map).set(s.nodeId, s), at: new Date() }))
                setSession((ss) => ss && { ...ss, missed: new Map(ss.missed).set(s.nodeId, known) })
              }} onNext={last ? undefined : step} />
            {session.i >= session.base && <p className="muted flash-retry">모름이었던 카드 다시 보기</p>}
          </>) : (
            <p className="muted">복습할 항목이 없습니다.</p>
          )}
          <div className="actions flash-nav">
            {!last && <button type="button" className="primary" aria-label="다음 복습 →" data-tip="다음 복습 (→ / Enter)" onClick={step}><Icon d={arrowRight} /> 다음</button>}
            {last && moreBtn}
            {/* S8: 끝(또는 평가가 있으면 중간에도) 요약. 아무것도 안 했으면 바로 목록으로 */}
            <button type="button" className={last && !session.rest.length ? 'primary' : undefined} onClick={() => (last || session.missed.size ? setSession({ ...session, done: true }) : setSession(null))}>
              {last || session.missed.size ? <><Icon d={listChecks} /> 요약</> : '그만하기'}
            </button>
          </div>
        </>)}
      </section>
    )
  }

  return (
    <section className="review">
      <h1>오늘의 복습</h1>
      {rows === null ? <p>불러오는 중…</p> : rows.length === 0 ? (
        <div className="empty review-empty">
          <Icon d={I.check} size={24} />
          <span>오늘 복습 없음</span>
          <a href="#/">내 트리 ›</a>
        </div>
      ) : (
        <ul aria-label="복습 대상 트리" className="review-list">
          {rows.map(({ tree, due }) => (
            <li key={tree.id} data-tree-id={tree.id} data-due-count={due.length} className="card">
              <strong>{tree.title}</strong>
              <span className="due-count muted">{due.length}항목</span>
              <a className="review-link" href={href.flash(tree.id)}><Icon d={I.layers} /> 플래시카드</a>
              <button type="button" className="primary" aria-label={`복습 시작: ${tree.title}`} onClick={() => start(tree, due)}>복습 시작</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
