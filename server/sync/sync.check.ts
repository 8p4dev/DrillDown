// 동기화·공유 서버 자가 검사. server/check.ts 가 import. 판정 함수를 메모리 DB 로 직접 부른다(세션은 SA 소유라 우회)
import assert from 'node:assert/strict'
import { randomUUID as id } from 'node:crypto'
import { Hono, type ErrorHandler } from 'hono'
import { openDb, type DB } from '../db.ts'
import { DAY, GRACE_MS, HttpError, type AppEnv } from '../http.ts'
import { LIMITS, parsePush } from './map.ts'
import { listTreesForAdmin, purgeTombstones, purgeUser, restoreTree, restoreTreesOfUser, setHidden, softDeleteTreesOfUser, treeCountOf, treeIdBySlug, treeStats, treesOfUser } from './owner.ts'
import { pullSince } from './pull.ts'
import { applyPush } from './push.ts'
import { clearGalleryCache, gallery, lookupShare, newSlug, rateTree, ratingOf, reissueSlug, renderShare, setVisibility, sharedTree, SLUG_RE } from './share.ts'
import { registerSharePages, registerSync } from './index.ts'

const db: DB = await openDb(':memory:')
const T0 = Date.now()
const addUser = (u: string, extra = '') => db.prepare(`INSERT INTO users(id, provider, provider_sub, nickname, created_at, last_seen_at${extra ? ', deleted_at' : ''}) VALUES (?, 'fake', ?, ?, 0, 0${extra ? ', ' + extra : ''})`).run(u, u, `nick-${u.slice(0, 4)}`)
const A = id(), B = id()
addUser(A); addUser(B)

// 입력은 parsePush 가 검증하므로 느슨하게
type In = { trees?: unknown[]; nodes?: unknown[]; srs?: unknown[]; attempts?: unknown[]; deleted?: { trees?: unknown[]; nodes?: unknown[] } }
const P = (p: In) =>
  parsePush({ trees: [], nodes: [], srs: [], attempts: [], ...p, deleted: { trees: [], nodes: [], ...p.deleted } })
const push = (u: string, p: In, now = T0) => applyPush(db, u, P(p), now)
const tree = (tid: string, at: number, title = 'T') => ({ id: tid, title, createdAt: at, updatedAt: at })
const node = (nid: string, tid: string, at: number, extra: Record<string, unknown> = {}) => ({ id: nid, treeId: tid, parentId: null, order: 0, title: 'n', aliases: [], updatedAt: at, ...extra })
const get = (sql: string, ...a: (string | number)[]) => { const x = db.prepare(sql).get(...a); return x ? { ...x } as Record<string, unknown> : undefined }
const throws = (f: () => unknown, status: number, code: string) => assert.throws(f, (e) => e instanceof HttpError && e.status === status && e.code === code, `${status} ${code}`)

// ---- 생성 · seq ----
const t1 = id(), root = id(), x = id()
let r = push(A, { trees: [tree(t1, 100)], nodes: [node(root, t1, 100, { title: 'T' }), node(x, t1, 100, { parentId: root, title: '해고', aliases: ['a'], offset: { x: 1, y: 2 }, width: 2, collapsed: true, note: '- a\n- b' })] })
assert.deepEqual(r.applied, [t1, root, x])
assert.equal(r.seq, 3)
assert.equal(get('SELECT node_count FROM trees WHERE id = ?', t1)!.node_count, 2)

// C1 LWW: 나중 쓰기 승, 이른 쓰기는 superseded
r = push(A, { nodes: [node(x, t1, 120, { parentId: root, title: '정리해고' })] })
assert.deepEqual(r.applied, [x])
r = push(A, { nodes: [node(x, t1, 110, { parentId: root, title: '부당해고' })] })
assert.equal(r.superseded.nodes[0].title, '정리해고')
// 동률 = 먼저 도착한 쪽(서버) 승
r = push(A, { nodes: [node(x, t1, 120, { parentId: root, title: '동률' })] })
assert.equal(r.superseded.nodes.length, 1)
// C2 행 단위: 나중 행 전체가 이김(제목도 나중 것)
push(A, { nodes: [node(x, t1, 130, { parentId: root, title: '정리해고', note: '메모' })] })
assert.equal(get('SELECT note FROM nodes WHERE id = ?', x)!.note, '메모')
// C3 이동
const p2 = id()
push(A, { nodes: [node(p2, t1, 131, { parentId: root }), node(x, t1, 140, { parentId: p2 })] })
assert.equal(get('SELECT parent_id FROM nodes WHERE id = ?', x)!.parent_id, p2)

// C7 수정 뒤 삭제(나중) 승 / C6 삭제 뒤 수정(나중) 승 → 되살아남
r = push(A, { deleted: { nodes: [{ id: x, treeId: t1, deletedAt: 150 }] } })
assert.deepEqual(r.applied, [x])
assert.equal(get('SELECT deleted_at FROM nodes WHERE id = ?', x)!.deleted_at, 150)
r = push(A, { nodes: [node(x, t1, 145, { parentId: p2 })] })
assert.equal(r.superseded.nodes[0].deletedAt, 150)
push(A, { nodes: [node(x, t1, 160, { parentId: p2 })] })
assert.equal(get('SELECT deleted_at FROM nodes WHERE id = ?', x)!.deleted_at, null)

