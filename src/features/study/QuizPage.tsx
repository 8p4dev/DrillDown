import { useEffect, useRef, useState } from 'react'
import { db, newId } from '../../core/db'
import { logEvent } from '../../core/events'
import { gradeBlank, normalize, resolveGradeSource, type GradeResult } from '../../core/grading'
import { parseOutline } from '../../core/outline'
import { addAlias, childrenOf, descendantsOf, getTreeNodes } from '../../core/repo'
import { recordGrade } from '../../core/srs'
import type { TreeNode } from '../../core/types'
import { href } from '../../router'
import { canOverride, finalSource, outlineToUserNodes, pct, SOURCE_LABEL, summarize } from './grade'
import IdeaUnits from './IdeaUnits'
import './study.css'

export default function QuizPage({ treeId, rootId }: { treeId: string; rootId?: string }) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  useEffect(() => void getTreeNodes(treeId).then(setNodes), [treeId])
  if (!nodes) return <p>불러오는 중…</p>
  const root = nodes.find((n) => n.parentId === null)
  const scope = nodes.find((n) => n.id === rootId) ?? root
  if (!root || !scope) return <p>트리를 찾을 수 없습니다. <a href={href.trees()}>목록으로</a></p>
  return <Quiz key={scope.id} treeId={treeId} nodes={nodes} root={root} scope={scope} />
}

/** 이벤트 핸들러 전용 시각 (lint purity 규칙이 핸들러 안의 Date.now 를 렌더로 오인) */
const nowMs = () => Date.now()

/** rootId 기준 상대 깊이 (rootId 자신 = 0) */
function depths(nodes: TreeNode[], rootId: string): Map<string, number> {
  const d = new Map([[rootId, 0]])
  for (const n of descendantsOf(nodes, rootId)) d.set(n.id, d.get(n.parentId!)! + 1)
  return d
}

