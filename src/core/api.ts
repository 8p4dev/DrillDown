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
type Role = 'user' | 'admin'

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
  legal: LegalMe
  product: ProductMe
}

/** GET /api/me 의 법규·통지 부분(server/account/legal.ts 가 채운다). 비로그인은 GET /api/notices 가 같은 모양(audience='all' 만) */
export interface LegalMe {
  /** 지금 유효한 공지(기간 안·대상 맞음) */
  notices: Notice[]
  /** 예약된 점검(아직 시작 전)의 사전 고지. 점검 중 자체는 Me.maintenance */
  maintenance_scheduled?: { from: number; until: number | null }
}
/** 공지 1건 — settings.notices. 기간 없음 = 항상, audience 'users' = 로그인 사용자만 */
export interface Notice {
  id: string
  text: string
  url?: string
  from?: number | null
  until?: number | null
  audience: 'all' | 'users'
}
/** 저작권 게시중단 요청(GET /api/admin/takedowns) — 저작권법 §103. received → hidden(즉시 숨김·소유자 앱 내 통보) → resume_notified(재개 예정일 통보) → resumed | litigation. 또는 confirmed(30일 내 재개 요구 없음) | rejected */
export type TakedownState = 'received' | 'hidden' | 'resume_notified' | 'resumed' | 'litigation' | 'confirmed' | 'rejected'
export interface Takedown {
  id: ID
  slug: string
  tree: { id: ID; title: string; slug: string | null; hidden_by_admin_at: number | null } | null
  claimant_name: string
  claimant_contact: string
  claim: string
  state: TakedownState
  received_at: number
  hidden_at: number | null
  counter_at: number | null
  resume_due: number | null
  resolved_at: number | null
  /** 소유자가 보낸 열린 소명(= 재개 요구) 시각 */
  appealed_at: number | null
}
/** 정보주체 요청(GET /api/admin/requests) — 열람·정정·삭제·처리정지·미성년·기타, 기한 10일 */
export type DsrKind = 'access' | 'correct' | 'delete' | 'suspend' | 'minor' | 'other'
export interface DsrRequest {
  id: ID
  kind: DsrKind
  channel: string
  received_at: number
  due_at: number
  target_type: 'user' | 'tree' | null
  target_id: string | null
  state: 'open' | 'done' | 'rejected'
  note: string | null
  resolved_at: number | null
}
/** GET /api/report/:id — 접수번호로 보는 상태(연락처·트리 정보 없음) */
export interface ReportStatus {
  kind: 'report' | 'takedown'
  state: 'open' | 'hidden' | 'dismissed' | TakedownState
  received_at: number
  updated_at: number | null
}
/** GET /api/me 의 제품 부분(server/account/product.ts 가 채운다) — 운영 스위치 */
export interface ProductMe { flags: ProductFlags }

// ---- 제품 지표·피드백·스위치 (워커 C, server/account/product.ts) ----
/** 운영 스위치(settings.flags). 기본 전부 true. 서버 라우트도 같은 값으로 거절: 갤러리 404 · 신고/별점/공개 전환 403 */
export interface ProductFlags { gallery: boolean; report: boolean; rating: boolean; publish: boolean }
/** GET/PUT /api/admin/product/settings — flags + 갤러리 상단 고정 slug(≤20) */
export interface ProductSettings { flags: ProductFlags; featured_slugs: string[] }
export type FeedbackCategory = 'bug' | 'idea' | 'content' | 'other'
export const FEEDBACK_CATEGORY: Record<FeedbackCategory, string> = { bug: '버그', idea: '제안', content: '콘텐츠 오류', other: '기타' }
/** 피드백 1건(관리자 GET /api/admin/feedback). user = 닉네임(비로그인·탈퇴 null) */
export interface Feedback {
  id: ID
  user: string | null
  category: FeedbackCategory
  text: string
  tree_id: string | null
  client: string
  created_at: number
  resolved_at: number | null
  /** 운영자 메모 — 보낸 사람에게도 보인다(GET /api/me/feedback) */
  note: string | null
}
export type MyFeedback = Omit<Feedback, 'user' | 'client'>
/** daily_stats 1행(집계값만). share_views·copies·gallery_hits 는 누계 */
export interface DailyStat {
  day: string
  dau: number; wau: number; mau: number; retrieval_active: number
  new_users: number; new_trees: number; attempts: number
  share_views: number; copies: number; gallery_hits: number; client_errors: number
  open_reports: number; public_trees: number; restarts: number
}
/** GET /api/admin/product/metrics?days=30|90|0 — 학습·성장 지표(현재 스키마 SQL). rate 류는 분모 0 이면 null */
export interface ProductMetrics {
  days: number
  since: number
  /** 기간 내 백지 퀴즈 1회 이상 사용자·완료 수 */
  active_users: number
  attempts: number
  /** K2: 활성 사용자 중 14일 내 같은 트리 백지 2회 이상 */
  k2: { users: number; rate: number | null }
  /** 회독별 재현율: 같은 (사용자, 트리) 의 1회차·3회차 node_recall 중앙값 */
  recall: { r1: number | null; r3: number | null; n1: number; n3: number }
  grading: { auto: number; self: number; overridden: number; self_rate: number | null; override_rate: number | null }
  /** 구조 오답 = 1 − AVG(edge_accuracy) */
  structure_error: number | null
  /** FSRS-7 예측 기억률 R(지금 시점) — 기간 내 복습한 카드. users_below_90 = 사용자 평균 R < 0.9 */
  fsrs: { cards: number; avg_r: number | null; users_below_90: number }
  /** 활성화율: 가입 72h 내 백지 완료(가입 후 72h 지난 사용자만 분모) */
  activation: { signups: number; activated: number; rate: number | null }
  providers: Record<string, number>
  reports: { open: number; oldest_open_h: number | null; resolved: number; within_7d_rate: number | null; by_reason: Record<ReportReason, number> }
  inactive_1y: number
  db: { bytes: number; per_user: number }
  /** 어제까지의 행(오늘 행은 기동 restarts 만 있는 stub 이라 뺀다) */
  daily: DailyStat[]
  restarts_today: number
  /** 사고 기록(audit system.incident) 최근 20 — 72h 신고 기한 카운트다운용 */
  incidents: { ts: number; text: string }[]
}
/** GET /api/admin/product/trees — 공개 트리 큐레이션(시드=소유자 admin, 추천=featured_slugs, 복제 계보 원본 제목) */
export interface ProductTree {
  id: ID
  title: string
  slug: string
  owner: string
  seed: boolean
  featured: boolean
  view_count: number
  copy_count: number
  rating_avg: number | null
  rating_count: number
  open_reports: number
  source_title: string | null
  updated_at: number
}
/** GET /api/admin/product/reports — 소유자·신고자 단위 신고 집계(신고자 null = 비로그인·탈퇴) */
export interface ReportAgg {
  owners: { id: ID; nickname: string; trees: number; reports: number; open: number }[]
  reporters: { id: ID | null; nickname: string | null; reports: number }[]
}

