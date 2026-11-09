// 로그인 상태 — 공유 계약 orchestration_server.md §3.4 (CA 소유). 화면은 이 경로만 import 한다. 03 §3.2·§3.3·§3.6.
// 모듈 스토어 1개: 앱 시작 GET /api/me(401 → null), 포커스 복귀 시 60초 간격 재확인. 새 사용자 id 확인 때 sync.onLogin(동적 import) → MergePlan 보관.
import { useEffect, useSyncExternalStore } from 'react'
import { api, ApiError, setApiErrorHook, type Me, type MeExport, type PatchMeRes, type Provider, type Providers, type Session } from './api'
import { toast } from '../features/Toast'

/** sync.onLogin 결과 (계약 §3.5, 03 §3.3 M1~M3). 화면은 me 경로로 import 한다 */
export type { MergePlan, MergeChoice } from './sync'
import type { MergeChoice, MergePlan } from './sync'
// 동기화 엔진은 첫 청크에 싣지 않는다 — 필요할 때 동적 import
const loadSync = () => import('./sync')

let me: Me | null = null
let ready = false
let merge: MergePlan | null = null
let justLoggedIn = false
let sessions: Session[] = []
let providers: Providers | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f))
const use = <T>(get: () => T) => useSyncExternalStore(subscribe, get)

const PENDING = 'login:pending' // 로그인 버튼 → 제공자 302 왕복 → 돌아온 첫 /api/me 200 에서 "로그인됨" 1회
const ss = { get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v) } catch { /* 무시 */ } } }

function setMe(next: Me | null) {
  const prevId = me?.user.id
  me = next
  ready = true
  const id = next?.user.id
  if (id && ss.get(PENDING)) {
    ss.set(PENDING, null)
    justLoggedIn = true
    setTimeout(() => { justLoggedIn = false; emit() }, 2000)
  }
  emit()
  if (id && id !== prevId) {
    void loadSync().then((s) => s.onLogin(id)).then((plan) => {
      if (plan && me?.user.id === id) { merge = plan; emit() }
    }).catch(() => { /* 동기화 오류는 sync 상태가 보여 준다 */ })
  }
}

function signedOut() {
  const was = !!me
  merge = null
  sessions = []
  setMe(null)
  if (was) void loadSync().then((s) => s.onLogout())
}

/** 현재 사용자. null = 비로그인 또는 확인 중 */
export const useMe = (): Me | null => use(() => me)
export const getMe = () => me
/** 첫 /api/me 응답을 받았는가 — 로그인 필요 화면이 "확인 중"에 #/login 으로 튀지 않게 */
export const useMeReady = () => use(() => ready)
/** 로그인 왕복 직후 2초 동안 true (아바타 rise + "로그인됨", 01 §3.6 #18) */
export const useJustLoggedIn = () => use(() => justLoggedIn)
export const useMergePlan = () => use(() => merge)

let inflight: Promise<Me | null> | null = null
let lastCheck = 0
/** GET /api/me. 401/403 → 비로그인. 오프라인·5xx 는 현재 값 유지 */
export function refreshMe(): Promise<Me | null> {
  lastCheck = Date.now()
  if (!inflight) {
    inflight = api<Me>('/api/me').then(
      (next) => { setMe(next); return next },
      (e: unknown) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) signedOut()
        else { ready = true; emit() }
        return me
      },
    ).finally(() => { inflight = null })
  }
  return inflight
}

/** return_to 는 '#/' 로 시작하는 해시만(오픈 리디렉트 차단, 03 §3.2). 로그인 화면으로는 돌아가지 않는다 */
const safeReturn = (r?: string) => (r && r.startsWith('#/') && !r.startsWith('#/login') ? r : '#/')
export function loginUrl(provider: Provider, returnTo?: string, opts: { as?: 'user' | 'admin'; name?: string } = {}): string {
  const q = new URLSearchParams({ return_to: safeReturn(returnTo) })
  if (provider === 'fake') {
    q.set('as', opts.as ?? 'user')
    if (opts.name) q.set('name', opts.name)
  }
  return `/api/auth/${provider}/start?${q}`
}
/** 같은 창 이동(standalone PWA 규칙, 03 §3.2) */
export function login(provider: Provider, returnTo?: string, opts?: { as?: 'user' | 'admin'; name?: string }) {
  ss.set(PENDING, '1')
  location.href = loginUrl(provider, returnTo, opts)
}

