// 플래시카드 모드 (plan §1 F1)
import { useEffect, useMemo, useState } from 'react'
import { getRoot, getTreeNodes } from '../../core/repo'
import { colorMap, getSrsMap } from '../../core/srs'
import type { ID, NodeSrs, TreeNode } from '../../core/types'
import { href } from '../../router'
import TreeHeader from '../TreeHeader'
import FlashCard from './FlashCard'
import Minimap from './Minimap'
import { nextConcept } from './flash'
import './flash.css'

const byIdHas = (ns: TreeNode[], id: ID) => ns.some((n) => n.id === id)

// 세션 진행(현재 개념·노드별 마지막 평가)은 탭 세션 동안 유지 — 새로고침해도 집계가 남는다
type Saved = { current: ID | null; tally: [ID, boolean][] }
const KEY = (treeId: string) => `flash:${treeId}`
function load(treeId: string): Saved {
  try {
    return JSON.parse(sessionStorage.getItem(KEY(treeId)) ?? '') as Saved
  } catch {
    return { current: null, tally: [] }
  }
}

export default function FlashPage({ treeId, rootId }: { treeId: string; rootId?: string }) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  const [srs, setSrs] = useState({ map: new Map<ID, NodeSrs>(), at: new Date(0) }) // at = 색 계산 기준 시각
  const [saved] = useState(() => load(treeId))
  const [current, setCurrent] = useState<ID | null>(saved.current)
  const [done, setDone] = useState(false)
  const [tally, setTally] = useState(() => new Map<ID, boolean>(saved.tally)) // 노드별 마지막 평가
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY(treeId), JSON.stringify({ current, tally: [...tally] } satisfies Saved))
    } catch { /* 저장 불가(사생활 모드 등)면 새로고침 시 초기화될 뿐 */ }
  }, [treeId, current, tally])

  useEffect(() => {
    Promise.all([getTreeNodes(treeId), getSrsMap(treeId)]).then(([ns, s]) => {
      setNodes(ns)
      setSrs({ map: s, at: new Date() })
    })
  }, [treeId])

  const tree = useMemo(() => {
    if (!nodes?.length) return null
    const root = getRoot(nodes)
    const scope = nodes.some((n) => n.id === rootId) ? rootId! : root.id
    return { root, scope }
  }, [nodes, rootId])
  const colors = useMemo(() => colorMap(nodes ?? [], srs.map, srs.at), [nodes, srs])

  if (!nodes) return <section className="flash"><TreeHeader treeId={treeId} active="flash" /><p>불러오는 중…</p></section>
  if (!tree) return <section className="flash"><TreeHeader treeId={treeId} active="flash" /><p className="muted">트리가 비어 있습니다.</p></section>

  const at = current && byIdHas(nodes, current) ? current : tree.scope
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const path: TreeNode[] = []
  for (let n = byId.get(at); n; n = n.parentId ? byId.get(n.parentId) : undefined) path.unshift(n)
  const next = nextConcept(nodes, tree.scope, at)
  const go = (id: ID) => { setDone(false); setCurrent(id) }
  const onRated = (s: NodeSrs, known: boolean) => {
    setSrs(({ map }) => ({ map: new Map(map).set(s.nodeId, s), at: new Date() }))
    setTally((m) => new Map(m).set(s.nodeId, known))
  }
  const known = [...tally.values()].filter(Boolean).length
  const kids = nodes.filter((n) => n.parentId === at)
  const allRated = kids.length > 0 && kids.every((k) => tally.has(k.id)) // → [다음] 한 번 강조
  const advance = () => (next ? go(next) : setDone(true))
  const unknown = [...tally].filter(([, k]) => !k).map(([id]) => byId.get(id)).filter(Boolean) as TreeNode[]

  return (
    <section className="flash">
      <TreeHeader treeId={treeId} active="flash">
        <span className="flash-tally muted" aria-label="평가 집계">알음 <b key={`k${known}`} className="pop-num">{known}</b> · 모름 <b key={`u${unknown.length}`} className="pop-num">{unknown.length}</b></span>
      </TreeHeader>
      <div className="flash-layout">
        <div className="flash-stage">
          {done ? (
            <div className="card flash-summary" role="region" aria-label="요약">
              <h2>수고했어요</h2>
              <p className="flash-summary-nums">
                <span className="known" data-known={known}>알음 <strong>{known}</strong></span>
                <span className="unknown" data-unknown={unknown.length}>모름 <strong>{unknown.length}</strong></span>
              </p>
              {unknown.length > 0 && (
                <>
                  <p className="muted">모름으로 표시한 개념</p>
                  <ul className="flash-missed">{unknown.map((n) => <li key={n.id}>{n.title}</li>)}</ul>
                </>
              )}
              <div className="actions">
                <button type="button" className="primary" onClick={() => { setTally(new Map()); go(tree.scope) }}>처음부터 다시</button>
                <a className="flash-edit-link" href={href.edit(treeId)}>편집으로</a>
              </div>
            </div>
          ) : (
            <>
              {path.length > 1 && <nav aria-label="현재 위치" className="flash-path">
                {path.map((n, i) => (
                  <span key={n.id}>
                    {i > 0 && <span className="sep">›</span>}
                    {i < path.length - 1 ? <button type="button" className="link" onClick={() => go(n.id)}>{n.title}</button> : <span aria-current="location">{n.title}</span>}
                  </span>
                ))}
              </nav>}
              <FlashCard key={at} treeId={treeId} nodes={nodes} conceptId={at} colors={colors} onRated={onRated} onDive={go} initialRated={tally} onNext={advance} />
              <div className="actions flash-nav">
                <button type="button" className={`primary${allRated ? ' pulse' : ''}`} title={`${next ? '다음 개념' : '요약 보기'} (→ / Enter)`} onClick={advance}>
                  {next ? '다음 개념 →' : '요약 보기'}
                </button>
                {next && <button type="button" onClick={() => setDone(true)}>요약</button>}
              </div>
            </>
          )}
        </div>
        <aside className="flash-aside">
          <Minimap nodes={nodes} rootId={tree.root.id} currentId={at} colors={colors} onGo={go} />
        </aside>
      </div>
    </section>
  )
}
