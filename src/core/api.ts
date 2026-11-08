// 서버 API 응답 타입 — 공유 계약 docs/plans/orchestration_ui_first.md §3.3 (AA 소유, 이름은 03 §3.6 · 04 §3.6 그대로, snake_case)
// UI-First 단계: fetch 래퍼 없음. 화면은 src/core/mock/* 의 스토어를 읽는다. 서버 구현 때 api<T>() 가 같은 타입을 돌려준다.
import type { ID, Visibility } from './types'

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
  error: { code: 'unauthorized' | 'forbidden' | 'not_found' | 'invalid' | 'unsupported_media' | 'rate_limited' | 'maintenance' | 'suspended' | 'purged'; message: string; field?: string }
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
