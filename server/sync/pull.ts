// GET /api/sync?since= (04 §3.1 pull, sequences.md S2, conflicts.md C18)
import type { DB } from '../db.ts'
import { fail } from '../http.ts'
import { LIMITS, nodeOut, srsOut, treeOut, type NodeRow, type SrsRow, type TreeRow } from './map.ts'
import { curSeq } from './seq.ts'

export function pullSince(db: DB, userId: string, since: number) {
  const cur = curSeq(db, userId)
  // 이 기기가 아직 받지 않은 톰스톤을 purge 가 지웠으면 커서를 믿을 수 없다 → 스냅샷(since=0)부터
  if (since > 0 && since < cur.purged_seq) fail(410, 'cursor_expired', '오래된 동기화 기록입니다. 전체를 다시 받습니다')
  const max = LIMITS.rows
  // 삭제된 트리의 하위 노드·srs 는 가린다(트리 톰스톤 1행이 대표, C11). 부활 시 seq 를 새로 받는다
  const trees = db.prepare('SELECT * FROM trees WHERE owner_id = ? AND seq > ? ORDER BY seq LIMIT ?').all(userId, since, max + 1) as unknown as TreeRow[]
  const nodes = db.prepare(`SELECT n.* FROM nodes n JOIN trees t ON t.id = n.tree_id AND t.deleted_at IS NULL
    WHERE n.owner_id = ? AND n.seq > ? ORDER BY n.seq LIMIT ?`).all(userId, since, max + 1) as unknown as NodeRow[]
  const srs = db.prepare(`SELECT s.* FROM srs s LEFT JOIN trees t ON t.id = s.tree_id
    WHERE s.user_id = ? AND s.seq > ? AND (t.id IS NULL OR t.deleted_at IS NULL) ORDER BY s.seq LIMIT ?`).all(userId, since, max + 1) as unknown as SrsRow[]

  const all = [
    ...trees.map((r) => ({ seq: r.seq, k: 0 as const, r })),
    ...nodes.map((r) => ({ seq: r.seq, k: 1 as const, r })),
    ...srs.map((r) => ({ seq: r.seq, k: 2 as const, r })),
  ].sort((a, b) => a.seq - b.seq)
  const more = all.length > max
  const page = all.slice(0, max)
  const out = { seq: more ? page[page.length - 1].seq : cur.seq, more, trees: [] as ReturnType<typeof treeOut>[], nodes: [] as ReturnType<typeof nodeOut>[], srs: [] as ReturnType<typeof srsOut>[] }
  for (const x of page) {
    if (x.k === 0) out.trees.push(treeOut(x.r as TreeRow))
    else if (x.k === 1) out.nodes.push(nodeOut(x.r as NodeRow))
    else out.srs.push(srsOut(x.r as SrsRow))
  }
  return out
}
