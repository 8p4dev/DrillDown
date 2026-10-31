import { useState } from 'react'
import { logEvent } from '../../core/events'
import { gradeBlank, type GradeResult } from '../../core/grading'
import { childrenOf } from '../../core/repo'
import { recordGrade } from '../../core/srs'
import type { TreeNode } from '../../core/types'
import { finalSource, isRecalled, linesToUserNodes, SOURCE_LABEL } from './grade'
import IdeaUnits from './IdeaUnits'
import './study.css'

type Phase = 'input' | 'graded' | 'recorded' | 'peek'

/** 세로 드릴다운 한 단계: 하위 항목 먼저 입력 → 순차 공개 + 깊이1 자동 대조 → 애매 항목 자기채점 → 기록 */
export default function Drill({ treeId, nodes, node, onOpen }: {
  treeId: string
  nodes: TreeNode[]
  node: TreeNode
  onOpen?: (childId: string) => void
}) {
  const kids = childrenOf(nodes, node.id)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [result, setResult] = useState<GradeResult | null>(null)
  const [checked, setChecked] = useState<Record<string, number>>({})

  if (!kids.length) return <p className="drill-empty">하위 항목이 없습니다.</p>

  const reveal = () => {
    setResult(gradeBlank(kids, node.id, linesToUserNodes(text)))
    setPhase('graded')
  }
  const record = async () => {
    if (!result || phase !== 'graded') return
    setPhase('recorded')
    let recalled = 0
    for (const m of result.matches) {
      const src = finalSource(m, checked[m.origNodeId] ?? 0, false)
      if (isRecalled(src)) recalled++
      await recordGrade(m.origNodeId, treeId, src, m.structure)
    }
    await logEvent('drilldown_retrieval_submitted', { nodeId: node.id, childCount: kids.length, recalled }, treeId)
  }
  const match = (id: string) => result?.matches.find((m) => m.origNodeId === id)

  if (phase === 'input')
    return (
      <div className="drill">
        <p>"{node.title}"의 하위 항목을 떠올려 한 줄에 하나씩 적으세요 ({kids.length}개, 모르면 "모름").</p>
        <textarea aria-label="하위 항목 입력" rows={Math.max(3, kids.length + 1)} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="actions">
          <button type="button" onClick={reveal}>공개</button>
          <button type="button" onClick={() => setPhase('peek')}>그냥 보기</button>
        </div>
      </div>
    )

  return (
    <div className="drill">
      <ol className="drill-children" aria-label="하위 항목">
        {kids.map((k, i) => {
          const m = match(k.id)
          const src = m && finalSource(m, checked[k.id] ?? 0, false)
          return (
            <li key={k.id} className="drill-child reveal" style={{ '--i': i } as React.CSSProperties} data-node-id={k.id} data-grade={src}>
              <span className="drill-title">{k.title}</span>
              {m && src && (
                <span className={`verdict v-${src}`}>
                  {m.userText ? `내 답: ${m.userText}` : '입력 없음'} · {m.autoClass === 'ambiguous' ? '애매 — 의미 단위를 체크하세요' : SOURCE_LABEL[src]}
                </span>
              )}
              {m?.autoClass === 'ambiguous' && phase === 'graded' && (
                <IdeaUnits units={m.ideaUnits} onChange={(n) => setChecked((c) => ({ ...c, [k.id]: n }))} />
              )}
              {phase !== 'graded' && onOpen && childrenOf(nodes, k.id).length > 0 && (
                <button type="button" aria-label={`${k.title} 드릴다운`} onClick={() => onOpen(k.id)}>더 들어가기 ▸</button>
              )}
            </li>
          )
        })}
      </ol>
      {result && result.extraUserNodes.length > 0 && (
        <p className="extra">원본에 없는 항목: {result.extraUserNodes.map((u) => u.text).join(', ')}</p>
      )}
      {phase === 'graded' && <button type="button" onClick={record}>판정 기록</button>}
      {phase === 'recorded' && <p role="status">판정을 기록했습니다.</p>}
      {phase === 'peek' && <p className="hint">그냥 보기 — 판정·기록하지 않습니다.</p>}
    </div>
  )
}
