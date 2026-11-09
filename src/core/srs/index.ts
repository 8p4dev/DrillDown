import { DefaultScheduler, Rating, type Grade } from 'ts-fsrs'
import { db, track } from '../db'
import { childIndex } from '../path'
import type { GradeSource, ID, NodeSrs, Structure, TreeNode } from '../types'

// FSRS-7 기본 설정 + fuzz. 계약 함수가 동기라서 모듈 로드 시 1회 생성한다.
const scheduler = await DefaultScheduler({ enableFuzz: true }) // U33: 같은 날 평가한 항목의 기한을 흩는다
type Card = ReturnType<typeof scheduler.newCard>

/** 서버에서 받은 행은 card 의 날짜가 JSON 문자열이다 → ts-fsrs 에 넘기기 전에 Date 로 되돌린다 */
export function asCard(c: unknown): Card {
  const o = { ...(c as Record<string, unknown>) }
  for (const k in o) if (/At$|^due$|^last_review$/.test(k) && typeof o[k] === 'string') o[k] = new Date(o[k] as string)
  return o as unknown as Card
}

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

/** prev 에 채점 1회를 적용한 다음 기록. 저장 필드(autoCorrectDays·pendingRecheck)는 타이핑 설계의 흔적이지만 서버 검증이 요구해 유지 */
export function applyGrade(prev: NodeSrs | undefined, nodeId: ID, treeId: ID, src: GradeSource, structure: Structure, now: Date): NodeSrs {
  const card = prev?.card ? asCard(prev.card) : scheduler.newCard({ now })
  const { card: nextCard } = scheduler.review({ card, grade: gradeToRating(src, structure) as Grade, now })
  const auto = isAutoCorrect(src, structure)
  const days = prev?.autoCorrectDays ?? []
  const day = dayKey(now)
  return {
    nodeId,
    treeId,
    card: nextCard,
    due: +nextCard.dueAt,
    lastGradeSource: src,
    lastStructure: structure,
    autoCorrectDays: auto && !days.includes(day) ? [...days, day] : days,
    pendingRecheck: src === 'self_accept' ? true : auto ? false : (prev?.pendingRecheck ?? false),
    miss: Math.max(0, (prev?.miss ?? 0) + (gradeToRating(src, structure) === Rating.Again ? 1 : -1)),
    updatedAt: +now,
  }
}

export function retrievability(s: NodeSrs, now: Date): number {
  const card = asCard(s.card)
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

/** 오답 농도 0..1 — 에디터 붉은색. miss 4 이상이면 최대 */
export const MISS_MAX = 4
export function missHeat(s: NodeSrs | undefined): number {
  return Math.min(s?.miss ?? 0, MISS_MAX) / MISS_MAX
}

// ── DB 래퍼 ────────────────────────────────────────────────

/** 기록을 쓴 뒤 상단 복습 배지 갱신(계약 C3) */
const notifyDue = () => dispatchEvent(new Event('dd:due'))

/**
 * 채점 1회 기록. 노드가 지워졌으면(다른 기기 삭제가 pull 된 뒤) 쓰지 않고 null.
 * base: "다시 평가" 때 첫 평가 전 기록(null = 없었음)을 넘기면 저장된 값 대신 그것을 기준으로 다시 계산해 덮어쓴다(S2)
 */
export async function recordGrade(nodeId: ID, treeId: ID, src: GradeSource, structure: Structure, now = new Date(), base?: NodeSrs | null): Promise<NodeSrs | null> {
  const next = await db.transaction('rw', [db.srs, db.nodes, db.outbox, db.meta], async () => {
    if (!(await db.nodes.get(nodeId))) return null
    const prev = base === undefined ? await db.srs.get(nodeId) : (base ?? undefined)
    const r = applyGrade(prev, nodeId, treeId, src, structure, now)
    await db.srs.put(r)
    await track([{ kind: 'srs', id: nodeId, treeId, op: 'put' }]) // 04 §3.1 쓰기 훅
    return r
  })
  if (next) notifyDue()
  return next
}

/** 학습 모드(플래시카드·D&D) 공용 기록: 맞음 = Good(자동 정답과 동일, 초록 가능), 틀림 = Again. miss 도 갱신 */
export function recordResult(nodeId: ID, treeId: ID, ok: boolean, now = new Date(), base?: NodeSrs | null): Promise<NodeSrs | null> {
  return recordGrade(nodeId, treeId, ok ? 'exact' : 'auto_reject', ok ? 'ok' : null, now, base)
}

/** 빈칸·백지 채점: 여러 노드를 한 트랜잭션으로(S18). 지워진 노드는 건너뛴다 */
export async function recordResults(treeId: ID, ids: ID[], oks: boolean[], now = new Date()): Promise<void> {
  const n = await db.transaction('rw', [db.srs, db.nodes, db.outbox, db.meta], async () => {
    const alive = new Set((await db.nodes.bulkGet(ids)).flatMap((x) => (x ? [x.id] : [])))
    const prev = new Map((await db.srs.bulkGet(ids)).flatMap((s) => (s ? [[s.nodeId, s] as const] : [])))
    const rows = ids.flatMap((id, i) => (alive.has(id) ? [applyGrade(prev.get(id), id, treeId, oks[i] ? 'exact' : 'auto_reject', oks[i] ? 'ok' : null, now)] : []))
    await db.srs.bulkPut(rows)
    await track(rows.map((r) => ({ kind: 'srs' as const, id: r.nodeId, treeId, op: 'put' as const })))
    return rows.length
  })
  if (n) notifyDue()
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
