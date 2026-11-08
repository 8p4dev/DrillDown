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
    throw new ApiError(res.status, err?.code ?? 'internal', err?.message ?? `HTTP ${res.status}`, err?.field, ra)
  }
  return data as T
}

export type Provider = 'google' | 'kakao'
export type Role = 'user' | 'admin'

export interface User {
  id: ID
  provider: Provider
  nickname: string
  avatar_url: string | null
  role: Role
  created_at: number
}

/** GET /api/me */
export interface Me {
  user: User
  notice: { text: string } | null
  maintenance: boolean
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
  backup: { at: number; bytes: number; ok: boolean; error?: string }
  daily: { at: number; ok: boolean; purged_users: number; purged_sessions: number; purged_tombstones: number }
  disk: { total: number; free: number }
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

export interface AdminTree {
  id: ID
  title: string
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
  tree: { id: ID; title: string }
  reason: ReportReason
  note: string | null
  created_at: number
  resolved_at: number | null
  resolution: 'hidden' | 'dismissed' | null
}

export interface Settings {
  notice: { text: string; enabled: boolean }
  maintenance: { enabled: boolean }
}

export interface AuditRow {
  id: number
  ts: number
  actor_id: ID | null
  action: string
  target_type: 'user' | 'tree' | 'report' | 'settings' | null
  target_id: ID | null
  meta: Record<string, unknown> | null
}

/** GET /api/t/:slug — 공유 보기 (04 §3.4). nodes 는 TreeNode 와 같은 모양(camelCase, 클라이언트 타입 재사용) */
export interface SharedTree {
  slug: string
  title: string
  visibility: Exclude<Visibility, 'private'>
  owner: { nickname: string; avatar_url: string | null }
  node_count: number
  copy_count: number
  updated_at: number
  nodes: import('./types').TreeNode[]
}

/** GET /api/gallery 항목 (04 §3.5) */
export interface GalleryItem {
  slug: string
  title: string
  nodeCount: number
  copyCount: number
  ownerNickname: string
  updatedAt: number
}
