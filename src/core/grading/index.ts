// 백지 퀴즈 채점 엔진 — 공유 계약 §4.3 (docs/plans/orchestration_core_features.md). 순수 함수만.
import type { GradeSource, ID, Structure, TreeNode } from '../types'
import { assignMax } from './hungarian'
import { levenshtein, toJamo } from './jamo'

/** 가정 A1. 사용자 수정률 실측 후 조정 */
export const THRESHOLDS: { accept: number; reject: number } = { accept: 0.85, reject: 0.5 }

// 줄머리 글머리·번호: -, *, •, ·, 1. 1) 가. 가) (1) (가) ①
const BULLET = /^\s*(?:[-*•·]|\d+[.)]|[가-힣][.)]|\(\s*(?:\d+|[가-힣])\s*\)|[①-⑳])\s*/u
// 가정 A2. 긴 것 먼저
const PARTICLES = ['에대한', '에관한', '의', '은', '는', '이', '가', '을', '를']

function stripParticle(s: string): string {
  for (const p of PARTICLES)
    if (s.endsWith(p) && [...s].length - [...p].length >= 2) return s.slice(0, -p.length)
  return s
}

export function normalize(s: string): string {
  const t = s.normalize('NFC').toLowerCase().replace(BULLET, '').replace(/[^\p{L}\p{N}]/gu, '')
  return stripParticle(t)
}

/** 0..1, 자모 단위 편집거리 기반. 입력은 정규화하지 않는다(호출자가 normalize 한 값을 넘김) */
export function similarity(a: string, b: string): number {
  const ja = toJamo(a.normalize('NFC'))
  const jb = toJamo(b.normalize('NFC'))
  const len = Math.max(ja.length, jb.length)
  if (!len) return 1
  return 1 - levenshtein(ja, jb) / len
}

const UNIT_SPLIT = /[\s·/,()[\]]+/u
const UNIT_STOP = ['및', '와', '과', '또는', '등']

/** 2~4개 핵심어 (짧으면 [title]) */
export function splitIdeaUnits(title: string): string[] {
  const tokens = title
    .split(UNIT_SPLIT)
    .filter((t) => t && !UNIT_STOP.includes(t))
    .map((t) => stripParticle(t))
  if (tokens.length < 2) return [title]
  if (tokens.length <= 4) return tokens
  const size = Math.ceil(tokens.length / 4)
  const out: string[] = []
  for (let i = 0; i < tokens.length; i += size) out.push(tokens.slice(i, i + size).join(' '))
  return out
}

export interface UserNode { tempId: string; parentTempId: string | null; text: string }
export type AutoClass = 'exact' | 'alias' | 'fuzzy' | 'ambiguous' | 'reject' | 'missing'
export interface NodeMatch {
  origNodeId: ID
  userTempId: string | null
  userText: string | null
  similarity: number
  autoClass: AutoClass
  structure: Structure // 매칭됐고 사용자 부모가 원본 부모(또는 루트)에 매칭되면 'ok', 아니면 'misplaced'; 미매칭 null
  ideaUnits: string[] // autoClass==='ambiguous' 일 때 체크박스 항목
}
export interface GradeResult { matches: NodeMatch[]; extraUserNodes: UserNode[]; nodeRecall: number; edgeAccuracy: number }

type TextClass = Exclude<AutoClass, 'missing'>

function classify(o: TreeNode, userNorm: string): { cls: TextClass; sim: number } {
  if (userNorm) {
    if (normalize(o.title) === userNorm) return { cls: 'exact', sim: 1 }
    if (o.aliases.some((a) => normalize(a) === userNorm)) return { cls: 'alias', sim: 1 }
  }
  const sim = userNorm ? Math.max(...[o.title, ...o.aliases].map((t) => similarity(normalize(t), userNorm))) : 0
  return { cls: sim >= THRESHOLDS.accept ? 'fuzzy' : sim < THRESHOLDS.reject ? 'reject' : 'ambiguous', sim }
}

const PARENT_BONUS = 0.01
const LEFTOVER_SCALE = 1e-3

/** original = rootId 의 자손(루트 제외). user 의 parentTempId=null 은 루트의 자식을 뜻함 */
export function gradeBlank(original: TreeNode[], rootId: ID, user: UserNode[]): GradeResult {
  const userNorm = user.map((u) => normalize(u.text))
  const cells = original.map((o) => userNorm.map((n) => classify(o, n)))
  const baseW = cells.map((row) => row.map((c) => (c.cls === 'reject' ? c.sim * LEFTOVER_SCALE : c.sim)))

  const origIndex = new Map(original.map((o, i) => [o.id, i]))
  const userIndex = new Map(user.map((u, j) => [u.tempId, j]))
  // 사용자 노드 j 의 부모가 (현재 할당에서) 원본 노드 i 의 부모와 짝인가
  const parentOk = (assign: number[], i: number, j: number): boolean => {
    const op = original[i].parentId
    const up = user[j].parentTempId
    if (up === null) return op === rootId
    const pj = userIndex.get(up)
    const pi = op === null ? undefined : origIndex.get(op)
    if (pj === undefined || pi === undefined) return false
    return assign[pi] === pj && cells[pi][pj].cls !== 'reject'
  }

  // 1패스: 텍스트만. 2패스: 부모 일치 쌍에 보너스 (반복 제목 "요건/효과" 등의 위치 오판 방지)
  const first = assignMax(baseW)
  const assign = assignMax(
    baseW.map((row, i) => row.map((w, j) => (cells[i][j].cls !== 'reject' && parentOk(first, i, j) ? w + PARENT_BONUS : w))),
  )

  const assignedUsers = new Set<number>()
  const matches: NodeMatch[] = original.map((o, i) => {
    const j = assign[i]
    if (j < 0)
      return { origNodeId: o.id, userTempId: null, userText: null, similarity: 0, autoClass: 'missing', structure: null, ideaUnits: [] }
    assignedUsers.add(j)
    const { cls, sim } = cells[i][j]
    return {
      origNodeId: o.id,
      userTempId: user[j].tempId,
      userText: user[j].text,
      similarity: sim,
      autoClass: cls,
      structure: cls === 'reject' ? null : parentOk(assign, i, j) ? 'ok' : 'misplaced',
      ideaUnits: cls === 'ambiguous' ? splitIdeaUnits(o.title) : [],
    }
  })

  const matched = matches.filter((m) => m.structure !== null)
  return {
    matches,
    extraUserNodes: user.filter((_, j) => !assignedUsers.has(j)),
    nodeRecall: original.length ? matched.length / original.length : 0,
    edgeAccuracy: matched.length ? matched.filter((m) => m.structure === 'ok').length / matched.length : 0,
  }
}

/** UI 가 자기채점 결과를 최종 GradeSource 로 변환 */
export function resolveGradeSource(m: NodeMatch, checkedUnits?: number): GradeSource {
  switch (m.autoClass) {
    case 'exact':
    case 'alias':
    case 'fuzzy':
      return m.autoClass
    case 'reject':
    case 'missing':
      return 'auto_reject'
    case 'ambiguous': {
      const c = checkedUnits ?? 0
      return c >= m.ideaUnits.length ? 'self_accept' : c > 0 ? 'self_partial' : 'self_reject'
    }
  }
}