function Quiz({ treeId, nodes, root, scope }: { treeId: string; nodes: TreeNode[]; root: TreeNode; scope: TreeNode }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<GradeResult | null>(null)
  const [checked, setChecked] = useState<Record<string, number>>({})
  const [overridden, setOverridden] = useState<Set<string>>(new Set())
  const [aliased, setAliased] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<'input' | 'result' | 'saving' | 'done'>('input')
  const [attemptId] = useState(newId)
  const [startedAt] = useState(() => nowMs())
  const shownAt = useRef(0)
  const touched = useRef<Record<string, number>>({})

  const original = descendantsOf(nodes, scope.id)
  const scopeOptions = [root, ...descendantsOf(nodes, root.id).filter((n) => childrenOf(nodes, n.id).length)]
  const treeDepth = depths(nodes, root.id)
  const depth = depths(nodes, scope.id)

  const submit = () => {
    setResult(gradeBlank(original, scope.id, outlineToUserNodes(parseOutline(text), scope.title)))
    shownAt.current = nowMs()
    setPhase('result')
  }
  const touch = (id: string) => (touched.current[id] = nowMs())
  const toggleOverride = (id: string) => {
    touch(id)
    setOverridden((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  if (phase === 'input')
    return (
      <section className="quiz">
        <label className="scope">
          범위{' '}
          <select aria-label="범위" value={scope.id} onChange={(e) => (location.hash = href.quiz(treeId, e.target.value === root.id ? undefined : e.target.value))}>
            {scopeOptions.map((n) => (
              <option key={n.id} value={n.id}>{'  '.repeat(treeDepth.get(n.id) ?? 0) + n.title}{n.id === root.id ? ' (트리 전체)' : ''}</option>
            ))}
          </select>
        </label>
        <h1>{scope.title}</h1>
        {original.length === 0 ? (
          <p className="muted">이 범위에는 하위 항목이 없습니다.</p>
        ) : (
          <>
            <div className="card">
            <p className="prompt">"{scope.title}" 아래의 목차를 기억나는 대로 들여쓰기(탭·스페이스)로 적으세요.</p>
            <textarea aria-label="백지 목차 입력" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={'항목 1\n  하위 항목\n항목 2'} />
            <div className="actions"><button type="button" className="primary" onClick={submit}>제출</button></div>
            </div>
          </>
        )}
      </section>
    )

  const r = result!
  const s = summarize(r, overridden)
  const isOv = (id: string, m: (typeof r.matches)[number]) => overridden.has(id) && canOverride(m)
  const srcOf = (m: (typeof r.matches)[number]) => finalSource(m, checked[m.origNodeId] ?? 0, isOv(m.origNodeId, m))
  const locked = phase !== 'result'

  const confirm = async () => {
    if (locked) return
    setPhase('saving')
    for (const m of r.matches) {
      const id = m.origNodeId
      const src = srcOf(m)
      await recordGrade(id, treeId, src, m.structure)
      const t = touched.current[id]
      await logEvent('blank_node_graded', { attemptId, origNodeId: id, gradeSource: src, similarity: m.similarity, msToDecide: t ? t - shownAt.current : 0 }, treeId)
      if (isOv(id, m)) await logEvent('blank_grade_overridden', { attemptId, origNodeId: id, from: resolveGradeSource(m), to: src }, treeId)
    }
    await db.attempts.add({
      id: attemptId, treeId, rootId: scope.id, startedAt, completedAt: nowMs(),
      nodeRecall: r.nodeRecall, edgeAccuracy: r.edgeAccuracy,
      autoGradedCount: s.auto, selfGradedCount: s.ambiguous, overriddenCount: s.overridden,
    })
    await logEvent('blank_attempt_completed', {
      attemptId, treeId, nodeCount: r.matches.length, selfGradedCount: s.ambiguous, autoGradedCount: s.auto, overriddenCount: s.overridden,
    }, treeId)
    setPhase('done')
  }

  return (
    <section className="quiz">
      <h1>{scope.title} — 결과</h1>
      <p className="summary" aria-label="채점 요약" data-auto={s.auto} data-self={s.self}>
        자동 확인 {s.auto} / 자기 판정 {s.self} / 재현율 {pct(s.recall)} / 구조 정확도 {pct(s.edge)}
      </p>
      <table aria-label="채점 결과">
        <thead><tr><th>원본</th><th>내 답</th><th>판정</th><th>자기채점 · 뒤집기</th></tr></thead>
        <tbody>
          {original.map((o) => {
            const m = r.matches.find((x) => x.origNodeId === o.id)!
            const src = srcOf(m)
            return (
              <tr key={o.id} data-orig-id={o.id} data-grade={src}>
                <td style={{ paddingLeft: `${(depth.get(o.id)! - 1) * 1.25 + 0.4}rem` }}>{o.title}</td>
                <td>
                  {m.userText ?? <span className="hint">—</span>}
                  {m.structure === 'misplaced' && <span className="misplaced-tag"> (위치 오류)</span>}
                </td>
                <td className={`verdict v-${src}`}>{m.autoClass === 'ambiguous' && !(checked[o.id] > 0) ? '애매 · ' : ''}{SOURCE_LABEL[src]}</td>
                <td>
                  {m.autoClass === 'ambiguous' && !locked && (
                    <IdeaUnits units={m.ideaUnits} onChange={(n) => (touch(o.id), setChecked((c) => ({ ...c, [o.id]: n })))} />
                  )}
                  {canOverride(m) && (
                    <label className="override">
                      <input type="checkbox" aria-label={`판정 뒤집기: ${o.title}`} disabled={locked} checked={overridden.has(o.id)} onChange={() => toggleOverride(o.id)} /> 뒤집기
                    </label>
                  )}
                  {src === 'self_accept' && m.userText && normalize(m.userText) !== normalize(o.title) && (
                    <button
                      type="button"
                      aria-label={`허용 표현에 추가: ${o.title}`}
                      disabled={aliased.has(o.id)}
                      onClick={() => addAlias(o.id, m.userText!).then(() => setAliased((a) => new Set(a).add(o.id)))}
                    >
                      {aliased.has(o.id) ? '추가됨' : `"${m.userText}" 허용 표현에 추가`}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {r.extraUserNodes.length > 0 && <p className="extra">원본에 없는 항목: {r.extraUserNodes.map((u) => u.text).join(', ')}</p>}
      {phase === 'done' ? (
        <p role="status">
          기록했습니다. <a href={href.edit(treeId)}>편집 화면에서 색 보기</a> · <a href={href.review()}>오늘의 복습</a>
        </p>
      ) : (
        <div className="actions"><button type="button" className="primary" onClick={confirm} disabled={locked}>확정</button></div>
      )}
    </section>
  )
}
