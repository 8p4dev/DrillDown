import { DefaultScheduler, Rating, type Grade } from 'ts-fsrs'
import { db, track } from '../db'
import { logEvent } from '../events'
import type { GradeSource, ID, NodeSrs, Structure, TreeNode } from '../types'

// FSRS-7 기본 설정 + fuzz. 계약 함수가 동기라서 모듈 로드 시 1회 생성한다.
const scheduler = await DefaultScheduler({ enableFuzz: true }) // U33: 같은 날 평가한 항목의 기한을 흩는다
type Card = ReturnType<typeof scheduler.newCard>

/** 색 바램 임계값(예상 기억률 R). lightgreen 0.8 은 가정값(FSRS-7 곡선이 완만해 0.7 이면 첫 복습 카드가 ~250일간 연두) */
export const FADE = { green: 0.9, lightgreen: 0.8 }

// ── 순수 함수 ──────────────────────────────────────────────

const TEXT_OK: GradeSource[] = ['exact', 'alias', 'fuzzy']

export function isAutoCorrect(src: GradeSource, structure: Structure): boolean {
  return TEXT_OK.includes(src) && structure !== 'misplaced'
}

export function gradeToRating(src: GradeSource, structure: Structure): Rating {
  if (TEXT_OK.includes(src)) return structure === 'misplaced' ? Rating.Hard : Rating.Good
  return src === 'self_accept' ? Rating.Hard : Rating.Again
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function applyGrade(
  prev: NodeSrs | undefined,
  nodeId: ID,
  treeId: ID,
  src: GradeSource,
  structure: Structure,
  now: Date,
): { next: NodeSrs; recheckResolved: boolean } {
  const card = (prev?.card as Card | undefined) ?? scheduler.newCard({ now })
  const { card: nextCard } = scheduler.review({ card, grade: gradeToRating(src, structure) as Grade, now })
  const auto = isAutoCorrect(src, structure)
  const days = prev?.autoCorrectDays ?? []
  const day = dayKey(now)
  const wasPending = prev?.pendingRecheck ?? false
  return {
    next: {
      nodeId,
      treeId,
      card: nextCard,
      due: +nextCard.dueAt,
      lastGradeSource: src,
      lastStructure: structure,
      autoCorrectDays: auto && !days.includes(day) ? [...days, day] : days,
      pendingRecheck: src === 'self_accept' ? true : auto ? false : wasPending,
      miss: Math.max(0, (prev?.miss ?? 0) + (gradeToRating(src, structure) === Rating.Again ? 1 : -1)),
      updatedAt: +now,
    },
    recheckResolved: wasPending && auto,
  }
}

export function retrievability(s: NodeSrs, now: Date): number {
  const card = s.card as Card
  if (!card.lastReviewAt) return 0
  return scheduler.model.forgettingCurve(card, scheduler.chrono.difference(card.lastReviewAt, now))
}

export type NodeColor = 'green' | 'lightgreen' | 'yellow' | 'red' | 'none'
export interface ColorInfo { color: NodeColor; misplaced: boolean }

export function nodeColor(s: NodeSrs | undefined, now: Date): ColorInfo {
  if (!s?.lastGradeSource) return { color: 'none', misplaced: false }
  const misplaced = s.lastStructure === 'misplaced'
  if (gradeToRating(s.lastGradeSource, s.lastStructure) === Rating.Again) return { color: 'red', misplaced }
  const r = retrievability(s, now)
  // 자기채점·재확인 대기·위치 오류는 초록 금지(03 §3.5, 11 §4.2)
  const greenOk = isAutoCorrect(s.lastGradeSource, s.lastStructure) && !s.pendingRecheck
  const color = greenOk && r >= FADE.green ? 'green' : r >= FADE.lightgreen ? 'lightgreen' : 'none'
  return { color, misplaced }
}

/** 부모 집계: 자식이 모두 green 일 때만 부모 green 유지, 아니면 lightgreen 으로 강등. 그 외엔 부모 자신 상태(A5) */
export function colorMap(nodes: TreeNode[], srs: Map<ID, NodeSrs>, now: Date): Map<ID, ColorInfo> {
  const kids = childIndex(nodes)
  const out = new Map<ID, ColorInfo>()
  const visit = (n: TreeNode): ColorInfo => {
    const own = nodeColor(srs.get(n.id), now)
    const cs = (kids.get(n.id) ?? []).map(visit)
    const info = own.color === 'green' && cs.some((c) => c.color !== 'green') ? { ...own, color: 'lightgreen' as const } : own
    out.set(n.id, info)
    return info
  }
  const ids = new Set(nodes.map((n) => n.id))
  nodes.filter((n) => n.parentId === null || !ids.has(n.parentId)).forEach(visit)
  return out
}

export function colorClass(c: ColorInfo): string {
  return `c-${c.color}${c.misplaced ? ' c-misplaced' : ''}`
}

export function isBranchComplete(nodes: TreeNode[], srs: Map<ID, NodeSrs>, rootId: ID): boolean {
  const kids = childIndex(nodes)
  const done = (id: ID): boolean =>
    (srs.get(id)?.autoCorrectDays.length ?? 0) >= 2 && (kids.get(id) ?? []).every((c) => done(c.id))
  return done(rootId)
}

function childIndex(nodes: TreeNode[]): Map<ID, TreeNode[]> {
  const m = new Map<ID, TreeNode[]>()
  for (const n of nodes) if (n.parentId !== null) m.set(n.parentId, [...(m.get(n.parentId) ?? []), n])
  return m
}

/** 오답 농도 0..1 — 에디터 붉은색. miss 4 이상이면 최대 */
export const MISS_MAX = 4
export function missHeat(s: NodeSrs | undefined): number {
  return Math.min(s?.miss ?? 0, MISS_MAX) / MISS_MAX
}

// ── DB 래퍼 ────────────────────────────────────────────────

export async function recordGrade(nodeId: ID, treeId: ID, src: GradeSource, structure: Structure, now = new Date()): Promise<NodeSrs> {
  const next0 = await db.transaction('rw', [db.srs, db.outbox, db.meta], async () => {
    const r = applyGrade(await db.srs.get(nodeId), nodeId, treeId, src, structure, now)
    await db.srs.put(r.next)
    await track([{ kind: 'srs', id: nodeId, treeId, op: 'put' }]) // 04 §3.1 쓰기 훅
    return r
  })
  const { next, recheckResolved } = next0
  if (recheckResolved) await logEvent('self_graded_node_rechecked', { origNodeId: nodeId, nextGradeSource: src }, treeId)
  return next
}

/** 학습 모드(플래시카드·D&D) 공용 기록: 맞음 = Good(자동 정답과 동일, 초록 가능), 틀림 = Again. miss 도 갱신 */
export function recordResult(nodeId: ID, treeId: ID, ok: boolean, now = new Date()): Promise<NodeSrs> {
  return recordGrade(nodeId, treeId, ok ? 'exact' : 'auto_reject', ok ? 'ok' : null, now)
}

export async function getSrsMap(treeId: ID): Promise<Map<ID, NodeSrs>> {
  const rows = await db.srs.where('treeId').equals(treeId).toArray()
  return new Map(rows.map((s) => [s.nodeId, s]))
}

export async function dueByTree(now = new Date()): Promise<Map<ID, NodeSrs[]>> {
  const out = new Map<ID, NodeSrs[]>()
  for (const s of await db.srs.where('due').belowOrEqual(+now).toArray()) out.set(s.treeId, [...(out.get(s.treeId) ?? []), s])
  return out
}