// C8/C9 고아(부모 삭제 뒤 그 아래 새 노드)는 그대로 받는다 — 루트 복구는 클라이언트
const orphan = id()
push(A, { deleted: { nodes: [{ id: p2, treeId: t1, deletedAt: 170 }] } })
r = push(A, { nodes: [node(orphan, t1, 180, { parentId: p2 })] })
assert.deepEqual(r.applied, [orphan])

// C10 트리 이름 변경 LWW (trees 행 + 루트 노드 같은 updatedAt)
push(A, { trees: [tree(t1, 200, 'B승')], nodes: [node(root, t1, 200, { title: 'B승' })] })
r = push(A, { trees: [tree(t1, 190, 'A')], nodes: [node(root, t1, 190, { title: 'A' })] })
assert.equal(r.superseded.trees[0].title, 'B승')
assert.equal(r.superseded.nodes[0].title, 'B승')

// C13 srs LWW + autoCorrectDays 합집합 (서버가 이겨도 날짜는 합친다)
const srs = (at: number, days: string[], miss = 0) => ({ nodeId: x, treeId: t1, card: { due: 1 }, due: 1, lastGradeSource: 'exact', lastStructure: 'ok', autoCorrectDays: days, pendingRecheck: false, miss, updatedAt: at })
push(A, { srs: [srs(300, ['2026-11-01'], 1)] })
r = push(A, { srs: [srs(290, ['2026-11-02'], 5)] })
assert.equal(r.superseded.srs[0].miss, 1)
assert.deepEqual(r.superseded.srs[0].autoCorrectDays, ['2026-11-01', '2026-11-02'])
push(A, { srs: [srs(310, ['2026-11-03'], 0)] })
assert.equal(get('SELECT auto_correct_days FROM srs WHERE node_id = ?', x)!.auto_correct_days, '["2026-11-01","2026-11-02","2026-11-03"]')
// C14 노드 삭제 → srs 톰스톤, 이후 srs put 은 dropped
push(A, { deleted: { nodes: [{ id: x, treeId: t1, deletedAt: 400 }] } })
assert.equal(get('SELECT deleted_at FROM srs WHERE node_id = ?', x)!.deleted_at, 400)
r = push(A, { srs: [srs(500, [])] })
assert.deepEqual(r.dropped, [x])

// C15 시계 5분 넘게 앞선 쓰기는 now 로 깎임 → 뒤에 온 정상 쓰기가 이김
const y = id()
const NOW = 1_000_000
push(A, { nodes: [node(y, t1, NOW + 10 * 60_000, { title: '빠른시계' })] }, NOW)
assert.equal(get('SELECT updated_at FROM nodes WHERE id = ?', y)!.updated_at, NOW)
push(A, { nodes: [node(y, t1, NOW + 1, { title: '정상' })] }, NOW + 1)
assert.equal(get('SELECT title FROM nodes WHERE id = ?', y)!.title, '정상')
// 5분 이내 앞선 값은 그대로
push(A, { nodes: [node(y, t1, NOW + 4 * 60_000)] }, NOW + 2)
assert.equal(get('SELECT updated_at FROM nodes WHERE id = ?', y)!.updated_at, NOW + 4 * 60_000)

// C17 id_taken: 남의 트리·노드 id, 남의 트리에 넣는 노드 — 에러 아님
r = push(B, { trees: [tree(t1, 999)], nodes: [node(id(), t1, 999), node(root, id(), 999)], deleted: { trees: [{ id: t1, deletedAt: 999 }] } })
assert.ok(r.id_taken.includes(t1) && r.id_taken.includes(root) && r.id_taken.length === 3)
assert.equal(get('SELECT owner_id FROM trees WHERE id = ?', t1)!.owner_id, A)
// 없는 트리의 노드는 dropped
r = push(B, { nodes: [node(id(), id(), 1)] })
assert.equal(r.dropped.length, 1)

// visibility·slug 는 클라이언트 값 무시
push(A, { trees: [{ ...tree(t1, 600, 'B승'), visibility: 'public', slug: 'AAAAAAAAAAA' } as never] })
assert.deepEqual(get('SELECT visibility, slug FROM trees WHERE id = ?', t1), { visibility: 'private', slug: null })

// ---- 검증 400 invalid + field ----
throws(() => P({ nodes: [node(id(), t1, 1, { title: 'x'.repeat(201) })] }), 400, 'invalid')
assert.throws(() => P({ nodes: [{}, node(id(), t1, 1, { title: 'a\u0007' })] as never }), (e: HttpError) => e.field === 'nodes[0].id')
assert.throws(() => P({ nodes: [node(id(), t1, 1, { title: 'a\u0007' })] }), (e: HttpError) => e.field === 'nodes[0].title')
assert.throws(() => P({ nodes: [node(id(), t1, 1, { note: 'x'.repeat(5001) })] }), (e: HttpError) => e.field === 'nodes[0].note')
assert.throws(() => P({ nodes: [node(id(), t1, 1, { aliases: Array(51).fill('a') })] }), (e: HttpError) => e.field === 'nodes[0].aliases')
assert.throws(() => P({ nodes: [node(id(), t1, 1, { aliases: ['x'.repeat(51)] })] }), (e: HttpError) => e.field === 'nodes[0].aliases[0]')
assert.throws(() => P({ nodes: [node('not-a-uuid', t1, 1)] }), (e: HttpError) => e.field === 'nodes[0].id')
assert.throws(() => P({ nodes: [node(id(), t1, 1, { width: 4 })] }), (e: HttpError) => e.field === 'nodes[0].width')
assert.throws(() => P({ srs: [{ ...srs(1, []), lastGradeSource: 'bogus' }] }), (e: HttpError) => e.field === 'srs[0].lastGradeSource')
assert.throws(() => P({ srs: [{ ...srs(1, []), card: { junk: 'x'.repeat(LIMITS.card) } }] }), (e: HttpError) => e.field === 'srs[0].card') // r1 H2: 카드 직렬화 상한(디스크 DoS)
P({ srs: [{ ...srs(1, []), card: { stability: 1.5, stabilityFast: 1.2, difficulty: 5, lastReviewAt: '2026-11-14T00:00:00.000Z', state: 2, reps: 3, lapses: 0, elapsedDays: 1, scheduledDays: 2 } }] }) // ts-fsrs Card 크기는 통과
throws(() => P({ nodes: Array.from({ length: 501 }, () => node(id(), t1, 1)) }), 400, 'payload_too_large')
P({ nodes: [node(id(), t1, 1, { note: '줄1\n\t줄2' })] }) // note 의 줄바꿈·탭은 허용

