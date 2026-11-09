// 퀴즈 화면 공용 조각: 범위 선택, 트리 캔버스(layout 재사용), 드래그 고스트, 진행 막대, 점수, 결과 마크
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { byOrder, withParent } from '../../core/path'
import type { ID, TreeNode } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { crosshair, x } from '../../ui/icons.all'
import { layout } from '../editor/graph/layout'
import { goTo } from '../flash/study'
import { CARD, sideLayout } from './dnd'
import type { DragState } from './useDragDrop'
import './dnd.css'

const MIN_SCALE = 0.6
const SIDE_MAX = 640 // 캔버스 폭이 이 이하면 좌→우 배치
const SIDE_BELOW_SCALE = 0.8 // 위→아래 배율이 이보다 작으면 좌→우 배치(글자 약 10.4px 미만)
const CANVAS_PAD = 4 // dnd.css .dnd-canvas padding 과 같게

/** 자식 있는 노드를 전위 순서로 [노드, 깊이, 리프 수] */
function branches(nodes: TreeNode[]): [TreeNode, number, number][] {
  const kids = new Map<ID | null, TreeNode[]>()
  for (const n of nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
  const out: [TreeNode, number, number][] = []
  const walk = (n: TreeNode, d: number): number => {
    const ks = (kids.get(n.id) ?? []).sort(byOrder)
    if (!ks.length) return 1
    const row: [TreeNode, number, number] = [n, d, 0]
    out.push(row)
    row[2] = ks.reduce((s, k) => s + walk(k, d + 1), 0)
    return row[2]
  }
  ;(kids.get(null) ?? []).forEach((r) => walk(r, 0))
  return out
}

/** 자식 있는 노드만, 전위 순서·깊이 들여쓰기, 라벨 '방법 — TCP SYN Flooding (3)'(U31). 바꾸면 to(id) 로 이동. 라벨 글자 대신 crosshair 아이콘(aria 는 "범위") */
export function ScopeSelect(p: { nodes: TreeNode[]; value: ID; to: (id: ID) => string }) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]))
  const opts = branches(p.nodes)
  return (
    <label className="dnd-scope" data-tip="범위">
      <Icon d={crosshair} />
      <select aria-label="범위" value={p.value} onChange={(e) => goTo(p.to(e.target.value))}>
        {!opts.some(([n]) => n.id === p.value) && <option value={p.value}>—</option>}
        {opts.map(([n, d, leaves]) => (
          <option key={n.id} value={n.id}>{`${'  '.repeat(d)}${withParent(byId, n)} (${leaves})`}</option>
        ))}
      </select>
    </label>
  )
}

/**
 * U30: 범위가 크고 URL 에 ?root= 가 없으면 바로 시작하지 않고 루트의 가지(리프 수)를 고르게 한다. 고르면 to(id) — '전체로 시작' 은 to(루트)
 */
export function ScopeGate(p: { nodes: TreeNode[]; rootId: ID; to: (id: ID) => string }) {
  const rows = branches(p.nodes)
  const all = rows.find(([n]) => n.id === p.rootId)
  let top = p.rootId // 자식이 하나뿐이면(루트 → '네트워크 기반 공격' 한 줄기) 갈라지는 데까지 내려간다
  for (let k; (k = p.nodes.filter((n) => n.parentId === top)).length === 1; ) top = k[0].id
  const opts = rows.filter(([n]) => n.parentId === top)
  return (
    <div className="card dnd-gate" role="region" aria-label="범위 고르기">
      <h2>어디부터 할까요?</h2>
      <p className="muted">한 번에 하기엔 많아요. 가지를 하나 고르세요.</p>
      <ul>
        {opts.map(([n, , leaves]) => (
          <li key={n.id}><button type="button" onClick={() => goTo(p.to(n.id))}>{n.title} <span className="muted">({leaves})</span></button></li>
        ))}
      </ul>
      <button type="button" className="ghost" onClick={() => goTo(p.to(p.rootId))}>전체로 시작{all ? ` (${all[2]})` : ''}</button>
    </div>
  )
}

/**
 * 트리 캔버스: 폭에 맞춰 축소(최소 MIN_SCALE, 그 아래는 가로 스크롤). 넘치지 않으면 배율 1.
 * 폭 ≤ SIDE_MAX 이거나 위→아래 배율 < SIDE_BELOW_SCALE 이면 좌→우 배치. nodes 의 parentId=null 노드가 루트 — nodes 참조가 같으면 다시 배치하지 않는다.
 * orient: 방향을 정할 때 쓸 트리(기본 nodes). 자라는 트리에 전체 트리를 넘기면 도중에 방향이 뒤집히지 않는다
 */
