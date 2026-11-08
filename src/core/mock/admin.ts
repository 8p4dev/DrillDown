// [mock] 관리자 데이터 스토어 — 공유 계약 orchestration_ui_first.md §3.4 (AA 소유). 03 §3.4 화면 · §3.6 /api/admin/* 응답 모양.
// fixture 는 시드 난수로 생성(매 로드 같은 값). 변경 함수는 서버 엔드포인트 1:1 이고 감사 로그를 남긴다. settings 만 localStorage 에 남긴다.
import { useSyncExternalStore } from 'react'
import type { AdminStats, AdminTree, AdminUser, AuditRow, Report, Settings } from '../api'
import { getMe, mockSetNotice } from './me'

const NOW = Date.now()
const DAY = 86400_000
// mulberry32 — 짧고 결정적
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rnd = seeded(20261108)
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ADJ = ['푸른', '조용한', '느린', '밝은', '작은', '깊은', '맑은', '흰', '검은', '빠른'] as const
const NOUN = ['고래', '새벽', '바람', '소나무', '달빛', '호수', '돌담', '여우', '파도', '등불'] as const
const TITLES = ['노동법 총론', '민법 물권', '헌법 기본권', '형법 각론', '행정법 일반', '세법 소득세', '회계원리', '경제학 미시', '국어 문법', '한국사 근현대', '영어 구문', '상법 회사법'] as const

const users: AdminUser[] = Array.from({ length: 50 }, (_, i) => {
  const created = NOW - Math.floor(rnd() * 120) * DAY - Math.floor(rnd() * DAY)
  return {
    id: i === 0 ? 'mock-google-admin' : uuid(i + 1),
    provider: i % 2 ? 'kakao' : 'google',
    nickname: i === 0 ? '운영자' : `${pick(ADJ)}${pick(NOUN)}${i > 20 ? i : ''}`,
    role: i === 0 ? 'admin' : 'user',
    created_at: created,
    last_seen_at: Math.max(created, NOW - Math.floor(rnd() * 40) * DAY),
    suspended_at: i === 7 || i === 23 ? NOW - 3 * DAY : null,
    deleted_at: i === 41 ? NOW - 2 * DAY : null,
    tree_count: Math.floor(rnd() * 9),
  }
})
const trees: AdminTree[] = TITLES.map((title, i) => {
  const o = users[(i * 7 + 3) % 50]
  return {
    id: uuid(1000 + i), title, owner: { id: o.id, nickname: o.nickname },
    node_count: 12 + Math.floor(rnd() * 80), updated_at: NOW - Math.floor(rnd() * 30) * DAY,
    hidden_by_admin_at: i === 9 ? NOW - DAY : null,
    open_reports: [1, 0, 2, 0, 0, 1, 0, 0, 1, 0, 0, 0][i],
    deleted_at: i === 11 ? NOW - 4 * DAY : null,
  }
})
const REASONS = ['copyright', 'spam', 'abuse', 'other'] as const
const reports: Report[] = trees.flatMap((t) =>
  Array.from({ length: t.open_reports }, (_, j) => ({
    id: uuid(2000 + trees.indexOf(t) * 10 + j), tree: { id: t.id, title: t.title },
    reason: REASONS[(trees.indexOf(t) + j) % 4], note: j === 0 ? pick(['출처 표기 없이 교재 내용을 옮겼어요', '광고 링크가 들어 있어요', null, '욕설이 있어요']) : null,
    created_at: NOW - Math.floor(rnd() * 5) * DAY, resolved_at: null, resolution: null,
  })),
)
const ACTIONS = ['user.suspend', 'user.unsuspend', 'tree.hide', 'report.dismiss', 'settings.notice', 'admin.login', 'user.delete'] as const
let auditSeq = 0
const audit: AuditRow[] = Array.from({ length: 30 }, (_, i) => {
  const action = pick(ACTIONS)
  const type = action.split('.')[0] as 'user' | 'tree' | 'report' | 'settings' | 'admin'
  return {
    id: ++auditSeq, ts: NOW - i * 5 * 3600_000 - Math.floor(rnd() * 3600_000), actor_id: users[0].id, action,
    target_type: type === 'admin' ? null : type,
    target_id: type === 'user' ? pick(users).id : type === 'tree' ? pick(trees).id : type === 'report' ? (reports[0]?.id ?? null) : null,
    meta: action === 'user.suspend' ? { reason: '신고 누적' } : null,
  }
}).reverse()

const SKEY = 'mock:admin:settings'
const readSettings = (): Settings => {
  try {
    const raw = localStorage.getItem(SKEY)
    if (raw) return JSON.parse(raw) as Settings
  } catch { /* 기본값 */ }
  return { notice: { text: '', enabled: false }, maintenance: { enabled: false } }
}