// ---- tree_limit: 사용자당 200 ----
const C = id(); addUser(C)
const many = Array.from({ length: 200 }, () => tree(id(), 1))
push(C, { trees: many.slice(0, 199) })
push(C, { trees: [many[199]] })
throws(() => push(C, { trees: [tree(id(), 1)] }), 403, 'tree_limit')
push(C, { trees: [many[0]] }) // 기존 트리 갱신은 상한과 무관
assert.equal(treeCountOf(db, C), 200)
// 200개 상태에서 1개 삭제 + 1개 생성을 한 배치로 → 삭제가 먼저 반영돼 성공 (C4)
push(C, { trees: [tree(id(), 1)], deleted: { trees: [{ id: many[1].id, deletedAt: 2 }] } })
assert.equal(treeCountOf(db, C), 200)

// ---- pull ----
let pl = pullSince(db, A, 0)
assert.equal(pl.more, false)
assert.equal(pl.seq, (get('SELECT seq FROM user_seq WHERE user_id = ?', A)!.seq))
assert.ok(pl.trees.some((t) => t.id === t1 && t.visibility === 'private' && t.hiddenByAdmin === false))
assert.ok(pl.nodes.some((n) => n.id === x && n.deletedAt === 400)) // 노드 톰스톤 포함
assert.deepEqual(pullSince(db, A, pl.seq).trees, [])
// 페이지: C 의 트리 200개 → 한 페이지 200, 500 넘는 경우 more
const D = id(); addUser(D)
const td = id()
push(D, { trees: [tree(td, 1)] })
for (let i = 0; i < 2; i++) push(D, { nodes: Array.from({ length: 300 }, () => node(id(), td, 1)) })
pl = pullSince(db, D, 0)
assert.equal(pl.more, true)
assert.equal(pl.trees.length + pl.nodes.length, 500)
const pl2 = pullSince(db, D, pl.seq)
assert.equal(pl2.more, false)
assert.equal(pl.nodes.length + pl2.nodes.length, 600)

// C11 트리 톰스톤이 노드 수정보다 나중 → 트리 삭제, 노드 수정은 저장되나 pull 에서 가려짐
const t2 = id(), n2 = id()
push(A, { trees: [tree(t2, 1000)], nodes: [node(n2, t2, 1000)] })
const before = pullSince(db, A, 0).seq
push(A, { deleted: { trees: [{ id: t2, deletedAt: 1010 }] } })
r = push(A, { nodes: [node(n2, t2, 1005, { title: 'B수정' })] })
assert.deepEqual(r.applied, [n2])
pl = pullSince(db, A, before)
assert.deepEqual(pl.trees.map((t) => [t.id, t.deletedAt]), [[t2, 1010]])
assert.equal(pl.nodes.length, 0)
// 트리 put 이 톰스톤보다 나중이면 부활 → 하위 노드가 새 seq 로 다시 내려감
const mid = pullSince(db, A, 0).seq
push(A, { trees: [tree(t2, 1020)] })
pl = pullSince(db, A, mid)
assert.ok(pl.nodes.some((n) => n.id === n2 && n.title === 'B수정'))

// C18 커서 만료: purge 가 기기가 받지 않은 톰스톤을 지우면 410, 받았으면 그대로
const E = id(); addUser(E)
const te = id(), ne = id(), ne2 = id()
push(E, { trees: [tree(te, 1)], nodes: [node(ne, te, 1), node(ne2, te, 1)] })
const oldCursor = pullSince(db, E, 0).seq
push(E, { deleted: { nodes: [{ id: ne, treeId: te, deletedAt: 5 }] } })
const fresh = pullSince(db, E, oldCursor).seq
assert.ok(purgeTombstones(db, 100) >= 1)
assert.equal(get('SELECT id FROM nodes WHERE id = ?', ne), undefined) // purge 후 행 없음
throws(() => pullSince(db, E, oldCursor), 410, 'cursor_expired')
assert.equal(pullSince(db, E, fresh).more, false) // 톰스톤을 받은 기기는 그대로
assert.equal(pullSince(db, E, 0).nodes.length, 1) // 스냅샷은 항상 가능
// 트리 톰스톤 purge: 트리·하위 노드·srs 물리 삭제
push(E, { srs: [{ ...srs(1, []), nodeId: ne2, treeId: te }] })
push(E, { deleted: { trees: [{ id: te, deletedAt: 50 }] } })
purgeTombstones(db, 100)
assert.equal(get('SELECT COUNT(*) AS n FROM nodes WHERE tree_id = ?', te)!.n, 0)
assert.equal(get('SELECT COUNT(*) AS n FROM srs WHERE tree_id = ?', te)!.n, 0)
assert.equal(get('SELECT id FROM trees WHERE id = ?', te), undefined)
// F3 커서가 서버 seq 보다 앞서면(백업 복원으로 되감김) 410 — 같은 전체 재동기화 경로. 정확히 seq 와 같으면 빈 응답
const eSeq = pullSince(db, E, 0).seq
throws(() => pullSince(db, E, eSeq + 1), 410, 'cursor_expired')
assert.equal(pullSince(db, E, eSeq).more, false)