export function TreeCanvas(p: { nodes: TreeNode[]; orient?: TreeNode[]; render: (n: TreeNode) => ReactNode; label: string; minHeight?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0) // 0 = 아직 재지 않음(첫 페인트 전에 정해진다)
  useLayoutEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(() => setAvail(el.clientWidth - CANVAS_PAD * 2))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const orient = p.orient ?? p.nodes
  const topW = useMemo(() => {
    const root = orient.find((n) => n.parentId === null)
    return root ? layout(orient, root.id, () => CARD).width : 0
  }, [orient])
  const sideW = avail > 0 && (avail <= SIDE_MAX || avail / topW < SIDE_BELOW_SCALE) ? avail : 0
  const view = useMemo(() => {
    const root = p.nodes.find((n) => n.parentId === null)
    if (!root) return null
    const g = sideW ? sideLayout(p.nodes, root.id, sideW) : layout(p.nodes, root.id, () => CARD)
    // 채점 결과 stagger 순서(--i): 왼쪽 위부터 = y, 그다음 x
    const rank = new Map([...g.boxes].sort(([, a], [, b]) => a.y - b.y || a.x - b.x).map(([id], i) => [id, i]))
    return { g, rank, rootId: root.id, byId: new Map(p.nodes.map((n) => [n.id, n])) }
  }, [p.nodes, sideW])
  const g = view?.g
  const scale = g && avail ? Math.max(MIN_SCALE, Math.min(1, avail / g.width)) : 1
  return (
    <div ref={box} className={`dnd-canvas${sideW ? ' dnd-side' : ''}`} aria-label={p.label} style={{ minHeight: p.minHeight }}>
      {view && g && (
        <div className="dnd-graph" style={{ width: g.width * scale, height: g.height * scale }}>
          <div className="dnd-plane" style={{ width: g.width, height: g.height, transform: scale < 1 ? `scale(${scale})` : undefined }}>
            <svg width={g.width} height={g.height} aria-hidden>
              {g.edges.map(([a, b]) => {
                const pa = g.boxes.get(a)!
                const pb = g.boxes.get(b)!
                const d = sideW
                  ? edge(pa.x + pa.w, pa.y + pa.h / 2, pb.x, pb.y + pb.h / 2, true)
                  : edge(pa.x + pa.w / 2, pa.y + pa.h, pb.x + pb.w / 2, pb.y, false)
                return <path key={b} d={d} className={a === view.rootId ? 'from-root' : undefined} />
              })}
            </svg>
            {[...g.boxes].map(([id, b]) => (
              <div key={id} className="dnd-pos" style={{ left: b.x, top: b.y, width: b.w, height: b.h, '--i': view.rank.get(id) } as CSSProperties}>
                {p.render(view.byId.get(id)!)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function edge(x1: number, y1: number, x2: number, y2: number, side: boolean) {
  const m = side ? (x1 + x2) / 2 : (y1 + y2) / 2
  return side ? `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1},${m} ${x2},${m} ${x2},${y2}`
}

export function Ghost({ drag, title }: { drag: DragState | null; title: (id: ID) => string }) {
  if (!drag) return null
  const style = { left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.w, height: drag.h } as CSSProperties
  return (
    <div className="dnd-ghost" aria-hidden style={style}>
      <span>{title(drag.id)}</span>
    </div>
  )
}

/** 채점 결과의 색 아닌 단서(01 §3.6 #10): 카드·슬롯 우상단 ✓ / ✕. 색은 [data-result] 가 정한다 */
export function ResultMark({ ok }: { ok: boolean | undefined }) {
  return ok === undefined ? null : <span className="dnd-mark" aria-hidden><Icon d={ok ? I.check : x} /></span>
}

/** 점수: n / m. 만점은 ok 테두리 카드 + ✓(#12) */
export function ScoreLine({ correct, total }: { correct: number; total: number }) {
  const perfect = correct === total
  return (
    <p role="status" className={`dnd-score${perfect ? ' perfect' : ''}`} data-correct={correct} data-total={total} aria-label={`정답 ${correct} / ${total}`}>
      {perfect && <Icon d={I.check} />}<b>{correct}</b> / {total}
    </p>
  )
}

/** 배치 진행: 얇은 막대 + n/m */
export function Progress({ n, total }: { n: number; total: number }) {
  return (
    <span className="dnd-progress" data-tip="배치">
      <span aria-hidden><i style={{ width: `${(n / total) * 100}%` }} /></span>
      {n}/{total}
    </span>
  )
}
