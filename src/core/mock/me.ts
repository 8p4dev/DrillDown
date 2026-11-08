// [mock] 로그인 세션 스토어 — 공유 계약 orchestration_ui_first.md §3.4 (AA 소유). 서버 없이 UI 를 돌리기 위한 것.
// localStorage 'mock:me' 에 저장해 새로고침 뒤에도 로그인 상태가 유지된다. 서버 구현 때 useMe 는 GET /api/me 로 바뀌고 시그니처는 그대로.
import { useSyncExternalStore } from 'react'
import type { Me, Provider, Session, User } from '../api'

const KEY = 'mock:me'
const subs = new Set<() => void>()
let me: Me | null = read()

function read(): Me | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Me) : null
  } catch {
    return null
  }
}
function set(next: Me | null) {
  me = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch { /* 저장 불가 환경 — 메모리만 */ }
  subs.forEach((f) => f())
}

/** 현재 사용자. null = 비로그인(anon) */
export function useMe(): Me | null {
  return useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => me)
}
export const getMe = () => me

/** 로그인 성공 시각(이 탭 안에서만). NavUser 가 직후 2초 안이면 아바타 rise + "로그인됨" 토스트 (01 §3.6 #18) */
let lastLoginAt = 0
export const getLastLoginAt = () => lastLoginAt

/** 로그인 화면의 제공자 버튼이 호출. admin=true 면 role=admin (관리자 화면 데모용) */
export function mockLogin(provider: Provider, opts: { admin?: boolean; nickname?: string } = {}): Me {
  const user: User = {
    id: `mock-${provider}-${opts.admin ? 'admin' : 'user'}`,
    provider,
    nickname: opts.nickname ?? (provider === 'google' ? '김수험' : '수험생'),
    avatar_url: null,
    role: opts.admin ? 'admin' : 'user',
    created_at: Date.now() - 86400_000 * 12,
  }
  const next: Me = { user, notice: me?.notice ?? null, maintenance: me?.maintenance ?? false }
  lastLoginAt = Date.now()
  sessions = freshSessions()
  set(next)
  return next
}
export function mockLogout() {
  set(null)
}
/** 계정 화면의 닉네임·아바타 변경 등 (PATCH /api/me 대응) */
export function mockPatchMe(patch: Partial<Pick<User, 'nickname' | 'avatar_url'>>) {
  if (me) set({ ...me, user: { ...me.user, ...patch } })
}
/** 관리자 시스템 탭의 공지·점검 모드가 호출 — 모든 화면의 배너가 따라 바뀐다 */
export function mockSetNotice(notice: { text: string } | null, maintenance?: boolean) {
  if (me) set({ ...me, notice, maintenance: maintenance ?? me.maintenance })
}

/** MergeDialog 문구용 "계정의 트리 S개" (03 §3.3 로그인 전 로컬 트리 UX). 서버 단계에선 SH 핸드셰이크가 준다 */
export const mockServerTreeCount: number = 2

// ---- 로그인된 기기 (GET /api/me/sessions) — 메모리만, 로그인마다 3개로 리셋 ----
const H = 3600_000
const freshSessions = (): Session[] => {
  const now = Date.now()
  return [
    { id6: 'a1b2c3', ua: 'Chrome · Windows', created_at: now - 12 * 24 * H, last_seen_at: now, current: true },
    { id6: 'd4e5f6', ua: 'Safari · iPhone', created_at: now - 5 * 24 * H, last_seen_at: now - 3 * H, current: false },
    { id6: 'g7h8i9', ua: 'Chrome · Android', created_at: now - 2 * 24 * H, last_seen_at: now - 26 * H, current: false },
  ]
}
let sessions: Session[] = freshSessions()
const sessionSubs = new Set<() => void>()
const setSessions = (next: Session[]) => {
  sessions = next
  sessionSubs.forEach((f) => f())
}
export const mockSessions = () => sessions
export function useSessions(): Session[] {
  return useSyncExternalStore((f) => (sessionSubs.add(f), () => void sessionSubs.delete(f)), () => sessions)
}
/** DELETE /api/me/sessions/:id6 */
export function revokeSession(id6: string) {
  setSessions(sessions.filter((s) => s.id6 !== id6))
}
/** POST /api/me/sessions/revoke-others → 폐기 수 */
export function revokeOtherSessions(): number {
  const n = sessions.filter((s) => !s.current).length
  setSessions(sessions.filter((s) => s.current))
  return n
}