// F7 트리 제목 = 살아 있는 루트 노드 제목(계약 C7). 어긋난 tree put 은 루트 제목으로 고쳐지고 seq 만 오른다(updated_at 그대로)
const F = id(); addUser(F)
const tf = id(), rf = id(), cf = id()
r = push(F, { trees: [tree(tf, 100, '트리제목')], nodes: [node(rf, tf, 100, { title: '루트' }), node(cf, tf, 100, { parentId: rf, title: '자식' })] })
assert.deepEqual(r.created, [tf]) // 새 트리 → created (휴지통 복구 뒤 노드 재업로드 신호)
assert.deepEqual(get('SELECT title, updated_at FROM trees WHERE id = ?', tf), { title: '루트', updated_at: 100 })
const fSeq = pullSince(db, F, 0).seq
r = push(F, { nodes: [node(rf, tf, 110, { title: '새루트' })] }) // 루트만 바뀌어도 트리 제목이 따라간다
assert.deepEqual(r.created, [])
assert.deepEqual(get('SELECT title, updated_at FROM trees WHERE id = ?', tf), { title: '새루트', updated_at: 100 })
assert.deepEqual(pullSince(db, F, fSeq).trees.map((t) => t.title), ['새루트']) // seq 가 올라 다른 기기가 받는다
r = push(F, { trees: [tree(tf, 120, '엉뚱한제목')] }) // 루트 없이 트리 제목만 오면 루트가 이긴다
assert.deepEqual(r.applied, [tf])
assert.equal(get('SELECT title FROM trees WHERE id = ?', tf)!.title, '새루트')
push(F, { nodes: [node(cf, tf, 130, { parentId: rf })] }) // 자식 변경은 제목과 무관, 제목 같으면 seq 도 그대로
const sameSeq = Number(get('SELECT seq FROM trees WHERE id = ?', tf)!.seq)
push(F, { nodes: [node(cf, tf, 140, { parentId: rf })] })
assert.equal(Number(get('SELECT seq FROM trees WHERE id = ?', tf)!.seq), sameSeq)
push(F, { deleted: { nodes: [{ id: rf, treeId: tf, deletedAt: 150 }] } }) // 살아 있는 루트가 없으면 제목 유지
assert.equal(get('SELECT title FROM trees WHERE id = ?', tf)!.title, '새루트')
// r1 H2 attempts 사용자당 상한: 넘치는 새 행은 dropped(클라이언트가 outbox 에서 뺀다), 이미 있는 행은 applied
const att = (at: number) => ({ id: id(), treeId: tf, rootId: rf, startedAt: at, completedAt: at, nodeRecall: 1, edgeAccuracy: 1, autoGradedCount: 1, selfGradedCount: 0, overriddenCount: 0 })
const [a1, a2, a3] = [att(1), att(2), att(3)]
LIMITS.attempts = 2
r = push(F, { attempts: [a1, a2, a3] })
assert.deepEqual([r.applied, r.dropped], [[a1.id, a2.id], [a3.id]])
r = push(F, { attempts: [a1, att(4)] })
assert.deepEqual([r.applied, r.dropped.length], [[a1.id], 1])
LIMITS.attempts = 20_000
assert.equal(get('SELECT COUNT(*) AS n FROM attempts WHERE user_id = ?', F)!.n, 2)

