// 학습 화면 공용 판정 규칙 — 순수 함수 (드릴다운·백지 퀴즈)
import { normalize, resolveGradeSource, type GradeResult, type NodeMatch, type UserNode } from '../../core/grading'
import type { OutlineItem } from '../../core/outline'
import type { GradeSource } from '../../core/types'

const AUTO_OK = ['exact', 'alias', 'fuzzy']

/** 뒤집기 가능: 쓴 답이 있고 자동 판정된 노드 (애매는 체크박스가 자기채점, 누락은 답이 없음) */
export const canOverride = (m: NodeMatch) => m.autoClass !== 'ambiguous' && m.autoClass !== 'missing'

/** 최종 판정. 자기 판정(애매·뒤집기)은 항상 self_* → green 불가 */
export function finalSource(m: NodeMatch, checked: number, overridden: boolean): GradeSource {
  if (overridden && canOverride(m)) return AUTO_OK.includes(m.autoClass) ? 'self_reject' : 'self_accept'
  return resolveGradeSource(m, m.autoClass === 'ambiguous' ? checked : undefined)
}

export const isRecalled = (s: GradeSource) => AUTO_OK.includes(s) || s === 'self_accept'

export interface Summary { auto: number; self: number; ambiguous: number; overridden: number; recall: number; edge: number }

export function summarize(r: GradeResult, overridden: Set<string>): Summary {
  const ambiguous = r.matches.filter((m) => m.autoClass === 'ambiguous').length
  const ov = r.matches.filter((m) => canOverride(m) && overridden.has(m.origNodeId)).length
  return {
    auto: r.matches.length - ambiguous - ov,
    self: ambiguous + ov,
    ambiguous,
    overridden: ov,
    recall: r.nodeRecall,
    edge: r.edgeAccuracy,
  }
}

const SKIP = new Set(['모름', '모르겠음', '?'].map(normalize))

/** 드릴다운 입력: 줄마다 하나, 빈 줄·"모름" 제외, 모두 루트 자식 */
export function linesToUserNodes(text: string): UserNode[] {
  return text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t && !SKIP.has(normalize(t)))
    .map((text, i) => ({ tempId: `u${i}`, parentTempId: null, text }))
}

/** 백지 퀴즈 입력: 첫 줄 하나가 범위 루트 제목이면 벗겨 낸다 */
export function outlineToUserNodes(items: OutlineItem[], rootTitle: string): UserNode[] {
  if (items.length === 1 && normalize(items[0].text) === normalize(rootTitle)) items = items[0].children
  const out: UserNode[] = []
  const walk = (xs: OutlineItem[], parent: string | null) =>
    xs.forEach((x) => {
      const tempId = `u${out.length}`
      out.push({ tempId, parentTempId: parent, text: x.text })
      walk(x.children, tempId)
    })
  walk(items, null)
  return out
}

export const SOURCE_LABEL: Record<GradeSource, string> = {
  exact: '정확',
  alias: '허용 표현',
  fuzzy: '오타 허용',
  self_accept: '자기 판정: 맞음',
  self_partial: '자기 판정: 일부',
  self_reject: '자기 판정: 틀림',
  auto_reject: '틀림',
}

export const pct = (x: number) => `${Math.round(x * 100)}%`
