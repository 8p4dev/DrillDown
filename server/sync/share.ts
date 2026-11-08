// 공개 범위·slug·공유 보기·갤러리·OG (04 §3.3 전이표, §3.4.1, §3.5)
import { randomBytes } from 'node:crypto'
import type { GalleryItem, SharedTree } from '../../src/core/api.ts'
import type { Visibility } from '../../src/core/types.ts'
import type { DB } from '../db.ts'
import { env } from '../env.ts'
import { fail } from '../http.ts'
import { nodeOut, type NodeRow, type TreeRow } from './map.ts'
import { countLiveNodes, nextSeq } from './seq.ts'

export const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export const SLUG_RE = /^[1-9A-HJ-NP-Za-km-z]{11}$/

/** 11자 base58. 거절 샘플링(232 = 58×4)으로 치우침 없음 */
export function newSlug(): string {
  let s = ''
  while (s.length < 11) for (const b of randomBytes(16)) if (b < 232 && s.length < 11) s += B58[b % 58]
  return s
}

const shareUrl = (slug: string | null) => (slug ? `${env.origin}/t/${slug}` : null)

/** UNIQUE 충돌이면 재시도 */
function assignSlug(db: DB, treeId: string, seq: number): string {
  for (;;) {
    const slug = newSlug()
    try {
      db.prepare('UPDATE trees SET slug = ?, seq = ? WHERE id = ?').run(slug, seq, treeId)
      return slug
    } catch (e) {
      if (!/UNIQUE/.test((e as Error).message)) throw e
    }
  }
}

/** 소유자만. 남의 것·없음·삭제 유예는 404 (존재 누설 방지) */
export function ownTree(db: DB, userId: string, id: string): TreeRow {
  const t = db.prepare('SELECT * FROM trees WHERE id = ?').get(id) as TreeRow | undefined
  if (!t || t.owner_id !== userId) fail(404, 'not_found', '트리를 찾을 수 없습니다')
  return t!
}

/** PUT /api/trees/:id/visibility — 전이표 04 §3.3. updated_at 은 건드리지 않는다(LWW 와 무관, 서버가 진실) */
export function setVisibility(db: DB, userId: string, id: string, v: Visibility) {
  const t = ownTree(db, userId, id)
  if (t.deleted_at != null) fail(404, 'not_found', '트리를 찾을 수 없습니다')
  if (v === 'public' && t.visibility !== 'public') {
    if (t.hidden_by_admin_at != null) fail(403, 'hidden_by_admin', '운영 정책으로 숨김 처리된 트리는 공개할 수 없습니다')
    if (!t.title.trim() || countLiveNodes(db, id) < 3) fail(400, 'not_publishable', '제목이 있고 노드가 3개 이상이어야 공개할 수 있습니다')
  }
  const seq = nextSeq(db, userId)
  db.prepare('UPDATE trees SET visibility = ?, seq = ? WHERE id = ?').run(v, seq, id)
  let slug = t.slug
  if (v === 'private') { slug = null; db.prepare('UPDATE trees SET slug = NULL WHERE id = ?').run(id) } // 링크 회수
  else if (!slug) slug = assignSlug(db, id, seq)
  return { visibility: v, slug, url: shareUrl(slug) }
}

/** POST /api/trees/:id/slug — 새 slug, 옛 slug 즉시 404 */
export function reissueSlug(db: DB, userId: string, id: string) {
  const t = ownTree(db, userId, id)
  if (t.deleted_at != null) fail(404, 'not_found', '트리를 찾을 수 없습니다')
  if (t.visibility === 'private') fail(400, 'not_shared', '공유 중인 트리가 아닙니다')
  const slug = assignSlug(db, id, nextSeq(db, userId))
  return { slug, url: shareUrl(slug) }
}

type ShareRow = TreeRow & { nickname: string; avatar_url: string | null; use_provider_avatar: number; owner_deleted_at: number | null }

export type ShareStatus = { ok: true; t: ShareRow } | { ok: false; status: 404 | 410 | 403; code: 'not_found' | 'deleted' | 'hidden' }