// ---- 공개 범위 전이표 (04 §3.3, 11행) ----
const S = id(); addUser(S)
const ts = id()
push(S, { trees: [tree(ts, 1, '공유')], nodes: [node(id(), ts, 1, { title: '공유' }), node(id(), ts, 1, { title: '공유' })] })
// 1 private → unlisted: slug 발급, seq++
let seqBefore = Number(get('SELECT seq FROM trees WHERE id = ?', ts)!.seq)
let v = setVisibility(db, S, ts, 'unlisted')
assert.ok(SLUG_RE.test(v.slug!) && v.url!.endsWith(`/t/${v.slug}`))
assert.ok(Number(get('SELECT seq FROM trees WHERE id = ?', ts)!.seq) > seqBefore)
const slug1 = v.slug!
// 2·3 → public 조건: 노드 ≥ 3
throws(() => setVisibility(db, S, ts, 'public'), 400, 'not_publishable')
push(S, { nodes: [node(id(), ts, 1, { title: '공유' })] })
// 3 unlisted → public: slug 유지
v = setVisibility(db, S, ts, 'public')
assert.equal(v.slug, slug1)
// 5 public → unlisted: slug 유지
assert.equal(setVisibility(db, S, ts, 'unlisted').slug, slug1)
// 4 unlisted → private: slug 회수
assert.deepEqual(setVisibility(db, S, ts, 'private'), { visibility: 'private', slug: null, url: null })
assert.equal(lookupShare(db, slug1).ok, false)
// 2 private → public: 새 slug 발급
v = setVisibility(db, S, ts, 'public')
assert.ok(v.slug && v.slug !== slug1)
// 6 public → private: 회수
assert.equal(setVisibility(db, S, ts, 'private').slug, null)
// 7 링크 재발급: private 이면 400, 공유 중이면 새 slug·옛 slug 404
throws(() => reissueSlug(db, S, ts), 400, 'not_shared')
const s2 = setVisibility(db, S, ts, 'unlisted').slug!
const s3 = reissueSlug(db, S, ts).slug
assert.ok(s3 !== s2 && SLUG_RE.test(s3))
assert.deepEqual(lookupShare(db, s2), { ok: false, status: 404, code: 'not_found' })
assert.equal(lookupShare(db, s3).ok, true)
// 10 hidden: public 전환 거부, 링크 403(소유자·관리자는 통과)
setHidden(db, ts, true, 5)
throws(() => setVisibility(db, S, ts, 'public'), 403, 'hidden_by_admin')
assert.deepEqual(lookupShare(db, s3), { ok: false, status: 403, code: 'hidden' })
assert.equal(lookupShare(db, s3, { id: S, role: 'user' }).ok, true)
assert.equal(lookupShare(db, s3, { id: B, role: 'admin' }).ok, true)
// 12 hidden 상태에서 private 로 돌리기는 허용, hidden 유지
assert.equal(setVisibility(db, S, ts, 'private').visibility, 'private')
assert.notEqual(get('SELECT hidden_by_admin_at FROM trees WHERE id = ?', ts)!.hidden_by_admin_at, null)
// 11 hidden → 해제(관리자): 다시 공개 가능
assert.equal(setHidden(db, ts, false, 6)!.hidden_by_admin_at, null)
const s4 = setVisibility(db, S, ts, 'public').slug!
// 8 deleted: slug 유지, 410
push(S, { deleted: { trees: [{ id: ts, deletedAt: T0 }] } })
assert.equal(get('SELECT slug FROM trees WHERE id = ?', ts)!.slug, s4)
assert.deepEqual(lookupShare(db, s4), { ok: false, status: 410, code: 'deleted' })
throws(() => setVisibility(db, S, ts, 'private'), 404, 'not_found')
// 9 deleted → restore(7일 이내): 이전 visibility 로 복원
assert.deepEqual(restoreTree(db, ts), { id: ts, title: '공유' })
assert.equal(lookupShare(db, s4).ok, true)
// F13 소유자 정지 → 숨김과 같은 효과(403 hidden, 소유자·관리자 통과), 해제하면 복귀
db.prepare('UPDATE users SET suspended_at = 1 WHERE id = ?').run(S)
assert.deepEqual(lookupShare(db, s4), { ok: false, status: 403, code: 'hidden' })
assert.equal(lookupShare(db, s4, { id: S, role: 'user' }).ok, true)
assert.equal(lookupShare(db, s4, { id: B, role: 'admin' }).ok, true)
clearGalleryCache()
assert.equal(gallery(db, 'recent', 1, T0).items.length, 0)
db.prepare('UPDATE users SET suspended_at = NULL WHERE id = ?').run(S)
assert.equal(lookupShare(db, s4).ok, true)
// 남의 트리 공개 범위 변경 404
throws(() => setVisibility(db, A, ts, 'private'), 404, 'not_found')
// slug 형식
for (let i = 0; i < 200; i++) assert.ok(SLUG_RE.test(newSlug()))
assert.equal(treeIdBySlug(db, s4), ts)
assert.equal(treeIdBySlug(db, '0OIl0OIl0OI'), null)
// 없는 slug / 형식 틀린 slug 는 404
assert.equal(lookupShare(db, newSlug()).ok, false)
assert.equal(lookupShare(db, '<script>').ok, false)

// ---- 갤러리 필터 ----
clearGalleryCache()
let g = gallery(db, 'recent', 1, T0)
assert.deepEqual(g.items.map((i) => i.slug), [s4])
assert.equal(g.items[0].nodeCount, 3)
setHidden(db, ts, true, 7); clearGalleryCache()
assert.equal(gallery(db, 'recent', 1, T0).items.length, 0)
setHidden(db, ts, false, 8)
// 캐시 60초: 숨김 해제 직후에도 캐시된 빈 목록
assert.equal(gallery(db, 'recent', 1, T0 + 1000).items.length, 0)
assert.equal(gallery(db, 'recent', 1, T0 + 61_000).items.length, 1)
setVisibility(db, S, ts, 'unlisted'); clearGalleryCache()
assert.equal(gallery(db, 'copies', 1, T0).items.length, 0) // unlisted 제외
setVisibility(db, S, ts, 'public')
// U58 제목 검색: 부분 일치, %·_ 는 글자 그대로(이스케이프), 공백 q 무시, 긴 q 는 잘림
db.prepare('UPDATE trees SET title = ? WHERE id = ?').run('공유 100%', ts); clearGalleryCache()
const gq = (q: string) => gallery(db, 'recent', 1, T0, q).items.length
assert.deepEqual([gq('유 1'), gq('0%'), gq('  '), gq('없음'), gq('%%'), gq('1_0'), gq('!'), gq('x'.repeat(500))], [1, 1, 1, 0, 0, 0, 0, 0])
db.prepare('UPDATE trees SET title = ? WHERE id = ?').run('공유', ts); clearGalleryCache()

