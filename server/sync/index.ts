// 저장·동기화·공유 서버 라우트 (04 §3.6 API 표). 판정은 push/pull/share/owner 의 순수 함수, 여기는 인증·리밋·상태 코드만
import type { Context, Hono } from 'hono'
import type { Visibility } from '../../src/core/types.ts'
import { tx } from '../db.ts'
import { body, clientIp, fail, GRACE_MS, hit, limit, now, requireUser, type AppEnv } from '../http.ts'
import { LIMITS, parsePush, treeOut, nodeOut, type NodeRow, type TreeRow } from './map.ts'
import { restoreTree } from './owner.ts'
import { pullSince } from './pull.ts'
import { applyPush } from './push.ts'
import { nextSeq } from './seq.ts'
import { gallery, lookupShare, ownTree, reissueSlug, renderShare, setVisibility, sharedTree } from './share.ts'

const MIN = 60_000
/** 404·410·403·200 응답 시간을 맞춘다(존재 여부 누설 방지, 04 §3.3) */
const FLOOR_MS = 40
const pad = async (t0: number) => { const d = FLOOR_MS - (performance.now() - t0); if (d > 0) await new Promise((r) => setTimeout(r, d)) }

const uid = (c: Context<AppEnv>) => c.get('user')!.id
const treeId = (c: Context<AppEnv>) => {
  const id = c.req.param('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) fail(404, 'not_found', '트리를 찾을 수 없습니다')
  return id.toLowerCase()
}

/** /api/sync /api/trees* /api/t/:slug(GET·copy) /api/gallery */
export function registerSync(app: Hono<AppEnv>) {
  app.post('/api/sync', requireUser, limit('sync_push', 300, MIN), async (c) => {
    const p = parsePush(await body(c, LIMITS.bytes))
    return c.json(applyPush(c.get('db'), uid(c), p, now()))
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
      const at = Math.max(now(), t.updated_at + 1) // outbox tree del 과 같은 효과: LWW 키로 이기는 톰스톤
      db.prepare('UPDATE trees SET deleted_at = ?, updated_at = ?, seq = ? WHERE id = ?').run(at, at, nextSeq(db, t.owner_id), t.id)
      return { deletedAt: at }
    }))
  })
  app.post('/api/trees/:id/restore', requireUser, limit('tree_restore', 10, MIN), (c) => {
    const db = c.get('db')
    return c.json(tx(db, () => {
      const t = ownTree(db, uid(c), treeId(c))
      if (t.deleted_at != null && t.deleted_at < now() - GRACE_MS) fail(410, 'purged', '복구 기간(7일)이 지났습니다')
      restoreTree(db, t.id)
      return { tree: treeOut(db.prepare('SELECT * FROM trees WHERE id = ?').get(t.id) as unknown as TreeRow) }
    }))
  })
  app.put('/api/trees/:id/visibility', requireUser, limit('tree_vis', 30, MIN), async (c) => {
    const { visibility } = await body<{ visibility?: unknown }>(c)
    if (visibility !== 'private' && visibility !== 'unlisted' && visibility !== 'public') fail(400, 'invalid', '공개 범위가 올바르지 않습니다', 'visibility')
    const db = c.get('db')
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
    const out = s.ok ? sharedTree(db, s.t) : null
    await pad(t0)
    if (!s.ok) fail(s.status, s.code, s.code === 'deleted' ? '삭제된 트리입니다' : s.code === 'hidden' ? '운영 정책으로 숨김 처리된 트리입니다' : '없는 링크입니다')
    return c.json(out)
  })
  app.post('/api/t/:slug/copy', (c) => {
    hit(c, `copy:${clientIp(c)}`, 20, 24 * 60 * MIN)
    const db = c.get('db')
    const s = lookupShare(db, c.req.param('slug'), c.get('user'))
    if (!s.ok) fail(404, 'not_found', '없는 링크입니다')
    else db.prepare('UPDATE trees SET copy_count = copy_count + 1 WHERE id = ?').run(s.t.id)
    return c.body(null, 204)
  })
  app.get('/api/gallery', (c) => {
    hit(c, `gallery:${clientIp(c)}`, 30, MIN)
    const sort = c.req.query('sort') ?? 'recent'
    const page = c.req.query('page') ?? '1'
    if (sort !== 'recent' && sort !== 'copies') fail(400, 'invalid', '정렬이 올바르지 않습니다', 'sort')
    if (!/^\d{1,4}$/.test(page) || Number(page) < 1) fail(400, 'invalid', '페이지가 올바르지 않습니다', 'page')
    return c.json(gallery(c.get('db'), sort as 'recent' | 'copies', Number(page), now(), c.req.query('q') ?? ''))
  })
}

const CRAWLER = /facebookexternalhit|kakaotalk-scrap|Slackbot|Twitterbot/i

/** GET /t/:slug → 셸 HTML 에 OG 주입. 404/410/403 도 같은 셸(OG 없음)·상태 코드만 */
export function registerSharePages(app: Hono<AppEnv>, shell: () => string) {
  app.get('/t/:slug', async (c) => {
    if (!CRAWLER.test(c.req.header('user-agent') ?? '')) hit(c, `tpage:${clientIp(c)}`, 60, MIN)
    const t0 = performance.now()
    const s = lookupShare(c.get('db'), c.req.param('slug'))
    await pad(t0)
    if (!s.ok) {
      c.header('Cache-Control', 'no-store')
      return c.html(shell(), s.status)
    }
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=600')
    return c.html(renderShare(shell(), { slug: s.t.slug!, title: s.t.title, node_count: s.t.node_count, visibility: s.t.visibility }))
  })
}