/** slug 판정: 404(없음·private) / 410(트리 삭제·소유자 탈퇴 유예) / 403(관리자 숨김; viewer 가 소유자·관리자면 통과) */
export function lookupShare(db: DB, slug: string, viewer?: { id: string; role: string } | null): ShareStatus {
  const t = SLUG_RE.test(slug)
    ? (db.prepare(`SELECT t.*, u.nickname, u.avatar_url, u.use_provider_avatar, u.deleted_at AS owner_deleted_at
        FROM trees t JOIN users u ON u.id = t.owner_id WHERE t.slug = ?`).get(slug) as ShareRow | undefined)
    : undefined
  if (!t || t.visibility === 'private') return { ok: false, status: 404, code: 'not_found' }
  if (t.deleted_at != null || t.owner_deleted_at != null) return { ok: false, status: 410, code: 'deleted' }
  if (t.hidden_by_admin_at != null && viewer?.id !== t.owner_id && viewer?.role !== 'admin') return { ok: false, status: 403, code: 'hidden' }
  return { ok: true, t }
}

/** GET /api/t/:slug 본문. SharedTree + 원본 id(복제 계보 sourceTreeId, 오케스트레이터 확정) */
export function sharedTree(db: DB, t: ShareRow): SharedTree & { id: string } {
  const nodes = (db.prepare('SELECT * FROM nodes WHERE tree_id = ? AND deleted_at IS NULL').all(t.id) as unknown as NodeRow[]).map(nodeOut)
  return {
    id: t.id, slug: t.slug!, title: t.title, visibility: t.visibility as SharedTree['visibility'],
    owner: { nickname: t.nickname, avatar_url: t.use_provider_avatar ? t.avatar_url : null },
    node_count: nodes.length, copy_count: t.copy_count, updated_at: t.updated_at, nodes,
  }
}

// ---- 갤러리: public·미삭제·미숨김·소유자 미탈퇴, 20건, 메모리 60초 캐시 ----
const galleryCache = new Map<string, { at: number; v: { items: GalleryItem[]; page: number; hasMore: boolean } }>()
export const clearGalleryCache = () => galleryCache.clear()

/** q = 제목 부분 검색(LIKE, 와일드카드 이스케이프, 50자 상한, 빈 값 무시) */
export function gallery(db: DB, sort: 'recent' | 'copies', page: number, now: number, q = '') {
  q = q.trim().slice(0, 50)
  const key = `${sort}:${page}:${q}`
  const hit = galleryCache.get(key)
  if (hit && now - hit.at < 60_000) return hit.v
  const rows = db.prepare(`SELECT t.slug, t.title, t.node_count, t.copy_count, t.updated_at, u.nickname FROM trees t JOIN users u ON u.id = t.owner_id
    WHERE t.visibility = 'public' AND t.deleted_at IS NULL AND t.hidden_by_admin_at IS NULL AND u.deleted_at IS NULL AND t.slug IS NOT NULL${q ? " AND t.title LIKE ? ESCAPE '!'" : ''}
    ORDER BY ${sort === 'copies' ? 't.copy_count DESC, ' : ''}t.updated_at DESC, t.id LIMIT 21 OFFSET ?`).all(...(q ? [`%${q.replace(/[!%_]/g, '!$&')}%`] : []), (page - 1) * 20) as { slug: string; title: string; node_count: number; copy_count: number; updated_at: number; nickname: string }[]
  const v = {
    items: rows.slice(0, 20).map((r) => ({ slug: r.slug, title: r.title, nodeCount: r.node_count, copyCount: r.copy_count, ownerNickname: r.nickname, updatedAt: r.updated_at })),
    page, hasMore: rows.length > 20,
  }
  if (galleryCache.size > 500) galleryCache.clear()
  galleryCache.set(key, { at: now, v })
  return v
}

// ---- /t/:slug OG 주입 ----
export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/** shell 의 <title> 을 트리 제목으로 바꾸고 </head> 앞에 OG 태그 삽입. 트리 정보가 없으면 셸 그대로 */
export function renderShare(shell: string, t?: { slug: string; title: string; node_count: number; visibility: string }): string {
  if (!t) return shell
  const url = `${env.origin}/t/${t.slug}`
  const title = esc(t.title || 'Drill Down')
  const desc = esc(`노드 ${t.node_count}개 · 플래시카드·빈칸·백지 퀴즈 — Drill Down`)
  const tags = [
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(`${env.origin}/og.png`)}">`,
    '<meta property="og:type" content="website">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<link rel="canonical" href="${esc(url)}">`,
    ...(t.visibility === 'unlisted' ? ['<meta name="robots" content="noindex">'] : []),
  ].join('\n    ')
  // 함수 치환: 제목의 `$&` 같은 패턴이 치환 문법으로 해석되지 않게
  return shell.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${title}</title>`).replace('</head>', () => `    ${tags}\n  </head>`)
}