// ---- 별점 (계약 C3): 1인 1표·수정 가능·본인 불가, 평균 소수 1자리, 갤러리 반영(캐시 비움) ----
const shareRow = (slug: string) => { const s = lookupShare(db, slug); assert.ok(s.ok); return s.t }
const tsRow = shareRow(s4)
assert.deepEqual(ratingOf(db, tsRow), { avg: null, count: 0, mine: null, canRate: false }) // 비로그인
assert.deepEqual(ratingOf(db, tsRow, { id: A, role: 'user' }), { avg: null, count: 0, mine: null, canRate: true })
assert.equal(ratingOf(db, tsRow, { id: S, role: 'user' }).canRate, false) // 본인
throws(() => rateTree(db, S, tsRow, 5), 403, 'own_tree')
assert.deepEqual(rateTree(db, A, tsRow, 4), { avg: 4, count: 1, mine: 4, canRate: true })
assert.deepEqual(rateTree(db, A, tsRow, 5), { avg: 5, count: 1, mine: 5, canRate: true }) // 재평가: count 유지, avg 갱신
assert.deepEqual(rateTree(db, B, tsRow, 2), { avg: 3.5, count: 2, mine: 2, canRate: true }) // 다른 사용자: count 2
assert.deepEqual(ratingOf(db, tsRow, { id: A, role: 'user' }), { avg: 3.5, count: 2, mine: 5, canRate: true })
assert.equal(ratingOf(db, tsRow, { id: S, role: 'user' }).mine, null)
assert.equal(rateTree(db, C, tsRow, 1).avg, 2.7) // (5+2+1)/3 = 2.666… → 소수 1자리
assert.throws(() => rateTree(db, A, tsRow, 6)) // DB CHECK 안전망(라우트가 먼저 400)
assert.equal(ratingOf(db, tsRow).count, 3)
// sharedTree 가 viewer 기준 rating 을 채운다
assert.deepEqual(sharedTree(db, tsRow).rating, { avg: 2.7, count: 3, mine: null, canRate: false })
assert.equal(sharedTree(db, tsRow, { id: B, role: 'user' }).rating.mine, 2)
// 갤러리 항목: rateTree 가 캐시를 비워 같은 now 로 다시 불러도 새 값
let gi = gallery(db, 'recent', 1, T0).items[0]
assert.deepEqual([gi.ratingAvg, gi.ratingCount], [2.7, 3])
assert.equal(gallery(db, 'recent', 1, T0).items[0].ratingAvg, 2.7) // 캐시 적중
rateTree(db, C, tsRow, 5) // (5+2+5)/3 = 4
gi = gallery(db, 'recent', 1, T0).items[0]
assert.deepEqual([gi.ratingAvg, gi.ratingCount], [4, 3])
// F4: unlisted 트리 평가는 목록에 없으므로 캐시를 비우지 않는다(같은 now 재조회 → 같은 객체). public 으로 돌아오면 비운다
setVisibility(db, S, ts, 'unlisted'); clearGalleryCache()
const gUnl = gallery(db, 'recent', 1, T0)
rateTree(db, A, shareRow(s4), 1) // (1+2+5)/3 = 2.7, 캐시 유지
assert.equal(gallery(db, 'recent', 1, T0), gUnl)
setVisibility(db, S, ts, 'public'); clearGalleryCache()
const gPub = gallery(db, 'recent', 1, T0)
assert.equal(gPub.items[0].ratingAvg, 2.7)
rateTree(db, A, shareRow(s4), 5) // (5+2+5)/3 = 4, 캐시 비움
const gPub2 = gallery(db, 'recent', 1, T0)
assert.notEqual(gPub2, gPub)
assert.equal(gPub2.items[0].ratingAvg, 4)

