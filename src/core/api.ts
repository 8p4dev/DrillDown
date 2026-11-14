// 서버 API 응답 타입 — 공유 계약 docs/plans/orchestration_ui_first.md §3.3 (AA 소유, 이름은 03 §3.6 · 04 §3.6 그대로, snake_case)
// fetch 래퍼 api<T>() — 모든 서버 호출은 이것만 쓴다(같은 출처 쿠키, JSON, 오류 봉투 → ApiError). 계약: orchestration_server.md §3.4
import type { ID, Visibility } from './types'

export class ApiError extends Error {
  status: number
  code: string
  field?: string
  retryAfter?: number
  constructor(status: number, code: string, message: string, field?: string, retryAfter?: number) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
    this.retryAfter = retryAfter
  }
}

/** 모든 api() 오류를 한 곳에서 본다(me.ts 가 설치: 503 maintenance → 배너, 429 → 토스트 1회) */
let onError: ((e: ApiError, path: string) => void) | undefined
export const setApiErrorHook = (f: (e: ApiError, path: string) => void) => { onError = f }

/** 네트워크 실패는 ApiError(0, 'offline'). 2xx 가 아니면 봉투를 읽어 ApiError. 204 는 undefined */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'offline', '네트워크에 연결할 수 없습니다')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error
    const ra = Number(res.headers.get('retry-after')) || undefined
    const e = new ApiError(res.status, err?.code ?? 'internal', err?.message ?? `HTTP ${res.status}`, err?.field, ra)
    onError?.(e, path)
    throw e
  }
  return data as T
}

/** 'fake' = AUTH_FAKE=1 개발·E2E 로그인 (orchestration_server.md A1) */
export type Provider = 'google' | 'kakao' | 'fake'
export type Role = 'user' | 'admin'

export interface User {
  id: ID
  provider: Provider
  nickname: string
  avatar_url: string | null
  role: Role
  created_at: number
  /** 제공자 사진 토글(03 §3.6 PATCH /api/me). 서버가 안 주면 avatar_url 로 추정 */
  use_provider_avatar?: boolean
}

/** GET /api/auth/providers */
export interface Providers {
  google: boolean
  kakao: boolean
  fake: boolean
  privacy_contact: string
}

/** PATCH /api/me */
export interface PatchMeRes {
  user: User
  relogin_required?: boolean
}

/** GET /api/me/export */
export interface MeExport {
  exported_at: number
  user: User
  sessions: Session[]
}

/** cursor 페이지 — /api/admin/{users,trees,audit} */
export interface Page<T> {
  items: T[]
  next: string | null
}

/** GET /api/me */
export interface Me {
  user: User
  notice: { text: string } | null
  maintenance: boolean
  /** 운영 숨김된 내 트리 — 사유(관리자 메모)·소명 상태. 소명은 POST /api/trees/:id/appeal */
  hidden_trees: { id: ID; title: string; at: number; reason: string | null; appealed_at: number | null }[]
}

/** GET /api/me/sessions 항목 */
export interface Session {
  id6: string
  ua: string // 'Chrome · Android' 수준
  created_at: number
  last_seen_at: number
  current: boolean
}

export interface ApiErrorBody {
  error: { code: string; message: string; field?: string } // 코드 목록: 03 §3.6 + 04 §3.6
}

/** GET /api/admin/stats */
export interface AdminStats {
  users: { total: number; today: number; d7: number; active7: number; active30: number; suspended: number; pending_delete: number; signups_14d: number[] }
  trees: { total: number; public: number; hidden: number; pending_delete: number }
  /** at=0 = 아직 없음. uploaded = 외부 업로드 완료, configured = 외부 업로드 설정 있음 */
  backup: { at: number; bytes: number; ok: boolean; uploaded?: boolean; configured: boolean; error?: string }
  daily: { at: number; ok: boolean; purged_users: number; purged_sessions: number; purged_tombstones: number; error?: string }
  disk: { total: number; free: number }
  /** 재시작 이후 5xx (메모리, 최근 20건) */
  errors: { count: number; recent: { ts: number; method: string; path: string; name: string }[] }
  flags: { auth_fake: boolean }
  uptime_s: number
  rss: number
}

export interface AdminUser {
  id: ID
  provider: Provider
  nickname: string
  role: Role
  created_at: number
  last_seen_at: number
  suspended_at: number | null
  deleted_at: number | null
  tree_count: number
}

/** GET /api/admin/users/:id */
export interface AdminUserDetail extends AdminUser {
  sessions: number
  trees: { id: ID; title: string; visibility: Visibility; updated_at: number }[]
}

export interface AdminTree {
  id: ID
  title: string
  slug: string | null
  owner: { id: ID; nickname: string }
  node_count: number
  updated_at: number
  hidden_by_admin_at: number | null
  open_reports: number
  /** 관리자 "삭제 트리 복구" 목록용(7일 유예 중). 없음/null = 삭제 안 됨 */
  deleted_at?: number | null
}

export type ReportReason = 'copyright' | 'spam' | 'abuse' | 'other'
export interface Report {
  id: ID
  tree: { id: ID; title: string; slug: string | null; hidden_by_admin_at: number | null }
  reason: ReportReason
  note: string | null
  created_at: number
  resolved_at: number | null
  resolution: 'hidden' | 'dismissed' | null
}

/** 소명 (GET /api/admin/appeals) */
export interface Appeal {
  id: ID
  tree: { id: ID; title: string; slug: string | null; hidden_by_admin_at: number | null }
  owner: string
  text: string
  created_at: number
  resolved_at: number | null
  resolution: 'accepted' | 'rejected' | null
}

export interface Settings {
  notice: { text: string; enabled: boolean }
  maintenance: { enabled: boolean }
}

export interface AuditRow {
  id: number
  ts: number
  actor_id: ID | null
  /** 행위자 닉네임(조인). null = 시스템 또는 탈퇴 */
  actor: string | null
  action: string
  target_type: 'user' | 'tree' | 'report' | 'settings' | null
  target_id: ID | null
  meta: Record<string, unknown> | null
}

/** GET /api/t/:slug — 공유 보기 (04 §3.4). nodes 는 TreeNode 와 같은 모양(camelCase, 클라이언트 타입 재사용) */
export interface SharedTree {
  /** 원본 트리 id (복제 sourceTreeId) */
  id: ID
  slug: string
  title: string
  visibility: Exclude<Visibility, 'private'>
  owner: { nickname: string; avatar_url: string | null }
  node_count: number
  copy_count: number
  updated_at: number
  /** 별점(계약 C3): avg = 평균(소수 1자리, 없으면 null), count = 평가 수, mine = 내 점수(비로그인·미평가 null), canRate = 로그인 + 본인 트리 아님 */
  rating: Rating
  nodes: import('./types').TreeNode[]
}

/** 별점 요약. PUT /api/t/:slug/rating { stars: 1..5 } 의 응답도 이 모양(mine 은 방금 준 점수, canRate true) */
export interface Rating {
  avg: number | null
  count: number
  mine: number | null
  canRate: boolean
}

/** GET /api/gallery 항목 (04 §3.5) */
export interface GalleryItem {
  slug: string
  title: string
  nodeCount: number
  copyCount: number
  ownerNickname: string
  updatedAt: number
  /** 별점 평균(소수 1자리, 평가 없으면 null)·평가 수 (계약 C3) */
  ratingAvg: number | null
  ratingCount: number
}