const stats = (): AdminStats => {
  const live = users.filter((u) => !u.deleted_at)
  const signups = Array.from({ length: 14 }, (_, i) => {
    const d0 = NOW - (13 - i) * DAY
    return users.filter((u) => u.created_at > d0 - DAY && u.created_at <= d0).length + (i > 9 ? 2 : 0)
  })
  return {
    users: {
      total: live.length, today: signups[13], d7: signups.slice(7).reduce((a, b) => a + b, 0),
      active7: live.filter((u) => u.last_seen_at > NOW - 7 * DAY).length, active30: live.filter((u) => u.last_seen_at > NOW - 30 * DAY).length,
      suspended: live.filter((u) => u.suspended_at).length, pending_delete: users.filter((u) => u.deleted_at).length, signups_14d: signups,
    },
    trees: { total: 183, public: trees.filter((t) => !t.deleted_at).length, hidden: trees.filter((t) => t.hidden_by_admin_at).length, pending_delete: trees.filter((t) => t.deleted_at).length },
    backup: { at: NOW - 5 * 3600_000, bytes: 18_350_080, ok: true },
    daily: { at: NOW - 6 * 3600_000, ok: true, purged_users: 0, purged_sessions: 4, purged_tombstones: 2 },
    disk: { total: 31_000_000_000, free: 22_400_000_000 },
    uptime_s: 9 * 86400 + 3 * 3600 + 120,
    rss: 66_060_288,
  }
}

export interface AdminSnapshot {
  stats: AdminStats
  users: AdminUser[]
  trees: AdminTree[]
  reports: Report[]
  audit: AuditRow[]
  settings: Settings
}
let snap: AdminSnapshot = { stats: stats(), users, trees, reports, audit, settings: readSettings() }
const subs = new Set<() => void>()
const commit = (patch: Partial<AdminSnapshot>) => {
  snap = { ...snap, ...patch, stats: stats() }
  subs.forEach((f) => f())
}
const log = (action: string, target_type: AuditRow['target_type'], target_id: string | null, meta: AuditRow['meta'] = null) =>
  [{ id: ++auditSeq, ts: Date.now(), actor_id: getMe()?.user.id ?? null, action, target_type, target_id, meta }, ...snap.audit].slice(0, 50)

export function useAdmin(): AdminSnapshot {
  return useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => snap)
}

const patchUser = (id: string, p: Partial<AdminUser>) => snap.users.map((u) => (u.id === id ? { ...u, ...p } : u))
const patchTree = (id: string, p: Partial<AdminTree>) => snap.trees.map((t) => (t.id === id ? { ...t, ...p } : t))

/** POST /api/admin/users/:id/suspend — 자기 자신은 호출자가 막는다(권한 매트릭스) */
export function suspendUser(id: string, reason?: string) {
  commit({ users: patchUser(id, { suspended_at: Date.now() }), audit: log('user.suspend', 'user', id, reason ? { reason } : null) })
}
export function unsuspendUser(id: string) {
  commit({ users: patchUser(id, { suspended_at: null }), audit: log('user.unsuspend', 'user', id) })
}
/** POST /api/admin/users/:id/delete { purge_now } — purge 면 행 제거, 아니면 7일 유예 표시 */
export function deleteUser(id: string, purgeNow = false) {
  commit({
    users: purgeNow ? snap.users.filter((u) => u.id !== id) : patchUser(id, { deleted_at: Date.now() }),
    audit: log(purgeNow ? 'user.purge' : 'user.delete', 'user', id),
  })
}
export function hideTree(id: string, reason?: string) {
  commit({ trees: patchTree(id, { hidden_by_admin_at: Date.now() }), audit: log('tree.hide', 'tree', id, reason ? { reason } : null) })
}
export function unhideTree(id: string) {
  commit({ trees: patchTree(id, { hidden_by_admin_at: null }), audit: log('tree.unhide', 'tree', id) })
}
/** POST /api/admin/trees/:id/restore — 7일 유예 중인 삭제 트리 복구 */
export function restoreTree(id: string) {
  commit({ trees: patchTree(id, { deleted_at: null }), audit: log('tree.restore', 'tree', id) })
}
/** POST /api/admin/reports/:id/resolve — hidden 이면 트리 숨김도 수행 */
export function resolveReport(id: string, resolution: 'hidden' | 'dismissed') {
  const r = snap.reports.find((x) => x.id === id)
  if (!r) return
  const reports = snap.reports.map((x) => (x.id === id ? { ...x, resolved_at: Date.now(), resolution } : x))
  let trees = patchTree(r.tree.id, { open_reports: Math.max(0, (snap.trees.find((t) => t.id === r.tree.id)?.open_reports ?? 1) - 1) })
  if (resolution === 'hidden') trees = trees.map((t) => (t.id === r.tree.id ? { ...t, hidden_by_admin_at: Date.now() } : t))
  commit({ reports, trees, audit: log(resolution === 'hidden' ? 'tree.hide' : 'report.dismiss', 'report', id) })
}
/** PUT /api/admin/settings — 배너(useMe().notice/maintenance)도 같이 갱신 */
export function putSettings(s: Settings) {
  const text = s.notice.text.trim().slice(0, 80)
  const next: Settings = { notice: { text, enabled: s.notice.enabled && !!text }, maintenance: { enabled: s.maintenance.enabled } }
  try { localStorage.setItem(SKEY, JSON.stringify(next)) } catch { /* 메모리만 */ }
  mockSetNotice(next.notice.enabled ? { text } : null, next.maintenance.enabled)
  const changed = next.maintenance.enabled !== snap.settings.maintenance.enabled ? 'settings.maintenance' : 'settings.notice'
  commit({ settings: next, audit: log(changed, 'settings', null, { after: next }) })
}
