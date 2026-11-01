// 전체 트리 축소판 — editor/graph/layout.ts 를 읽기 전용으로 재사용
import { useMemo } from 'react'
import type { ColorInfo } from '../../core/srs'
import type { ID, TreeNode } from '../../core/types'
import { layout } from '../editor/graph/layout'
import { minimapNodes } from './flash'

const SIZE = { w: 40, h: 16 } // 고정 크기 measure (글자 없음)

interface Props {
  nodes: TreeNode[]
  rootId: ID
  currentId: ID
  colors: Map<ID, ColorInfo>
  onGo: (id: ID) => void
}

export default function Minimap({ nodes, rootId, currentId, colors, onGo }: Props) {
  const g = useMemo(() => layout(minimapNodes(nodes), rootId, () => SIZE), [nodes, rootId])
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const hasKids = useMemo(() => new Set(nodes.map((n) => n.parentId)), [nodes])
  const lit = (id: ID) => id === currentId || byId.get(id)?.parentId === currentId

  return (
    <figure className="minimap" aria-label="미니맵">
      <svg viewBox={`0 0 ${g.width} ${g.height}`} preserveAspectRatio="xMidYMin meet">
        {g.edges.map(([p, c]) => {
          const a = g.boxes.get(p)!
          const b = g.boxes.get(c)!
          const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y, my = (y1 + y2) / 2
          return <path key={c} className={p === currentId ? 'lit' : undefined} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} />
        })}
        {[...g.boxes].map(([id, b]) => {
          const n = byId.get(id)!
          const go = hasKids.has(id)
          return (
            <g
              key={id}
              className={`mm-node${lit(id) ? ' lit' : ''}${id === currentId ? ' current' : ''}${go ? ' go' : ''}`}
              data-node-id={id}
              data-color={colors.get(id)?.color ?? 'none'}
              aria-current={id === currentId ? 'location' : undefined}
              {...(go && {
                role: 'button',
                tabIndex: 0,
                'aria-label': `${n.title}(으)로 이동`,
                onClick: () => onGo(id),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(id) }
                },
              })}
            >
              <title>{n.title}</title>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} />
            </g>
          )
        })}
      </svg>
      <figcaption className="muted">전체 트리 · 강조 = 현재 개념</figcaption>
    </figure>
  )
}
