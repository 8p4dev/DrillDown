// POST /api/sync 판정 (04 §3.1 LWW·톰스톤·시계 깎기, conflicts.md C1~C17). 라우트와 분리된 순수 함수
import type { DB } from '../db.ts'
import { tx } from '../db.ts'
import { fail } from '../http.ts'
import { LIMITS, nodeOut, srsOut, treeOut, type NodeRow, type PushPayload, type SrsRow, type TreeRow } from './map.ts'
import { bumpChildren, countLiveNodes, curSeq, nextSeq } from './seq.ts'

export const CLOCK_SKEW = 5 * 60_000

export interface PushResult {
  seq: number
  applied: string[]
  superseded: { trees: ReturnType<typeof treeOut>[]; nodes: ReturnType<typeof nodeOut>[]; srs: ReturnType<typeof srsOut>[] }
  dropped: string[]
  id_taken: string[]
  /** 이 push 로 새로 INSERT 된 트리 id. 클라이언트가 outbox 에 없는 하위 노드·srs 를 뒤따라 올린다(휴지통 복구·격리 해제, F4) */
  created: string[]
}

export function applyPush(db: DB, userId: string, p: PushPayload, now: number): PushResult {
  // 시계가 5분 넘게 앞선 기기가 영원히 이기지 않게 (C15)
  const clamp = (t: number) => (t > now + CLOCK_SKEW ? now : t)
  const r: PushResult = { seq: 0, applied: [], superseded: { trees: [], nodes: [], srs: [] }, dropped: [], id_taken: [], created: [] }
  const taken = new Set<string>()
  const touched = new Set<string>()

  const getTree = db.prepare('SELECT * FROM trees WHERE id = ?')
  const getNode = db.prepare('SELECT * FROM nodes WHERE id = ?')
  const getSrs = db.prepare('SELECT * FROM srs WHERE user_id = ? AND node_id = ?')

  /** 내 트리면 행, 남의 트리면 id_taken 표시 후 null, 없으면 undefined */
  const myTree = (id: string): TreeRow | null | undefined => {
    const t = getTree.get(id) as TreeRow | undefined
    if (t && t.owner_id !== userId) { taken.add(id); return null }
    return t
  }

  return tx(db, () => {
    // ---- trees del (톰스톤도 같은 키로 비교하는 쓰기, C11). 상한 계산보다 먼저 — 같은 배치의 삭제가 자리를 낸다 (C4) ----
    for (const d of p.deleted.trees) {
      const cur = myTree(d.id)
      if (cur === null) continue
      if (!cur) { r.dropped.push(d.id); continue }
      const at = clamp(d.deletedAt)
      if (at > cur.updated_at) {
        db.prepare('UPDATE trees SET deleted_at = ?, updated_at = ?, seq = ? WHERE id = ?').run(at, at, nextSeq(db, userId), d.id)
        r.applied.push(d.id)
      } else r.superseded.trees.push(treeOut(cur))
    }

    // 트리 상한(C: tree_limit): 새로 생기는 트리 + 살아 있는 트리 > 200
    const fresh = new Set(p.trees.map((t) => t.id).filter((id) => !getTree.get(id)))
    if (fresh.size) {
      const live = (db.prepare('SELECT COUNT(*) AS n FROM trees WHERE owner_id = ? AND deleted_at IS NULL').get(userId) as { n: number }).n
      if (live + fresh.size > LIMITS.treesPerUser) fail(403, 'tree_limit', `트리는 ${LIMITS.treesPerUser}개까지 저장할 수 있습니다`)
    }

    // ---- trees put ----
    for (const t of p.trees) {
      const cur = myTree(t.id)
      if (cur === null) continue
      const at = clamp(t.updatedAt)
      if (!cur) {
        db.prepare('INSERT INTO trees(id, owner_id, title, source_tree_id, created_at, updated_at, seq) VALUES (?,?,?,?,?,?,?)')
          .run(t.id, userId, t.title, t.sourceTreeId ?? null, t.createdAt, at, nextSeq(db, userId))
        r.created.push(t.id)
      } else if (at > cur.updated_at) {
        db.prepare('UPDATE trees SET title = ?, source_tree_id = ?, updated_at = ?, deleted_at = NULL, seq = ? WHERE id = ?')
          .run(t.title, t.sourceTreeId ?? cur.source_tree_id, at, nextSeq(db, userId), t.id)
        if (cur.deleted_at != null) bumpChildren(db, userId, t.id) // 더 새로운 put 이 톰스톤을 이김 → 부활
      } else { r.superseded.trees.push(treeOut(cur)); continue }
      touched.add(t.id) // 제목이 루트와 어긋나면 아래에서 맞춘다 (F7)
      r.applied.push(t.id)
    }
    // ---- nodes put (트리가 삭제 상태여도 저장, C11. 부모 없는 고아도 받는다 — 클라이언트가 루트로, C8) ----
    for (const n of p.nodes) {
      const cur = getNode.get(n.id) as NodeRow | undefined
      if (cur && cur.owner_id !== userId) { taken.add(n.id); continue }
      const tree = myTree(n.treeId)
      if (tree === null) { taken.add(n.id); continue }
      if (!tree) { r.dropped.push(n.id); continue }
      const at = clamp(n.updatedAt)
      const vals = [n.treeId, n.parentId, n.order, n.title, n.note ?? null, JSON.stringify(n.aliases), n.collapsed == null ? null : n.collapsed ? 1 : 0, n.offset ? JSON.stringify(n.offset) : null, n.width ?? null, at, nextSeq(db, userId)]
      if (!cur) {
        db.prepare('INSERT INTO nodes(tree_id, parent_id, "order", title, note, aliases, collapsed, "offset", width, updated_at, seq, id, owner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...vals, n.id, userId)
      } else if (at > cur.updated_at) {
        db.prepare('UPDATE nodes SET tree_id=?, parent_id=?, "order"=?, title=?, note=?, aliases=?, collapsed=?, "offset"=?, width=?, updated_at=?, seq=?, deleted_at=NULL WHERE id=?').run(...vals, n.id)
        if (cur.tree_id !== n.treeId) touched.add(cur.tree_id)
      } else { r.superseded.nodes.push(nodeOut(cur)); continue }
      touched.add(n.treeId)
      r.applied.push(n.id)
    }
    // ---- nodes del → 그 노드의 srs 도 톰스톤 (C7·C14) ----
    for (const d of p.deleted.nodes) {
      const cur = getNode.get(d.id) as NodeRow | undefined
      if (cur && cur.owner_id !== userId) { taken.add(d.id); continue }
      if (!cur) { r.dropped.push(d.id); continue }
      const at = clamp(d.deletedAt)
      if (at > cur.updated_at) {
        db.prepare('UPDATE nodes SET deleted_at = ?, updated_at = ?, seq = ? WHERE id = ?').run(at, at, nextSeq(db, userId), d.id)
        const s = getSrs.get(userId, d.id) as SrsRow | undefined
        if (s && s.deleted_at == null) db.prepare('UPDATE srs SET deleted_at = ?, seq = ? WHERE user_id = ? AND node_id = ?').run(at, nextSeq(db, userId), userId, d.id)
        touched.add(cur.tree_id)
        r.applied.push(d.id)
      } else r.superseded.nodes.push(nodeOut(cur))
    }

    // 트리당 노드 상한 + node_count 비정규화 갱신 + 트리 제목 = 살아 있는 루트 노드 제목 (F7, 계약 C7).
    // updated_at 은 그대로 두고 seq 만 올린다 — 제목은 파생값이라 LWW 에 끼어들지 않고, 다른 기기는 pull 로 받는다
    for (const id of touched) {
      const n = countLiveNodes(db, id)
      if (n > LIMITS.nodesPerTree) fail(400, 'payload_too_large', `트리가 너무 큽니다(${LIMITS.nodesPerTree.toLocaleString('en')}노드)`)
      db.prepare('UPDATE trees SET node_count = ? WHERE id = ?').run(n, id)
      const root = db.prepare('SELECT n.title AS root, t.title AS title FROM nodes n JOIN trees t ON t.id = n.tree_id WHERE n.tree_id = ? AND n.parent_id IS NULL AND n.deleted_at IS NULL ORDER BY n."order", n.id LIMIT 1').get(id) as { root: string; title: string } | undefined
      if (root && root.root !== root.title) db.prepare('UPDATE trees SET title = ?, seq = ? WHERE id = ?').run(root.root, nextSeq(db, userId), id)
    }

    // ---- srs: 행 LWW + autoCorrectDays 합집합 (C13). 노드가 없거나 삭제·남의 것이면 dropped (C14) ----
    for (const s of p.srs) {
      const node = getNode.get(s.nodeId) as NodeRow | undefined
      if (!node || node.owner_id !== userId || node.deleted_at != null) { r.dropped.push(s.nodeId); continue }
      const cur = getSrs.get(userId, s.nodeId) as SrsRow | undefined
      const at = clamp(s.updatedAt)
      const prevDays = cur ? (JSON.parse(cur.auto_correct_days) as string[]) : []
      const days = [...new Set([...prevDays, ...s.autoCorrectDays])].sort()
      if (!cur || at > cur.updated_at) {
        db.prepare(`INSERT INTO srs(user_id, node_id, tree_id, card, due, last_grade_source, last_structure, auto_correct_days, pending_recheck, miss, updated_at, deleted_at, seq)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?)
          ON CONFLICT(user_id, node_id) DO UPDATE SET tree_id=excluded.tree_id, card=excluded.card, due=excluded.due, last_grade_source=excluded.last_grade_source,
          last_structure=excluded.last_structure, auto_correct_days=excluded.auto_correct_days, pending_recheck=excluded.pending_recheck, miss=excluded.miss,
          updated_at=excluded.updated_at, deleted_at=NULL, seq=excluded.seq`)
          .run(userId, s.nodeId, node.tree_id, JSON.stringify(s.card), s.due, s.lastGradeSource, s.lastStructure, JSON.stringify(days), s.pendingRecheck ? 1 : 0, s.miss ?? null, at, nextSeq(db, userId))
        r.applied.push(s.nodeId)
      } else {
        // 서버 행이 이김. 들어온 날짜는 합쳐 둔다(사실의 집합)
        if (days.length !== prevDays.length) db.prepare('UPDATE srs SET auto_correct_days = ?, seq = ? WHERE user_id = ? AND node_id = ?').run(JSON.stringify(days), nextSeq(db, userId), userId, s.nodeId)
        r.superseded.srs.push(srsOut(getSrs.get(userId, s.nodeId) as unknown as SrsRow))
      }
    }

    // ---- attempts: append-only, PK 중복 무시. 사용자당 상한을 넘는 새 행은 dropped(클라이언트가 outbox 에서 뺀다, r1 H2) ----
    let have = p.attempts.length ? (db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE user_id = ?').get(userId) as { n: number }).n : 0
    for (const a of p.attempts) {
      const own = db.prepare('SELECT user_id FROM attempts WHERE id = ?').get(a.id) as { user_id: string } | undefined
      if (own && own.user_id !== userId) { taken.add(a.id); continue }
      if (!own && have >= LIMITS.attempts) { r.dropped.push(a.id); continue }
      if (!own) {
        db.prepare('INSERT INTO attempts(id, user_id, tree_id, root_id, started_at, completed_at, node_recall, edge_accuracy, auto_graded_count, self_graded_count, overridden_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(a.id, userId, a.treeId, a.rootId, a.startedAt, a.completedAt, a.nodeRecall, a.edgeAccuracy, a.autoGradedCount, a.selfGradedCount, a.overriddenCount)
        have++
      }
      r.applied.push(a.id)
    }

    r.id_taken = [...taken]
    r.seq = curSeq(db, userId).seq
    return r
  })
}
