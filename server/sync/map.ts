// 서버 행(snake) ↔ 클라이언트 타입(camel) 변환 + 입력 검증 (04 §3.6 필드 대응표·상한, 03 §3.7 입력 검증)
import type { BlankAttempt, NodeSrs, Tree, TreeNode } from '../../src/core/types.ts'
import { CTRL, fail, UUID } from '../http.ts'
import { CAP } from '../../src/core/types.ts'

/** card = ts-fsrs Card 직렬화 상한(수백 바이트), attempts = 사용자당 행 상한(넘치면 dropped — r1 H2 디스크 DoS), autoDays = srs 행의 auto_correct_days 총량(1회 입력·병합 뒤 모두, s2-01) */
export const LIMITS = { title: CAP.title, note: CAP.note, aliases: 50, alias: 50, nodesPerTree: CAP.nodesPerTree, treesPerUser: CAP.treesPerUser, rows: 500, bytes: 2 * 1024 * 1024, card: 2048, attempts: 20_000, autoDays: 3660 }

export interface TreeRow { id: string; owner_id: string; title: string; visibility: 'private' | 'unlisted' | 'public'; slug: string | null; source_tree_id: string | null; node_count: number; copy_count: number; created_at: number; updated_at: number; deleted_at: number | null; hidden_by_admin_at: number | null; seq: number }
export interface NodeRow { id: string; tree_id: string; owner_id: string; parent_id: string | null; order: number; title: string; note: string | null; aliases: string; collapsed: number | null; offset: string | null; width: number | null; updated_at: number; deleted_at: number | null; seq: number }
export interface SrsRow { user_id: string; node_id: string; tree_id: string; card: string; due: number; last_grade_source: string | null; last_structure: string | null; auto_correct_days: string; pending_recheck: number; miss: number | null; updated_at: number; deleted_at: number | null; seq: number }

/** 동기화 응답의 트리: Tree + 서버가 진실인 공유 상태 */
export type SyncTree = Tree & { hiddenByAdmin: boolean }

export const treeOut = (r: TreeRow): SyncTree => ({
  id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at,
  visibility: r.visibility, slug: r.slug, ...(r.source_tree_id ? { sourceTreeId: r.source_tree_id } : {}),
  ...(r.deleted_at != null ? { deletedAt: r.deleted_at } : {}), hiddenByAdmin: r.hidden_by_admin_at != null,
})
export const nodeOut = (r: NodeRow): TreeNode & { deletedAt?: number } => ({
  id: r.id, treeId: r.tree_id, parentId: r.parent_id, order: r.order, title: r.title,
  ...(r.note != null ? { note: r.note } : {}), aliases: JSON.parse(r.aliases) as string[],
  ...(r.collapsed != null ? { collapsed: !!r.collapsed } : {}),
  ...(r.offset != null ? { offset: JSON.parse(r.offset) as TreeNode['offset'] } : {}),
  ...(r.width != null ? { width: r.width as 1 | 2 | 3 } : {}),
  updatedAt: r.updated_at, ...(r.deleted_at != null ? { deletedAt: r.deleted_at } : {}),
})
export const srsOut = (r: SrsRow): NodeSrs & { deletedAt?: number } => ({
  nodeId: r.node_id, treeId: r.tree_id, card: JSON.parse(r.card), due: r.due,
  lastGradeSource: r.last_grade_source as NodeSrs['lastGradeSource'], lastStructure: r.last_structure as NodeSrs['lastStructure'],
  autoCorrectDays: JSON.parse(r.auto_correct_days) as string[], pendingRecheck: !!r.pending_recheck,
  ...(r.miss != null ? { miss: r.miss } : {}), updatedAt: r.updated_at, ...(r.deleted_at != null ? { deletedAt: r.deleted_at } : {}),
})

// ---- 검증: 실패하면 400 invalid + field 위치(nodes[3].title) ----
// 제목·별칭엔 제어문자 금지(CTRL, http.ts), note 는 \t \n \r 만 허용
// eslint-disable-next-line no-control-regex -- 제어문자 거부가 목적
const CTRL_NOTE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
const GRADE = new Set(['exact', 'alias', 'fuzzy', 'self_accept', 'self_partial', 'self_reject', 'auto_reject'])

