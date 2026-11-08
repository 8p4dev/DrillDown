// 사용자별 단조 seq 발급 + 트리 부활 (04 §3.1 원칙 3, §3.6 user_seq)
import type { DB } from '../db.ts'

/** 행마다 1개. 단일 프로세스·WAL 이라 직렬화된다 */
export function nextSeq(db: DB, userId: string): number {
  db.prepare('INSERT OR IGNORE INTO user_seq(user_id, seq) VALUES (?, 0)').run(userId)
  return (db.prepare('UPDATE user_seq SET seq = seq + 1 WHERE user_id = ? RETURNING seq').get(userId) as { seq: number }).seq
}

export const curSeq = (db: DB, userId: string) =>
  (db.prepare('SELECT seq, purged_seq FROM user_seq WHERE user_id = ?').get(userId) as { seq: number; purged_seq: number } | undefined) ?? { seq: 0, purged_seq: 0 }

/** 트리 톰스톤 동안 pull 이 하위를 가리므로, 부활하면 하위 노드·srs 에 새 seq 를 줘서 다른 기기가 다시 받게 한다 */
export function bumpChildren(db: DB, ownerId: string, treeId: string) {
  const nodes = db.prepare('SELECT id FROM nodes WHERE tree_id = ?').all(treeId) as { id: string }[]
  const n = db.prepare('UPDATE nodes SET seq = ? WHERE id = ?')
  for (const r of nodes) n.run(nextSeq(db, ownerId), r.id)
  const srs = db.prepare('SELECT node_id FROM srs WHERE user_id = ? AND tree_id = ?').all(ownerId, treeId) as { node_id: string }[]
  const s = db.prepare('UPDATE srs SET seq = ? WHERE user_id = ? AND node_id = ?')
  for (const r of srs) s.run(nextSeq(db, ownerId), ownerId, r.node_id)
}

export const countLiveNodes = (db: DB, treeId: string) =>
  (db.prepare('SELECT COUNT(*) AS n FROM nodes WHERE tree_id = ? AND deleted_at IS NULL').get(treeId) as { n: number }).n
