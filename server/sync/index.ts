// 저장·동기화·공유 서버 라우트 (04 §3.6 API 표). 판정은 push/pull/share/owner 의 순수 함수, 여기는 인증·리밋·상태 코드만
import type { Context, Hono } from 'hono'
import type { Visibility } from '../../src/core/types.ts'
import { countGalleryHit, countView, productSettings, requireFlag } from '../account/product.ts'
import { tx } from '../db.ts'
import { body, clientIp, fail, GRACE_MS, hit, limit, requireUser, type AppEnv } from '../http.ts'
import { count } from '../metrics.ts'
import { LIMITS, parsePush, treeOut, nodeOut, type NodeRow, type TreeRow } from './map.ts'
import { restoreTree } from './owner.ts'
import { pullSince } from './pull.ts'
import { applyPush } from './push.ts'
import { nextSeq } from './seq.ts'
import { gallery, lookupShare, ownTree, rateTree, reissueSlug, renderShare, setVisibility, sharedTree } from './share.ts'

const MIN = 60_000
const CRAWLER = /facebookexternalhit|kakaotalk-scrap|Slackbot|Twitterbot/i
/** #42 공유 링크 조회 수 — 요청 수(크롤러 UA 제외, IP 비저장이라 유니크 불가). 메모리에 모아 5분마다 반영(product.ts flushViews) */
const viewed = (c: Context<AppEnv>, treeId: string) => { if (!CRAWLER.test(c.req.header('user-agent') ?? '')) countView(treeId) }
/** 404·410·403·200 응답 시간을 맞춘다(존재 여부 누설 방지, 04 §3.3) */
const FLOOR_MS = 40
const pad = async (t0: number) => { const d = FLOOR_MS - (performance.now() - t0); if (d > 0) await new Promise((r) => setTimeout(r, d)) }