const bad = (f: string): never => fail(400, 'invalid', '입력 값이 올바르지 않습니다', f)
const obj = (v: unknown, f: string) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : bad(f))
const uuid = (v: unknown, f: string) => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : bad(f))
const time = (v: unknown, f: string) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : bad(f))
const num = (v: unknown, f: string) => (typeof v === 'number' && Number.isFinite(v) ? v : bad(f))
const text = (v: unknown, f: string, max: number, ctrl = CTRL) => (typeof v === 'string' && v.length <= max && !ctrl.test(v) ? v : bad(f))
const arr = (v: unknown, f: string) => (Array.isArray(v) ? v : bad(f))
const opt = <T>(v: unknown, f: (x: unknown) => T): T | undefined => (v === undefined || v === null ? undefined : f(v))

export function parseTree(v: unknown, f: string): Tree {
  const o = obj(v, f)
  const src = opt(o.sourceTreeId, (x) => (typeof x === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(x) ? x : bad(`${f}.sourceTreeId`)))
  // visibility·slug 는 서버가 진실 — 받아도 버린다
  return { id: uuid(o.id, `${f}.id`), title: text(o.title, `${f}.title`, LIMITS.title), createdAt: time(o.createdAt, `${f}.createdAt`), updatedAt: time(o.updatedAt, `${f}.updatedAt`), ...(src ? { sourceTreeId: src } : {}) }
}

export function parseNode(v: unknown, f: string): TreeNode {
  const o = obj(v, f)
  const aliases = arr(o.aliases ?? [], `${f}.aliases`)
  if (aliases.length > LIMITS.aliases) bad(`${f}.aliases`)
  // 계약 C1: x·y = 가로 보기, vx·vy = 세로 보기(선택)
  const offset = opt(o.offset, (x) => {
    const p = obj(x, `${f}.offset`)
    const v = p.vx !== undefined || p.vy !== undefined ? { vx: num(p.vx ?? 0, `${f}.offset.vx`), vy: num(p.vy ?? 0, `${f}.offset.vy`) } : {}
    return { x: num(p.x, `${f}.offset`), y: num(p.y, `${f}.offset`), ...v }
  })
  const width = opt(o.width, (x) => (x === 1 || x === 2 || x === 3 ? x : bad(`${f}.width`)))
  const collapsed = opt(o.collapsed, (x) => (typeof x === 'boolean' ? x : bad(`${f}.collapsed`)))
  const note = opt(o.note, (x) => text(x, `${f}.note`, LIMITS.note, CTRL_NOTE))
  return {
    id: uuid(o.id, `${f}.id`), treeId: uuid(o.treeId, `${f}.treeId`),
    parentId: o.parentId == null ? null : uuid(o.parentId, `${f}.parentId`),
    order: num(o.order, `${f}.order`), title: text(o.title, `${f}.title`, LIMITS.title),
    aliases: aliases.map((a, i) => text(a, `${f}.aliases[${i}]`, LIMITS.alias)),
    ...(note !== undefined ? { note } : {}), ...(collapsed !== undefined ? { collapsed } : {}),
    ...(offset ? { offset } : {}), ...(width ? { width } : {}), updatedAt: time(o.updatedAt, `${f}.updatedAt`),
  }
}

