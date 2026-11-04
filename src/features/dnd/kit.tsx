// 퀴즈 화면 공용 조각: 범위 선택, 트리 캔버스(layout 재사용), 드래그 고스트, 진행 막대, 점수
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ID, TreeNode } from '../../core/types'
import { layout } from '../editor/graph/layout'
import { CARD, sideLayout } from './dnd'
import type { DragState } from './useDragDrop'
import './dnd.css'

const MIN_SCALE = 0.6
const SIDE_MAX = 640 // 캔버스 폭이 이 이하면 좌→우 배치
const CANVAS_PAD = 4 // dnd.css .dnd-canvas padding 과 같게

/** 자식 있는 노드만, 전위 순서·깊이 들여쓰기. 바꾸면 to(id) 로 이동 */
export function ScopeSelect(p: { nodes: TreeNode[]; value: ID; to: (id: ID) => string }) {
  const kids = new Map<ID | null, TreeNode[]>()
  for (const n of p.nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
  const opts: [TreeNode, number][] = []
  const walk = (n: TreeNode, d: number) => {
    const ks = (kids.get(n.id) ?? []).sort((a, b) => a.order - b.order)
    if (!ks.length) return
    opts.push([n, d])
    ks.forEach((k) => walk(k, d + 1))
  }
  ;(kids.get(null) ?? []).forEach((r) => walk(r, 0))
  return (
    <label className="dnd-scope">
      <span className="muted">범위</span>
      <select aria-label="범위" value={p.value} onChange={(e) => (location.hash = p.to(e.target.value))}>
        {!opts.some(([n]) => n.id === p.value) && <option value={p.value}>—</option>}
        {opts.map(([n, d]) => (
          <option key={n.id} value={n.id}>{'  '.repeat(d) + n.title}</option>
        ))}
      </select>
    </label>
  )
}

/**
 * 트리 캔버스: 폭에 맞춰 축소(최소 MIN_SCALE, 그 아래는 가로 스크롤). 넘치지 않으면 배율 1.
 * 폭 ≤ SIDE_MAX 는 좌→우 배치, 그 외 위→아래. nodes 의 parentId=null 노드가 루트 — nodes 참조가 같으면 다시 배치하지 않는다
 */
export function TreeCanvas(p: { nodes: TreeNode[]; render: (n: TreeNode) => ReactNode; label: string; minHeight?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0) // 0 = 아직 재지 않음(첫 페인트 전에 정해진다)
  useLayoutEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(() => setAvail(el.clientWidth - CANVAS_PAD * 2))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const sideW = avail > 0 && avail <= SIDE_MAX ? avail : 0
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
    <div ref={box} className="dnd-canvas" aria-label={p.label} style={{ minHeight: p.minHeight }}>
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
  const style = { left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.w, height: drag.h, '--tilt': `${drag.tilt}deg` } as CSSProperties
  return (
    <div className="dnd-ghost" aria-hidden style={style}>
      <span>{title(drag.id)}</span>
    </div>
  )
}

/** 결과 문구: 정답 n / 전체 */
export function ScoreLine({ correct, total }: { correct: number; total: number }) {
  return (
    <p role="status" className={`dnd-score${correct === total ? ' perfect' : ''}`} data-correct={correct} data-total={total}>
      정답 <b>{correct}</b> / {total}
      {correct === total ? ' — 완벽해요!' : ''}
    </p>
  )
}

/** 배치 진행: 얇은 막대 + n/m */
export function Progress({ n, total }: { n: number; total: number }) {
  return (
    <span className="dnd-progress" title="배치">
      <span aria-hidden><i style={{ width: `${(n / total) * 100}%` }} /></span>
      {n}/{total}
    </span>
  )
}
