// 퀴즈 화면 공용 조각: 범위 선택, 트리 캔버스(layout 재사용), 드래그 고스트, 진행 막대, 점수
import type { CSSProperties, ReactNode } from 'react'
import type { ID, TreeNode } from '../../core/types'
import { layout } from '../editor/graph/layout'
import type { DragState } from './useDragDrop'
import './dnd.css'

const CARD = { w: 148, h: 44 } // 모든 칸 고정 크기(제목 2줄 말줄임)

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

/** 위→아래 트리. nodes 의 parentId=null 노드가 루트 */
export function TreeCanvas(p: { nodes: TreeNode[]; render: (n: TreeNode) => ReactNode; label: string; minHeight?: number }) {
  const root = p.nodes.find((n) => n.parentId === null)
  const g = root ? layout(p.nodes, root.id, () => CARD) : null
  const byId = new Map(p.nodes.map((n) => [n.id, n]))
  // 채점 결과 stagger 순서(--i): 왼쪽 위부터 = y, 그다음 x
  const rank = new Map(g ? [...g.boxes].sort(([, a], [, b]) => a.y - b.y || a.x - b.x).map(([id], i) => [id, i]) : [])
  return (
    <div className="dnd-canvas" aria-label={p.label} style={{ minHeight: p.minHeight }}>
      {g && (
        <div className="dnd-graph" style={{ width: g.width, height: g.height }}>
          <svg width={g.width} height={g.height} aria-hidden>
            {g.edges.map(([a, b]) => {
              const pa = g.boxes.get(a)!
              const pb = g.boxes.get(b)!
              const [x1, y1, x2, y2] = [pa.x + pa.w / 2, pa.y + pa.h, pb.x + pb.w / 2, pb.y]
              const my = (y1 + y2) / 2
              return <path key={b} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} />
            })}
          </svg>
          {[...g.boxes].map(([id, b]) => (
            <div key={id} className="dnd-pos" style={{ left: b.x, top: b.y, width: b.w, height: b.h, '--i': rank.get(id) } as CSSProperties}>
              {p.render(byId.get(id)!)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Ghost({ drag, title }: { drag: DragState | null; title: (id: ID) => string }) {
  if (!drag) return null
  return (
    <div className="dnd-ghost" aria-hidden style={{ left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.w }}>
      {title(drag.id)}
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
