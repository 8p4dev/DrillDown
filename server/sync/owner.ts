// AA(SA) 가 탈퇴·복구·일일 작업·관리자 화면에서 호출하는 SH 함수. 시그니처 고정 (04 §3.12 D3, 03 §3.4 요청 표)
// 트랜잭션은 열지 않는다 — 호출자(SA)가 tx() 로 감쌀 수 있게(중첩 BEGIN 방지)
import type { DB } from '../db.ts'
import { GRACE_MS } from '../http.ts'
import type { TreeRow } from './map.ts'
import { bumpChildren, nextSeq } from './seq.ts'
import { SLUG_RE } from './share.ts'

/** 탈퇴: UPDATE trees SET deleted_at=now WHERE owner_id=? AND deleted_at IS NULL → 바뀐 행 수 */
export function softDeleteTreesOfUser(db: DB, ownerId: string, now: number): number {
  return Number(db.prepare('UPDATE trees SET deleted_at = ? WHERE owner_id = ? AND deleted_at IS NULL').run(now, ownerId).changes)
}
/** 탈퇴 취소: deleted_at >= since 인 트리만 복원 (since = users.deleted_at). 탈퇴 전에 직접 지운 트리는 그대로 */
export function restoreTreesOfUser(db: DB, ownerId: string, since: number): number {
  return Number(db.prepare('UPDATE trees SET deleted_at = NULL WHERE owner_id = ? AND deleted_at >= ?').run(ownerId, since).changes)
}
/** 7일 경과 purge: ratings·srs·attempts·nodes·trees·user_seq 물리 삭제 (events 는 서버 미저장). 신고 행은 남기되 신고자 id 만 지운다(F14).
 *  ratings 는 users(id) FK 라 호출자(SA)가 users 행을 지우기 전인 여기서 먼저 지운다. 이 사용자 트리에 달린 남의 별점은 trees ON DELETE CASCADE */
export function purgeUser(db: DB, ownerId: string): void {
  for (const sql of ['DELETE FROM ratings WHERE user_id = ?', 'DELETE FROM srs WHERE user_id = ?', 'DELETE FROM attempts WHERE user_id = ?', 'DELETE FROM nodes WHERE owner_id = ?', 'DELETE FROM trees WHERE owner_id = ?', 'DELETE FROM user_seq WHERE user_id = ?', 'UPDATE reports SET reporter_id = NULL WHERE reporter_id = ?'])
    db.prepare(sql).run(ownerId)
}

/** 톰스톤 정리: deleted_at 이 cutoff 보다 오래된 trees(+하위)·nodes·srs 물리 삭제 → 삭제 행 수.
 *  지운 행의 최대 seq 를 user_seq.purged_seq 에 남겨, 그보다 오래된 커서의 pull 을 410 cursor_expired 로 만든다(C18) */
export function purgeTombstones(db: DB, cutoff: number): number {
  const mark = new Map<string, number>()
  const note = (u: string, s: number | null) => { if (s != null) mark.set(u, Math.max(mark.get(u) ?? 0, s)) }
  let n = 0
  const trees = db.prepare('SELECT id, owner_id, seq FROM trees WHERE deleted_at < ?').all(cutoff) as { id: string; owner_id: string; seq: number }[]
  for (const t of trees) {
    note(t.owner_id, t.seq)
    note(t.owner_id, (db.prepare('SELECT MAX(seq) AS s FROM nodes WHERE tree_id = ?').get(t.id) as { s: number | null }).s)
    note(t.owner_id, (db.prepare('SELECT MAX(seq) AS s FROM srs WHERE tree_id = ?').get(t.id) as { s: number | null }).s)
    n += Number(db.prepare('DELETE FROM srs WHERE tree_id = ?').run(t.id).changes)
    n += Number(db.prepare('DELETE FROM attempts WHERE tree_id = ?').run(t.id).changes)
    n += Number(db.prepare('DELETE FROM nodes WHERE tree_id = ?').run(t.id).changes)
    n += Number(db.prepare('DELETE FROM trees WHERE id = ?').run(t.id).changes)
  }
  for (const r of db.prepare('SELECT owner_id AS u, MAX(seq) AS s FROM nodes WHERE deleted_at < ? GROUP BY owner_id').all(cutoff) as { u: string; s: number }[]) note(r.u, r.s)
  for (const r of db.prepare('SELECT user_id AS u, MAX(seq) AS s FROM srs WHERE deleted_at < ? GROUP BY user_id').all(cutoff) as { u: string; s: number }[]) note(r.u, r.s)
  n += Number(db.prepare('DELETE FROM srs WHERE deleted_at < ?').run(cutoff).changes)
  n += Number(db.prepare('DELETE FROM nodes WHERE deleted_at < ?').run(cutoff).changes)
  const up = db.prepare('UPDATE user_seq SET purged_seq = MAX(purged_seq, ?) WHERE user_id = ?')
  for (const [u, s] of mark) up.run(s, u)
  return n
}

/** 단일 트리 복구(소유자·관리자 공용). 삭제 아님이면 그대로, 7일 지났거나 행이 없으면 null.
 *  updated_at=now 로 올려 다른 기기에 남은 더 오래된 삭제를 LWW 로 이긴다. 하위 seq 도 올린다 */