// ---- 탈퇴 유예: softDelete → 410, restoreTreesOfUser 는 탈퇴 전 삭제 트리를 되살리지 않음 ----
const W = id(); addUser(W)
const wKeep = id(), wGone = id()
push(W, { trees: [tree(wKeep, 1, '살릴것'), tree(wGone, 1)], nodes: [node(id(), wKeep, 1), node(id(), wKeep, 1), node(id(), wKeep, 1)] })
push(W, { deleted: { trees: [{ id: wGone, deletedAt: 2 }] } }, 3)
const wSlug = setVisibility(db, W, wKeep, 'public').slug!
const quitAt = 50_000
assert.equal(softDeleteTreesOfUser(db, W, quitAt), 1)
db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(quitAt, W)
assert.deepEqual(lookupShare(db, wSlug), { ok: false, status: 410, code: 'deleted' })
clearGalleryCache()
assert.ok(!gallery(db, 'recent', 1, T0).items.some((i) => i.slug === wSlug))
assert.equal(restoreTreesOfUser(db, W, quitAt), 1)
db.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').run(W)
assert.equal(get('SELECT deleted_at FROM trees WHERE id = ?', wGone)!.deleted_at, 2)
assert.equal(get('SELECT deleted_at FROM trees WHERE id = ?', wKeep)!.deleted_at, null)
assert.equal(lookupShare(db, wSlug).ok, true)
// 소유자 탈퇴 유예 중(users.deleted_at)만으로도 410
db.prepare('UPDATE users SET deleted_at = 1 WHERE id = ?').run(W)
assert.equal(lookupShare(db, wSlug).ok, false)
db.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').run(W)
// restoreTree: 7일 지난 삭제는 null
db.prepare('UPDATE trees SET deleted_at = ? WHERE id = ?').run(Date.now() - GRACE_MS - DAY, wGone)
assert.equal(restoreTree(db, wGone), null)
// purgeUser: 전부 물리 삭제. 신고 행은 남고 신고자 id 만 비운다(F14). 별점은 준 것(user_id)·받은 것(trees CASCADE) 모두 사라진다
db.prepare("INSERT INTO reports(id, tree_id, reporter_id, reason, created_at) VALUES ('rep-w', ?, ?, 'spam', 1)").run(ts, W)
rateTree(db, W, tsRow, 3)
rateTree(db, A, shareRow(wSlug), 5)
assert.equal(ratingOf(db, tsRow).count, 4)
purgeUser(db, W)
for (const t of ['trees WHERE owner_id', 'nodes WHERE owner_id', 'srs WHERE user_id', 'user_seq WHERE user_id', 'ratings WHERE user_id']) assert.equal(get(`SELECT COUNT(*) AS n FROM ${t} = ?`, W)!.n, 0)
assert.equal(get('SELECT COUNT(*) AS n FROM ratings WHERE tree_id = ?', wKeep)!.n, 0)
assert.equal(ratingOf(db, tsRow).count, 3)
db.prepare('DELETE FROM users WHERE id = ?').run(W) // SA 가 purgeUser 뒤에 하는 일 — FK 위반 없이 지워진다
assert.deepEqual(get("SELECT reporter_id FROM reports WHERE id = 'rep-w'"), { reporter_id: null })
db.prepare("DELETE FROM reports WHERE id = 'rep-w'").run()

// ---- 관리자 조회 ----
const st = treeStats(db)
assert.ok(st.total > 0 && st.public === 1 && st.hidden === 0)
assert.deepEqual(listTreesForAdmin(db, { limit: 10 }).items.map((i) => i.id), [ts])
assert.equal(listTreesForAdmin(db, { limit: 10 }).items[0].owner.id, S)
const lp = listTreesForAdmin(db, { limit: 1, deleted: false })
assert.equal(lp.next, null)
assert.ok(treesOfUser(db, S).some((t) => t.id === ts))
// 삭제 목록 커서 페이지
const Z = id(); addUser(Z)
const zt: string[] = [id(), id(), id()]
push(Z, { trees: zt.map((t) => tree(t, 1)) })
const recent = Date.now()
zt.forEach((t, i) => db.prepare('UPDATE trees SET deleted_at = ? WHERE id = ?').run(recent - i, t))
const d1 = listTreesForAdmin(db, { limit: 2, deleted: true })
assert.equal(d1.items.length, 2)
const d2 = listTreesForAdmin(db, { limit: 2, deleted: true, cursor: d1.next! })
assert.deepEqual([...d1.items, ...d2.items].map((i) => i.id).filter((i) => zt.includes(i)), zt)

// ---- OG: HTML 이스케이프 ----
const shell = '<!doctype html><html><head><meta charset="utf-8"><title>Drill Down</title></head><body></body></html>'
const html = renderShare(shell, { slug: 'abcdefghijk', title: '</title><script>alert(1)</script> $& "q"', node_count: 7, visibility: 'unlisted' })
assert.ok(!html.includes('<script>'))
assert.ok(html.includes('<title>&#60;/title&#62;&#60;script&#62;alert(1)&#60;/script&#62; $&#38; &#34;q&#34;</title>'))
assert.ok(html.includes('content="노드 7개 · 플래시카드·빈칸·백지 퀴즈 — Drill Down"'))
assert.ok(html.includes('<meta name="robots" content="noindex">'))
assert.ok(html.includes('og:image') && html.includes('/og.png') && html.includes('twitter:card') && html.includes('rel="canonical"'))
assert.equal((html.match(/<title>/g) ?? []).length, 1)
assert.ok(!renderShare(shell, { slug: 'abcdefghijk', title: 'x', node_count: 3, visibility: 'public' }).includes('noindex'))