/** POST /api/auth/logout → null → sync.onLogout(). 오프라인이면 던진다(쿠키가 남으므로) */
export async function logout(): Promise<void> {
  try {
    await api('/api/auth/logout', { method: 'POST', body: {} })
  } catch (e) {
    if (!(e instanceof ApiError) || e.status === 0) throw e
  }
  signedOut()
}

/** PATCH /api/me. 400 invalid 는 ApiError(field) 로 던진다 */
export async function patchMe(patch: { nickname?: string; use_provider_avatar?: boolean }): Promise<PatchMeRes> {
  const r = await api<PatchMeRes>('/api/me', { method: 'PATCH', body: patch })
  if (me) { me = { ...me, user: { ...r.user, use_provider_avatar: r.user.use_provider_avatar ?? patch.use_provider_avatar ?? me.user.use_provider_avatar } }; emit() }
  return r
}

// ---- 로그인된 기기 ----
export const useSessions = () => use(() => sessions)
export async function loadSessions(): Promise<void> {
  sessions = (await api<{ sessions: Session[] }>('/api/me/sessions')).sessions
  emit()
}
export async function revokeSession(id6: string): Promise<void> {
  await api(`/api/me/sessions/${encodeURIComponent(id6)}`, { method: 'DELETE' })
  sessions = sessions.filter((s) => s.id6 !== id6)
  emit()
}
/** 다른 기기 모두 로그아웃 → 폐기 수 */
export async function revokeOtherSessions(): Promise<number> {
  const { revoked } = await api<{ revoked: number }>('/api/me/sessions/revoke-others', { method: 'POST', body: {} })
  sessions = sessions.filter((s) => s.current)
  emit()
  return revoked
}

/** POST /api/me/delete (7일 유예) → 로그아웃 흐름 */
export async function deleteAccount(): Promise<void> {
  await api('/api/me/delete', { method: 'POST', body: {} })
  signedOut()
}
/** GET /api/me/export — 서버만 가진 계정 메타 */
export const exportServer = () => api<MeExport>('/api/me/export')

// ---- 로그인 제공자 (1회 캐시) ----
let providersP: Promise<void> | null = null
const loadProviders = () =>
  (providersP ??= api<Providers>('/api/auth/providers').then((p) => { providers = p; emit() }, () => { providersP = null }))
/** null = 확인 중/실패(버튼은 켜 둔다 — 서버가 설정 안 된 제공자면 오류로 돌려보낸다) */
export function useProviders(): Providers | null {
  useEffect(() => void loadProviders(), [])
  return use(() => providers)
}

// ---- 병합 (03 §3.3) ----
export async function applyMerge(choice: MergeChoice): Promise<void> {
  await (await loadSync()).applyMerge(choice)
  merge = null
  emit()
}
export function dismissMerge() {
  merge = null
  emit()
}

// ---- 공통 오류: 503 점검 → 배너, 429 → 토스트 1회 ----
let limitedAt = 0
setApiErrorHook((e, path) => {
  if (e.status === 503 && e.code === 'maintenance' && me && !me.maintenance) { me = { ...me, maintenance: true }; emit() }
  // /api/sync 의 429 는 엔진이 Retry-After 로 조용히 재시도한다(P1 U08) — 토스트 제외
  if (e.status === 429 && !path.startsWith('/api/sync') && Date.now() - limitedAt > 10_000) { limitedAt = Date.now(); toast('요청이 많아요 · 잠시 후 다시 시도해 주세요') }
})

if (typeof window !== 'undefined') {
  void refreshMe()
  const recheck = () => { if (document.visibilityState === 'visible' && Date.now() - lastCheck >= 60_000) void refreshMe() }
  addEventListener('focus', recheck)
  document.addEventListener('visibilitychange', recheck)
}