const uid = (c: Context<AppEnv>) => c.get('user')!.id
const treeId = (c: Context<AppEnv>) => {
  const id = c.req.param('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) fail(404, 'not_found', '트리를 찾을 수 없습니다')
  return id.toLowerCase()
}

/** /api/sync /api/trees* /api/t/:slug(GET·copy·rating) /api/gallery */
export function registerSync(app: Hono<AppEnv>) {
  // 동기화 건강 카운터(메모리): push/pull 수와 400·403·410 등 상태별 수. 관리자 대시보드 "재시작 이후"
  app.use('/api/sync', async (c, next) => { await next(); count(`sync.${c.req.method === 'POST' ? 'push' : 'pull'}${c.res.status >= 400 ? `.${c.res.status}` : ''}`) })
  app.post('/api/sync', requireUser, limit('sync_push', 300, MIN), async (c) => {
    const raw = await body<{ userId?: unknown }>(c, LIMITS.bytes)
    // 계약 A: 클라이언트가 보낸 meta.userId 가 세션 사용자와 다르면 409 — 다른 계정의 outbox 가 섞여 올라오는 것을 막는다(r2 H2)
    if (raw.userId !== undefined && raw.userId !== uid(c)) fail(409, 'user_mismatch', '로그인한 계정이 바뀌었습니다. 다시 로그인해 주세요')
    const p = parsePush(raw)
    const r = applyPush(c.get('db'), uid(c), p, Date.now())
    count('sync.superseded', r.superseded.trees.length + r.superseded.nodes.length + r.superseded.srs.length); count('sync.dropped', r.dropped.length + r.id_taken.length)
    return c.json(r)
  })
  app.get('/api/sync', requireUser, limit('sync_pull', 300, MIN), (c) => {
    const s = c.req.query('since') ?? '0'
    if (!/^\d{1,15}$/.test(s)) fail(400, 'invalid', 'since 가 올바르지 않습니다', 'since')
    return c.json(pullSince(c.get('db'), uid(c), Number(s)))
  })

  // ---- /api/trees* (owner) ----
  app.get('/api/trees', requireUser, limit('trees', 60, MIN), (c) => {
    const rows = c.get('db').prepare('SELECT * FROM trees WHERE owner_id = ? ORDER BY updated_at DESC').all(uid(c)) as unknown as TreeRow[]
    return c.json({ trees: rows.map((r) => ({ ...treeOut(r), nodeCount: r.node_count, copyCount: r.copy_count })) })
  })
  app.get('/api/trees/:id', requireUser, limit('tree_get', 30, MIN), (c) => {
    const db = c.get('db')
    const t = ownTree(db, uid(c), treeId(c))
    const nodes = (db.prepare('SELECT * FROM nodes WHERE tree_id = ? AND deleted_at IS NULL').all(t.id) as unknown as NodeRow[]).map(nodeOut)
    return c.json({ tree: treeOut(t), nodes })
  })
  app.delete('/api/trees/:id', requireUser, limit('tree_del', 30, MIN), (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => {
      const t = ownTree(db, uid(c), treeId(c))
      if (t.deleted_at != null) return { deletedAt: t.deleted_at }
      const at = Math.max(Date.now(), t.updated_at + 1) // outbox tree del 과 같은 효과: LWW 키로 이기는 톰스톤
      db.prepare('UPDATE trees SET deleted_at = ?, updated_at = ?, seq = ? WHERE id = ?').run(at, at, nextSeq(db, t.owner_id), t.id)
      return { deletedAt: at }
    }))
  })
  app.post('/api/trees/:id/restore', requireUser, limit('tree_restore', 10, MIN), (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => {
      const t = ownTree(db, uid(c), treeId(c))
      if (t.deleted_at != null && t.deleted_at < Date.now() - GRACE_MS) fail(410, 'purged', '복구 기간(7일)이 지났습니다')
      restoreTree(db, t.id)
      return { tree: treeOut(db.prepare('SELECT * FROM trees WHERE id = ?').get(t.id) as unknown as TreeRow) }
    }))
  })
  app.put('/api/trees/:id/visibility', requireUser, limit('tree_vis', 30, MIN), async (c) => {
    const { visibility } = await body<{ visibility?: unknown }>(c)
    if (visibility !== 'private' && visibility !== 'unlisted' && visibility !== 'public') fail(400, 'invalid', '공개 범위가 올바르지 않습니다', 'visibility')
    const db = c.get('db')
    if (visibility !== 'private') requireFlag(db, 'publish') // #44 공개 전환 스위치
    const id = treeId(c)
    return c.json(tx(db, () => setVisibility(db, uid(c), id, visibility as Visibility)))
  })
  app.post('/api/trees/:id/slug', requireUser, limit('tree_slug', 10, MIN), (c) => {
    const db = c.get('db')
    const id = treeId(c)
    return c.json(tx(db, () => reissueSlug(db, uid(c), id)))
  })

  // ---- 공유 (anon) ----
  app.get('/api/t/:slug', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    hit(c, `t:${clientIp(c)}`, 60, MIN)
    const t0 = performance.now()
    const db = c.get('db')
    const s = lookupShare(db, c.req.param('slug'), c.get('user'))
    const out = s.ok ? sharedTree(db, s.t, c.get('user')) : null
    if (s.ok) viewed(c, s.t.id)
    await pad(t0)
    if (!s.ok) fail(s.status, s.code, s.code === 'deleted' ? '삭제된 트리입니다' : s.code === 'hidden' ? '운영 정책으로 숨김 처리된 트리입니다' : '없는 링크입니다')
    // 계약 B: 신고·별점 스위치를 함께 내려 공유 보기가 비로그인에서도 꺼진 기능을 숨긴다(r4-06)
    const f = productSettings(db).flags
    return c.json({ ...out!, flags: { report: f.report, rating: f.rating } })
  })
  app.post('/api/t/:slug/copy', (c) => {
    hit(c, `copy:${clientIp(c)}`, 20, 24 * 60 * MIN)
    const db = c.get('db')
    const s = lookupShare(db, c.req.param('slug'), c.get('user'))
    if (!s.ok) fail(404, 'not_found', '없는 링크입니다')
    else db.prepare('UPDATE trees SET copy_count = copy_count + 1 WHERE id = ?').run(s.t.id)
    return c.body(null, 204)
  })
  // 별점(계약 C3): 로그인 필수, 1..5 정수, slug 판정은 GET 과 같은 404/410/403, 본인 트리 403 own_tree
  app.put('/api/t/:slug/rating', requireUser, limit('rate', 30, MIN), async (c) => {
    const { stars } = await body<{ stars?: unknown }>(c)
    if (!Number.isInteger(stars) || (stars as number) < 1 || (stars as number) > 5) fail(400, 'bad_request', '별점은 1~5 사이 정수여야 합니다', 'stars')
    const db = c.get('db')
    requireFlag(db, 'rating') // #44
    const s = lookupShare(db, c.req.param('slug'), c.get('user'))
    if (!s.ok) fail(s.status, s.code, s.code === 'deleted' ? '삭제된 트리입니다' : s.code === 'hidden' ? '운영 정책으로 숨김 처리된 트리입니다' : '없는 링크입니다')
    else return c.json(rateTree(db, uid(c), s.t, stars as number))
  })
  app.get('/api/gallery', (c) => {
    hit(c, `gallery:${clientIp(c)}`, 30, MIN)
    requireFlag(c.get('db'), 'gallery', 404) // #44 갤러리 끄면 404(존재 숨김)
    countGalleryHit()
    const sort = c.req.query('sort') ?? 'recent'
    const page = c.req.query('page') ?? '1'
    if (sort !== 'recent' && sort !== 'copies') fail(400, 'invalid', '정렬이 올바르지 않습니다', 'sort')
    if (!/^\d{1,4}$/.test(page) || Number(page) < 1) fail(400, 'invalid', '페이지가 올바르지 않습니다', 'page')
    return c.json(gallery(c.get('db'), sort as 'recent' | 'copies', Number(page), Date.now(), c.req.query('q') ?? '', productSettings(c.get('db')).featured_slugs))
  })
}

/** GET /t/:slug → 셸 HTML 에 OG 주입. 404/410/403 도 같은 셸(OG 없음)·상태 코드만 */
export function registerSharePages(app: Hono<AppEnv>, shell: () => string) {
  app.get('/t/:slug', async (c) => {
    const crawler = CRAWLER.test(c.req.header('user-agent') ?? '')
    hit(c, `tpage:${crawler ? 'bot' : clientIp(c)}`, crawler ? 600 : 60, MIN) // UA 는 위조 가능 — 크롤러도 별도 키로 센다(r1 L6)
    const t0 = performance.now()
    const s = lookupShare(c.get('db'), c.req.param('slug'))
    await pad(t0)
    if (!s.ok) {
      c.header('Cache-Control', 'no-store')
      return c.html(shell(), s.status)
    }
    viewed(c, s.t.id)
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=600')
    return c.html(renderShare(shell(), { slug: s.t.slug!, title: s.t.title, node_count: s.t.node_count, visibility: s.t.visibility }))
  })
}