// ---- 라우트: 세션 없이 401, /api/t 상태 코드·캐시 헤더, /t/:slug 셸 ----
const onErr: ErrorHandler<AppEnv> = (e, c) => (e instanceof HttpError ? c.json({ error: { code: e.code } }, e.status as 400) : c.json({ error: { code: 'internal', m: String(e) } }, 500))
const app = new Hono<AppEnv>()
app.onError(onErr)
app.use(async (c, next) => { c.set('db', db); c.set('user', null); await next() })
registerSync(app)
registerSharePages(app, () => shell)
assert.equal((await app.request('/api/sync')).status, 401)
assert.equal((await app.request('/api/trees')).status, 401)
const ok = await app.request(`/api/t/${s4}`)
assert.equal(ok.status, 200)
assert.equal(ok.headers.get('cache-control'), 'private, no-store')
const body = (await ok.json()) as { id: string; slug: string; nodes: unknown[]; owner: { nickname: string; avatar_url: null }; node_count: number; flags: unknown }
assert.equal(body.id, ts)
assert.equal(body.slug, s4)
assert.equal(body.nodes.length, 3)
assert.equal(body.owner.avatar_url, null)
assert.deepEqual(body.flags, { report: true, rating: true }) // 계약 B: 신고·별점 스위치 동봉
assert.equal((await app.request(`/api/t/${newSlug()}`)).status, 404)
setHidden(db, ts, true, 9)
const hid = await app.request(`/api/t/${s4}`)
assert.equal(hid.status, 403)
assert.equal(((await hid.json()) as { error: { code: string } }).error.code, 'hidden')
const pg403 = await app.request(`/t/${s4}`)
assert.equal(pg403.status, 403)
assert.ok(!(await pg403.text()).includes('og:title'))
setHidden(db, ts, false, 10)
const pg = await app.request(`/t/${s4}`, { headers: { 'user-agent': 'facebookexternalhit/1.1' } })
assert.equal(pg.status, 200)
assert.equal(pg.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=600')
assert.ok((await pg.text()).includes('<title>공유</title>'))
assert.equal((await app.request('/t/nope')).status, 404)
assert.equal((await app.request(`/api/t/${s4}/copy`, { method: 'POST' })).status, 204)
assert.equal(get('SELECT copy_count FROM trees WHERE id = ?', ts)!.copy_count, 1)
assert.equal((await app.request(`/api/t/${newSlug()}/copy`, { method: 'POST' })).status, 404)
clearGalleryCache()
const gr = await app.request('/api/gallery?sort=copies&page=1')
assert.equal(gr.status, 200)
g = (await gr.json()) as typeof g
assert.deepEqual([g.page, g.hasMore, g.items[0].copyCount], [1, false, 1])
assert.equal((await app.request('/api/gallery?sort=bogus')).status, 400)
// U60: /api/trees 는 본인 트리만 + copyCount (남의 트리 안 보임)
const ownApp = new Hono<AppEnv>()
ownApp.onError(onErr)
ownApp.use(async (c, next) => { c.set('db', db); c.set('user', { id: S, role: 'user', nickname: 's', sessionId: 'x' }); await next() })
registerSync(ownApp)
const own = (await (await ownApp.request('/api/trees')).json()) as { trees: { id: string; copyCount: number; hiddenByAdmin: boolean }[] }
assert.ok(own.trees.length > 0 && own.trees.every((t) => get('SELECT owner_id FROM trees WHERE id = ?', t.id)!.owner_id === S))
assert.ok(!own.trees.some((t) => zt.includes(t.id)))
assert.deepEqual([own.trees.find((t) => t.id === ts)?.copyCount, own.trees.find((t) => t.id === ts)?.hiddenByAdmin], [1, false])
// 계약 A: push 본문 userId 가 세션 사용자와 다르면 409 user_mismatch. 같거나 없으면(옛 클라이언트) 통과
const pushAs = (a: Hono<AppEnv>, b: unknown) => a.request('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
const mm = await pushAs(ownApp, { userId: A })
assert.equal(mm.status, 409); assert.equal(((await mm.json()) as { error: { code: string } }).error.code, 'user_mismatch')
assert.equal((await pushAs(ownApp, { userId: S })).status, 200)
assert.equal((await pushAs(ownApp, {})).status, 200)
// 별점 라우트(계약 C3): 비로그인 401 · stars 검증 400 · 본인 403 own_tree · 정상 200 Rating · 재평가 200 · 없는 slug 404 · 숨김 403
const appA = new Hono<AppEnv>()
appA.onError(onErr)
appA.use(async (c, next) => { c.set('db', db); c.set('user', { id: A, role: 'user', nickname: 'a', sessionId: 'y' }); await next() })
registerSync(appA)
const rate = (a: Hono<AppEnv>, slug: string, b: unknown) => a.request(`/api/t/${slug}/rating`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
assert.equal((await rate(app, s4, { stars: 3 })).status, 401)
for (const stars of [0, 6, 'a', 2.5, null]) {
  const bad = await rate(appA, s4, { stars })
  assert.equal(bad.status, 400, String(stars))
  assert.equal(await code(bad), 'bad_request')
}
assert.equal((await rate(appA, s4, {})).status, 400)
const ownRate = await rate(ownApp, s4, { stars: 3 })
assert.equal(ownRate.status, 403)
assert.equal(await code(ownRate), 'own_tree')
const r1 = await rate(appA, s4, { stars: 3 }) // A: 5 → 3, B 2, C 5 → 3.333…
assert.equal(r1.status, 200)
assert.deepEqual(await r1.json(), { avg: 3.3, count: 3, mine: 3, canRate: true })
const r2 = await rate(appA, s4, { stars: 4 }) // 재평가
assert.equal(r2.status, 200)
assert.deepEqual(await r2.json(), { avg: 3.7, count: 3, mine: 4, canRate: true })
assert.equal((await rate(appA, newSlug(), { stars: 4 })).status, 404)
assert.deepEqual(((await (await appA.request(`/api/t/${s4}`)).json()) as { rating: unknown }).rating, { avg: 3.7, count: 3, mine: 4, canRate: true })
assert.deepEqual(((await (await app.request(`/api/t/${s4}`)).json()) as { rating: unknown }).rating, { avg: 3.7, count: 3, mine: null, canRate: false })
setHidden(db, ts, true, 11)
assert.equal(await code(await rate(appA, s4, { stars: 4 })), 'hidden')
setHidden(db, ts, false, 12)
// 응답 시간 동일화: 404·200 모두 하한 이상
const t404 = performance.now(); await app.request(`/api/t/${newSlug()}`)
assert.ok(performance.now() - t404 >= 35)

console.log('sync.check ok')