export function restoreTree(db: DB, treeId: string): { id: string; title: string } | null {
  const t = db.prepare('SELECT * FROM trees WHERE id = ?').get(treeId) as TreeRow | undefined
  if (!t) return null
  if (t.deleted_at == null) return { id: t.id, title: t.title }
  const now = Date.now()
  if (t.deleted_at < now - GRACE_MS) return null
  db.prepare('UPDATE trees SET deleted_at = NULL, updated_at = MAX(updated_at, ?), seq = ? WHERE id = ?').run(now, nextSeq(db, t.owner_id), treeId)
  bumpChildren(db, t.owner_id, treeId)
  return { id: t.id, title: t.title }
}
/** slug → tree_id (신고 저장용). 없으면 null */
export function treeIdBySlug(db: DB, slug: string): string | null {
  if (!SLUG_RE.test(slug)) return null
  return (db.prepare('SELECT id FROM trees WHERE slug = ?').get(slug) as { id: string } | undefined)?.id ?? null
}
/** 소유자별 트리 수 (관리자 사용자 목록). 삭제 유예 중은 제외 */
export function treeCountOf(db: DB, ownerId: string): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM trees WHERE owner_id = ? AND deleted_at IS NULL').get(ownerId) as { n: number }).n
}
/** 관리자 대시보드 트리 집계 */
export function treeStats(db: DB): { total: number; public: number; hidden: number; pending_delete: number } {
  return db.prepare(`SELECT
      COALESCE(SUM(deleted_at IS NULL), 0) AS total,
      COALESCE(SUM(deleted_at IS NULL AND visibility = 'public'), 0) AS public,
      COALESCE(SUM(deleted_at IS NULL AND hidden_by_admin_at IS NOT NULL), 0) AS hidden,
      COALESCE(SUM(deleted_at IS NOT NULL), 0) AS pending_delete FROM trees`).get() as { total: number; public: number; hidden: number; pending_delete: number }
}

/** 관리자 공개 트리 목록(visibility='public' 또는 삭제 7일 이내). 소유자 닉네임은 users 조인. open_reports 는 SA 가 reports 로 채운다.
 *  커서 = "<정렬키>_<id>" (정렬키: 기본 updated_at, deleted=true 면 deleted_at, 내림차순) */
export function listTreesForAdmin(db: DB, opts: { cursor?: string; limit: number; deleted?: boolean }): { items: { id: string; title: string; slug: string | null; owner: { id: string; nickname: string }; node_count: number; updated_at: number; hidden_by_admin_at: number | null; hidden_until: number | null; deleted_at: number | null }[]; next: string | null } {
  const key = opts.deleted ? 't.deleted_at' : 't.updated_at'
  const where = opts.deleted ? 't.deleted_at IS NOT NULL AND t.deleted_at >= ?' : "t.visibility = 'public' AND t.deleted_at IS NULL AND ? IS NOT NULL"
  const args: (string | number)[] = [opts.deleted ? Date.now() - GRACE_MS : 0]
  let cur = ''
  const m = opts.cursor ? /^(\d+)_(.+)$/.exec(opts.cursor) : null
  if (m) { cur = ` AND (${key} < ? OR (${key} = ? AND t.id < ?))`; args.push(Number(m[1]), Number(m[1]), m[2]) }
  const limit = Math.max(1, Math.min(100, Math.floor(opts.limit) || 20))
  const rows = db.prepare(`SELECT t.id, t.title, t.slug, t.owner_id, u.nickname, t.node_count, t.updated_at, t.hidden_by_admin_at, t.hidden_until, t.deleted_at, ${key} AS k
    FROM trees t JOIN users u ON u.id = t.owner_id WHERE ${where}${cur} ORDER BY ${key} DESC, t.id DESC LIMIT ?`).all(...args, limit + 1) as { id: string; title: string; slug: string | null; owner_id: string; nickname: string; node_count: number; updated_at: number; hidden_by_admin_at: number | null; hidden_until: number | null; deleted_at: number | null; k: number }[]
  const page = rows.slice(0, limit)
  return {
    items: page.map((r) => ({ id: r.id, title: r.title, slug: r.slug, owner: { id: r.owner_id, nickname: r.nickname }, node_count: r.node_count, updated_at: r.updated_at, hidden_by_admin_at: r.hidden_by_admin_at, hidden_until: r.hidden_until, deleted_at: r.deleted_at })),
    next: rows.length > limit ? `${page[page.length - 1].k}_${page[page.length - 1].id}` : null,
  }
}

/** 관리자 숨김/해제 → 바뀐 트리(없으면 null). seq 를 올려 소유자 기기가 pull 로 hidden 상태를 받는다.
 *  until = 임시조치(보류 숨김) 만료 시각(망법 §44조의2 ④ 30일). 없으면 확정 숨김. 해제하면 항상 NULL */
export function setHidden(db: DB, treeId: string, hidden: boolean, now: number, until: number | null = null): { id: string; title: string; hidden_by_admin_at: number | null; hidden_until: number | null } | null {
  const t = db.prepare('SELECT owner_id FROM trees WHERE id = ?').get(treeId) as { owner_id: string } | undefined
  if (!t) return null
  return db.prepare('UPDATE trees SET hidden_by_admin_at = ?, hidden_until = ?, seq = ? WHERE id = ? RETURNING id, title, hidden_by_admin_at, hidden_until')
    .get(hidden ? now : null, hidden ? until : null, nextSeq(db, t.owner_id), treeId) as { id: string; title: string; hidden_by_admin_at: number | null; hidden_until: number | null }
}

/** 사용자 상세(관리자) 트리 목록. 삭제 유예 중은 제외 */
export function treesOfUser(db: DB, ownerId: string): { id: string; title: string; visibility: string; updated_at: number }[] {
  return db.prepare('SELECT id, title, visibility, updated_at FROM trees WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC').all(ownerId) as { id: string; title: string; visibility: string; updated_at: number }[]
}
