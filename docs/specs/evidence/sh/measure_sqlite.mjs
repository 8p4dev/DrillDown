// SQLite(node:sqlite) 실측: 300노드 트리 + srs 300행의 DB 파일 크기. 실행: node docs/specs/evidence/sh/measure_sqlite.mjs
import { DatabaseSync } from 'node:sqlite'
import { statSync, rmSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const file = join(tmpdir(), `dd-measure-${process.pid}.db`)
const db = new DatabaseSync(file)
db.exec(`PRAGMA journal_mode=DELETE;
CREATE TABLE trees(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private', slug TEXT UNIQUE, source_tree_id TEXT, node_count INTEGER NOT NULL DEFAULT 0, copy_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, hidden_by_admin_at INTEGER, seq INTEGER NOT NULL);
CREATE INDEX trees_owner_seq ON trees(owner_id, seq);
CREATE TABLE nodes(id TEXT PRIMARY KEY, tree_id TEXT NOT NULL, owner_id TEXT NOT NULL, parent_id TEXT, "order" REAL NOT NULL, title TEXT NOT NULL, note TEXT, aliases TEXT NOT NULL DEFAULT '[]', collapsed INTEGER, "offset" TEXT, width INTEGER, updated_at INTEGER NOT NULL, deleted_at INTEGER, seq INTEGER NOT NULL);
CREATE INDEX nodes_tree ON nodes(tree_id) WHERE deleted_at IS NULL;
CREATE INDEX nodes_owner_seq ON nodes(owner_id, seq);
CREATE TABLE srs(user_id TEXT NOT NULL, node_id TEXT NOT NULL, tree_id TEXT NOT NULL, card TEXT NOT NULL, due INTEGER NOT NULL, last_grade_source TEXT, last_structure TEXT, auto_correct_days TEXT NOT NULL DEFAULT '[]', pending_recheck INTEGER NOT NULL DEFAULT 0, miss INTEGER, updated_at INTEGER NOT NULL, deleted_at INTEGER, seq INTEGER NOT NULL, PRIMARY KEY(user_id,node_id)) WITHOUT ROWID;
CREATE INDEX srs_owner_seq ON srs(user_id, seq);`)
const WORDS = ['근로기준법','해고','부당해고','구제절차','노동위원회','단체교섭','쟁의행위','임금','퇴직금','연차유급휴가','취업규칙','근로계약','징계','전직','휴직','산업재해','보상','사용자','근로자','노동조합']
const pick = (i) => WORDS[(i * 7 + 3) % WORDS.length]
const card = JSON.stringify({ dueAt: 1762560000000, stability: 12.3456789, difficulty: 5.1234567, elapsedDays: 3, scheduledDays: 12, learningSteps: 0, reps: 4, lapses: 1, state: 2, lastReviewAt: 1761523200000 })
const size = () => statSync(file).size
const insTree = db.prepare('INSERT INTO trees VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
const insNode = db.prepare('INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
const insSrs = db.prepare('INSERT INTO srs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
const N_TREES = 20, N = 300, owner = randomUUID(), now = Date.now()
const base = size()
db.exec('BEGIN')
const nodeIds = []
for (let t = 0; t < N_TREES; t++) {
  const treeId = randomUUID()
  insTree.run(treeId, owner, '근로기준법 해고', 'private', null, null, N, 0, now, now, null, null, t)
  let parent = null
  for (let i = 0; i < N; i++) {
    const id = randomUUID()
    const aliases = i % 10 < 3 ? JSON.stringify([pick(i + 1)]) : '[]'
    const note = i % 20 < 3 ? `- ${pick(i)}은 ${pick(i + 5)}을 전제로 한다\n- ==y:${pick(i + 9)}== 가 핵심 쟁점` : null
    const offset = i % 20 < 3 ? JSON.stringify({ x: 120, y: -40 }) : null
    insNode.run(id, treeId, owner, parent, i % 7, `${pick(i)}의 ${pick(i + 11)}`, note, aliases, i % 20 === 7 ? 1 : null, offset, i % 10 === 4 ? 2 : null, now - i * 1000, null, t * N + i)
    if (i % 3 === 0) parent = id
    nodeIds.push([id, treeId])
  }
}
db.exec('COMMIT')
db.exec('VACUUM')
const afterNodes = size()
db.exec('BEGIN')
nodeIds.forEach(([id, treeId], i) => insSrs.run(owner, id, treeId, card, now + 86400000, 'exact', 'ok', '["2026-11-01","2026-11-05"]', 0, i % 5, now, null, 100000 + i))
db.exec('COMMIT')
db.exec('VACUUM')
const afterSrs = size()
const rows = N_TREES * N
console.log(`# SQLite 실측 (트리 ${N_TREES}개 × 노드 ${N}개 = ${rows}행, VACUUM 후, 페이지 4096 B)`)
console.log(`빈 스키마: ${base} B`)
console.log(`nodes+trees+인덱스: ${afterNodes - base} B → 노드 1행당 ≈ ${((afterNodes - base) / rows).toFixed(0)} B (인덱스 2개 포함)`)
console.log(`srs+인덱스 추가분: ${afterSrs - afterNodes} B → srs 1행당 ≈ ${((afterSrs - afterNodes) / rows).toFixed(0)} B`)
console.log(`트리 1개(300노드) 점유: nodes ≈ ${(((afterNodes - base) / rows) * N / 1024).toFixed(0)} KB, srs(완전 학습) ≈ ${(((afterSrs - afterNodes) / rows) * N / 1024).toFixed(0)} KB`)
db.close()
rmSync(file)
