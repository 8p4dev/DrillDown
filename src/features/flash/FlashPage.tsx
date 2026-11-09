// 플래시카드 모드 (plan §1 F1)
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StudySource } from '../../core/source'
import { ancestorsOf } from '../../core/path'
import { getRoot } from '../../core/repo'
import { colorMap } from '../../core/srs'
import type { ID, NodeSrs, TreeNode } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { NodePath } from '../../ui/NodePath'
import { arrowRight, listChecks, rotateCcw, x } from '../../ui/icons.all'
import { shuffle } from '../dnd/dnd'
import { ScopeSelect } from '../dnd/kit'
import TreeHeader from '../TreeHeader'
import FlashCard from './FlashCard'
import Minimap from './Minimap'
import { conceptsIn, missedConcepts, readProgress, requeueMissed, type Progress } from './flash'
import { coarseHint, goTo, useStudySource } from './study'
import './flash.css'

const MINIMAP_MAX = 100 // U39: 이보다 크면 미니맵이 회색 줄이라 숨긴다

// U38: 진행은 트리+범위별 localStorage(7일). 같은 탭 새로고침은 조용히 이어지고(sessionStorage 표시), 새 탭·다음 날은 묻는다
type Session = Omit<Progress, 'tally' | 'at'> & { tally: Map<ID, boolean> }
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); sessionStorage.setItem(k, '1') } catch { /* 사생활 모드 등: 저장 없이 진행 */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* 위와 같음 */ } },
  live: (k: string) => { try { return !!sessionStorage.getItem(k) } catch { return false } },
}
const fromSaved = (p: Progress): Session => ({ queue: p.queue, base: p.base, pos: p.pos, shuffled: p.shuffled, tally: new Map(p.tally) })