/** GET /api/me/sessions 항목 */
export interface Session {
  id6: string
  ua: string // 'Chrome · Android' 수준
  created_at: number
  last_seen_at: number
  current: boolean
}

interface ApiErrorBody {
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
  ops: OpsStats
  product: ProductStats
}

/** stats.ops (server/account/ops.ts) — DB·WAL 크기, 세션 수, 카운터, 버전, OAuth 상태 등. 카운터는 전부 "재시작 이후"(메모리) */
export interface OpsStats {
  /** backups = data/backups/app-YYYYMMDD.db 목록(최신순, 다운로드 없음) */
  db: { file: number; wal: number; page_size: number; page_count: number; freelist: number; backups_bytes: number; backups: { name: string; bytes: number; at: number }[] }
  /** systemd MemoryMax (바이트) — RSS 비율 표시용 */
  rss_max: number
  sessions: { total: number; expired: number; admin: number }
  /** '429:<키>' · 'sync.push' · 'sync.pull' · 'sync.pull.410' 등 상태별 · 'sync.superseded' · 'sync.dropped' · 'oauth.<provider>.<state|token|userinfo>' */
  counters: Record<string, number>
  client_errors: { count: number; recent: { ts: number; message: string; version: string }[] }
  /** git = HEAD 12자, asset = dist/index.html 의 index-<hash>.js, restart_needed = dist·server 가 시작 뒤 바뀜 */
  build: { git: string | null; asset: string | null; started_at: number; restart_needed: boolean }
  /** 수동 실행 중(자식 프로세스) */
  jobs: { backup: boolean; daily: boolean }
  oauth: Record<'google' | 'kakao', { id: boolean; secret: boolean; last_seen_at: number | null }>
  /** 감사 로그 system.restore 최신 ts(복원 리허설) */
  restore_at: number | null
}
/** stats.product (server/account/product.ts) — 가벼운 것만. 학습·성장 지표는 GET /api/admin/product/metrics */
export interface ProductStats { feedback_open: number }
/** GET /api/admin/ops/jobs — 작업 실행 중 폴링용(stats 보다 가볍다). 계약 C(orchestration_review_fix.md §4) */
export interface OpsJobs { running: OpsStats['jobs']; backup: AdminStats['backup']; daily: AdminStats['daily'] }

export interface AdminUser {
  id: ID
  provider: Provider
  /** 관리자 전용 — admins.json 의 'provider:sub' 대조용 */
  provider_sub: string
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
  /** 임시조치(보류 숨김) 만료. null = 확정 숨김 또는 숨김 아님 */
  hidden_until: number | null
  open_reports: number
  /** 관리자 "삭제 트리 복구" 목록용(7일 유예 중). 없음/null = 삭제 안 됨 */
  deleted_at?: number | null
}

export type ReportReason = 'copyright' | 'spam' | 'abuse' | 'other'
export const REASON: Record<ReportReason, string> = { copyright: '저작권', spam: '스팸', abuse: '욕설·혐오', other: '기타' }
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
  /** 파생(읽기 전용): 지금 유효한 audience='all' 첫 공지. 저장은 notices 로 */
  notice: { text: string; enabled: boolean }
  notices: Notice[]
  /** enabled = manual || (from ≤ now < until). PUT 은 manual·from·until 만 받는다 */
  maintenance: { enabled: boolean; manual: boolean; from?: number | null; until?: number | null }
  /** 열린 신고가 이 수에 닿으면 자동 임시 숨김(30일). 0 = 끔 */
  auto_hide_reports: number
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
  /** 운영 스위치(계약 B). 없으면 켜진 것으로 본다 */
  flags?: { report: boolean; rating: boolean }
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