export function parseSrs(v: unknown, f: string): NodeSrs {
  const o = obj(v, f)
  if (o.card === undefined || o.card === null || typeof o.card !== 'object' || JSON.stringify(o.card).length > LIMITS.card) bad(`${f}.card`)
  const days = arr(o.autoCorrectDays ?? [], `${f}.autoCorrectDays`)
  if (days.length > LIMITS.autoDays) bad(`${f}.autoCorrectDays`)
  const lgs = o.lastGradeSource ?? null
  if (lgs !== null && !GRADE.has(lgs as string)) bad(`${f}.lastGradeSource`)
  const ls = o.lastStructure ?? null
  if (ls !== null && ls !== 'ok' && ls !== 'misplaced') bad(`${f}.lastStructure`)
  if (typeof (o.pendingRecheck ?? false) !== 'boolean') bad(`${f}.pendingRecheck`)
  const miss = opt(o.miss, (x) => (Number.isSafeInteger(x) && (x as number) >= 0 && (x as number) < 32768 ? (x as number) : bad(`${f}.miss`)))
  return {
    nodeId: uuid(o.nodeId, `${f}.nodeId`), treeId: uuid(o.treeId, `${f}.treeId`), card: o.card, due: time(o.due, `${f}.due`),
    lastGradeSource: lgs as NodeSrs['lastGradeSource'], lastStructure: ls as NodeSrs['lastStructure'],
    autoCorrectDays: days.map((d, i) => (typeof d === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d ? d : bad(`${f}.autoCorrectDays[${i}]`))), // 달력 검증(2월 30일 등, v1 회귀)
    pendingRecheck: !!o.pendingRecheck, ...(miss !== undefined ? { miss } : {}), updatedAt: time(o.updatedAt, `${f}.updatedAt`),
  }
}

export function parseAttempt(v: unknown, f: string): BlankAttempt {
  const o = obj(v, f)
  const int = (x: unknown, k: string) => (Number.isSafeInteger(x) && (x as number) >= 0 ? (x as number) : bad(`${f}.${k}`))
  // 비율은 0..1 — 범위 밖(1e308·음수)은 관리자 지표 AVG·median 을 오염시킨다(s2-03)
  const ratio = (x: unknown, k: string) => (typeof x === 'number' && x >= 0 && x <= 1 ? x : bad(`${f}.${k}`))
  return {
    id: uuid(o.id, `${f}.id`), treeId: uuid(o.treeId, `${f}.treeId`), rootId: uuid(o.rootId, `${f}.rootId`),
    startedAt: time(o.startedAt, `${f}.startedAt`), completedAt: time(o.completedAt, `${f}.completedAt`),
    nodeRecall: ratio(o.nodeRecall, 'nodeRecall'), edgeAccuracy: ratio(o.edgeAccuracy, 'edgeAccuracy'),
    autoGradedCount: int(o.autoGradedCount, 'autoGradedCount'), selfGradedCount: int(o.selfGradedCount, 'selfGradedCount'), overriddenCount: int(o.overriddenCount, 'overriddenCount'),
  }
}

export interface PushPayload {
  trees: Tree[]; nodes: TreeNode[]; srs: NodeSrs[]; attempts: BlankAttempt[]
  deleted: { trees: { id: string; deletedAt: number }[]; nodes: { id: string; treeId: string; deletedAt: number }[] }
}

export function parsePush(v: unknown): PushPayload {
  const o = obj(v, 'body')
  const list = (k: string, x: unknown) => arr(x ?? [], k)
  const d = obj(o.deleted ?? {}, 'deleted')
  const p: PushPayload = {
    trees: list('trees', o.trees).map((x, i) => parseTree(x, `trees[${i}]`)),
    nodes: list('nodes', o.nodes).map((x, i) => parseNode(x, `nodes[${i}]`)),
    srs: list('srs', o.srs).map((x, i) => parseSrs(x, `srs[${i}]`)),
    attempts: list('attempts', o.attempts).map((x, i) => parseAttempt(x, `attempts[${i}]`)),
    deleted: {
      trees: list('deleted.trees', d.trees).map((x, i) => { const t = obj(x, `deleted.trees[${i}]`); return { id: uuid(t.id, `deleted.trees[${i}].id`), deletedAt: time(t.deletedAt, `deleted.trees[${i}].deletedAt`) } }),
      nodes: list('deleted.nodes', d.nodes).map((x, i) => { const t = obj(x, `deleted.nodes[${i}]`); return { id: uuid(t.id, `deleted.nodes[${i}].id`), treeId: uuid(t.treeId, `deleted.nodes[${i}].treeId`), deletedAt: time(t.deletedAt, `deleted.nodes[${i}].deletedAt`) } }),
    },
  }
  const n = p.trees.length + p.nodes.length + p.srs.length + p.attempts.length + p.deleted.trees.length + p.deleted.nodes.length
  if (n > LIMITS.rows) fail(400, 'payload_too_large', `한 번에 ${LIMITS.rows}행까지 보낼 수 있습니다`)
  return p
}