export default function FlashPage({ treeId, rootId, source }: { treeId: string; rootId?: string; source?: StudySource }) {
  const src = useStudySource(source, treeId)
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  const [srs, setSrs] = useState({ map: new Map<ID, NodeSrs>(), at: new Date(0) }) // at = 색 계산 기준 시각
  const [session, setSession] = useState<Session | null>(null)
  const [offer, setOffer] = useState<Progress | null>(null) // '이어서 하기 / 처음부터' 대기
  const [done, setDone] = useState(false)

  useEffect(() => {
    Promise.all([src.nodes(), src.srs()]).then(([ns, s]) => {
      setNodes(ns)
      setSrs({ map: s, at: new Date() })
      if (ns.length) coarseHint('flash', '카드 탭 = 펼치기', I.layers)
    })
  }, [src])

  const tree = useMemo(() => {
    if (!nodes?.length) return null
    const root = getRoot(nodes)
    const scope = nodes.some((n) => n.id === rootId) ? rootId! : root.id
    return { root, scope }
  }, [nodes, rootId])
  const colors = useMemo(() => colorMap(nodes ?? [], srs.map, srs.at), [nodes, srs])
  const byId = useMemo(() => new Map((nodes ?? []).map((n) => [n.id, n])), [nodes])
  const concepts = useMemo(() => (nodes && tree ? conceptsIn(nodes, tree.scope) : []), [nodes, tree])
  const key = tree && !source ? `flash:${treeId}:${tree.scope}` : null // 공유 보기(D19)는 저장하지 않음
  const fresh = useCallback((shuffled: boolean): Session => {
    const queue = !concepts.length ? [tree?.scope ?? ''] : shuffled ? [concepts[0], ...shuffle(concepts.slice(1))] : concepts // 섞어도 범위 루트(개관)는 맨 앞
    return { queue, base: queue.length, pos: 0, shuffled, tally: new Map() }
  }, [concepts, tree])

  // 범위가 정해지면(처음·범위 변경) 저장본을 읽는다
  useEffect(() => {
    if (!tree) return
    // oxlint-disable-next-line react/set-state-in-effect -- 범위가 바뀔 때 localStorage(외부) 저장본으로 세션을 다시 연다
    setDone(false)
    const saved = key ? readProgress(store.get(key), concepts, Date.now()) : null
    if (key && !saved) store.del(key) // 7일 지남·트리 바뀜 → 버림
    if (key && saved && (saved.pos > 0 || saved.tally.length) && !store.live(key)) { setOffer(saved); setSession(null) }
    else { setOffer(null); setSession(saved ? fromSaved(saved) : fresh(false)) }
  }, [key, tree, concepts, fresh])
  useEffect(() => {
    if (key && session) store.set(key, JSON.stringify({ ...session, tally: [...session.tally], at: Date.now() } satisfies Progress))
  }, [key, session])

  const at = session?.queue[session.pos] ?? tree?.scope ?? '' // '' 는 아래 빈 트리 분기에서 걸러진다
  const path = useMemo(() => ancestorsOf(byId, at), [byId, at])
  const to = (id: ID) => (source ? href.shared(treeId, 'flash', id) : href.flash(treeId, id))
  const kids = useMemo(() => (nodes ?? []).filter((n) => n.parentId === at), [nodes, at])
  const tally = session?.tally ?? new Map<ID, boolean>()
  const ext = session ? requeueMissed(session.queue, session.base, session.pos, missedConcepts(byId, tally)) : [] // U40: 끝에 모름 개념 한 번 더
  const next = session ? ext[session.pos + 1] ?? null : null

  if (!nodes) return <section className="flash"><TreeHeader treeId={treeId} active="flash" /><p>불러오는 중…</p></section>
  if (!tree) return (
    <section className="flash">
      <TreeHeader treeId={treeId} active="flash" />
      <p className="empty muted">트리가 비어 있습니다 <a href={href.edit(treeId)}>편집 ›</a></p>
    </section>
  )

  const go = (id: ID) => { setDone(false); setSession((s) => s && { ...s, pos: Math.max(0, s.queue.lastIndexOf(id)) }) }
  const pick = (id: ID) => (concepts.includes(id) ? go(id) : goTo(to(id))) // 범위 밖(경로·미니맵)이면 그 노드로 범위를 옮긴다
  const onRated = (s: NodeSrs, known: boolean) => {
    setSrs(({ map }) => ({ map: new Map(map).set(s.nodeId, s), at: new Date() }))
    setSession((ss) => ss && { ...ss, tally: new Map(ss.tally).set(s.nodeId, known) })
  }
  const known = [...tally.values()].filter(Boolean).length
  const retrying = !!session && session.pos >= session.base
  const rated = retrying ? new Map([...tally].filter(([, k]) => k)) : tally // 재출제 카드는 모름 하위를 다시 묻는다
  const allRated = kids.length > 0 && kids.every((k) => rated.has(k.id)) // → [다음] 한 번 강조
  const advance = () => {
    if (next && session) return setSession({ ...session, queue: ext, pos: session.pos + 1 })
    setDone(true)
    if (key) store.del(key) // 끝까지 봤으면 이어서 할 것 없음
  }
  const restart = (s: Session) => { setOffer(null); setDone(false); setSession(s) }
  const unknown = [...tally].filter(([, k]) => !k).map(([id]) => byId.get(id)).filter(Boolean) as TreeNode[]
  const missedOnly = (s: Session): Session => {
    const missed = missedConcepts(byId, s.tally)
    const queue = s.queue.slice(0, s.base).filter((id) => missed.has(id))
    return { queue, base: queue.length, pos: 0, shuffled: s.shuffled, tally: new Map() }
  }

  return (
    <section className="flash">
      <TreeHeader treeId={treeId} active="flash">
        <ScopeSelect nodes={nodes} value={tree.scope} to={to} />
        {session && <span className="flash-progress muted" aria-label="진행">{session.pos + 1}/{session.queue.length}</span>}
        {session && (
          <button type="button" className="ghost" aria-pressed={session.shuffled} data-tip="개념 순서 섞기(처음 카드부터)" onClick={() => restart({ ...fresh(!session.shuffled), tally: session.tally })}>
            섞기
          </button>
        )}
        {/* 보이는 건 ✓N ✕M, 읽히는 텍스트는 "알음 N · 모름 M"(DS .sr-only) */}
        <span className="flash-tally muted" aria-label="평가 집계">
          <Icon d={I.check} className="ok" /><span className="sr-only">알음 </span><b key={`k${known}`} className="pop-num">{known}</b><span className="sr-only"> · </span>
          <Icon d={x} className="no" /><span className="sr-only">모름 </span><b key={`u${unknown.length}`} className="pop-num">{unknown.length}</b>
        </span>
      </TreeHeader>
      <div className={`flash-layout${nodes.length > MINIMAP_MAX ? ' solo' : ''}`}>
        <div className="flash-stage">
          {offer ? (
            <div className="card flash-summary" role="region" aria-label="이어서 하기">
              <h2>지난 진행이 있어요</h2>
              <p className="muted">{offer.pos + 1}/{offer.queue.length}번째 개념 · 평가 {offer.tally.length}개 · {new Date(offer.at).toLocaleDateString()}</p>
              <div className="actions">
                <button type="button" className="primary" onClick={() => restart(fromSaved(offer))}><Icon d={arrowRight} /> 이어서 하기</button>
                <button type="button" onClick={() => restart(fresh(offer.shuffled))}><Icon d={rotateCcw} /> 처음부터</button>
              </div>
            </div>
          ) : !session ? null : done ? (
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
                {unknown.length > 0 && <button type="button" className="primary" onClick={() => restart(missedOnly(session))}><Icon d={x} /> 모름만 다시</button>}
                <button type="button" className={unknown.length ? undefined : 'primary'} onClick={() => restart(fresh(session.shuffled))}><Icon d={rotateCcw} /> 처음부터 다시</button>
                <a className="flash-edit-link" href={href.edit(treeId, rootId)}><Icon d={I.pencil} /> 편집으로</a>
              </div>
            </div>
          ) : (
            <>
              <NodePath path={path} onPick={pick} className="flash-path" />
              <FlashCard key={`${session.pos}:${at}`} treeId={treeId} nodes={nodes} conceptId={at} colors={colors} source={src} onRated={onRated} onDive={go} initialRated={rated} onNext={advance} />
              {retrying && <p className="muted flash-retry">모름이었던 카드 다시 보기</p>}
              <div className="actions flash-nav">
                <button
                  type="button"
                  className={`primary${allRated ? ' ready' : ''}`}
                  aria-label={next ? '다음 개념 →' : '요약 보기'}
                  data-tip={`${next ? '다음 개념' : '요약 보기'} (→ / Enter)`}
                  onClick={advance}
                >
                  <Icon d={next ? arrowRight : listChecks} /> {next ? '다음' : '요약'}
                </button>
                {next && <button type="button" onClick={() => setDone(true)}><Icon d={listChecks} /> 요약</button>}
              </div>
            </>
          )}
        </div>
        {nodes.length <= MINIMAP_MAX && ( // 숨길 땐 aside 째 없애 폭을 돌려받는다
          <aside className="flash-aside">
            <Minimap nodes={nodes} rootId={tree.root.id} currentId={at} colors={colors} onGo={pick} />
          </aside>
        )}
      </div>
    </section>
  )
}
