// 관리자 탭 공용(훅·포맷·감사 로그 라벨). 컴포넌트(Card·More·Loading·treeLink)는 widgets.tsx. 탭별 파일(Dashboard·UsersTab·TreesTab·SystemTab·RequestsTab·MetricsTab·FeedbackTab)이 import 한다.
// 새 감사 action 라벨은 각 탭 파일에서 Object.assign(ACTION, { ... }) 로 등록한다(이 파일을 여러 사람이 동시에 고치지 않게).
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api, ApiError, type Page, type ReportReason } from '../../core/api'
import { href } from '../../router'
import { toast } from '../Toast'

export const REASON: Record<ReportReason, string> = { copyright: '저작권', spam: '스팸', abuse: '욕설·혐오', other: '기타' }
export const p2 = (n: number) => String(n).padStart(2, '0')
export const date = (t: number) => { const d = new Date(t); return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}` }
export const when = (t: number) => { const d = new Date(t); return `${date(t)} ${p2(d.getHours())}:${p2(d.getMinutes())}` }
export const bytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`)
export const dur = (s: number) => `${Math.floor(s / 86400)}일 ${Math.floor((s % 86400) / 3600)}시간`
export const H26 = 26 * 3600_000 // 하루 1회 작업이 "오늘 안 돌았다" 기준

// ---- 데이터: GET 1회 / cursor 페이지. 404(권한 없음 숨김) → #/ . 오류는 서버 메시지·필드 그대로(WCAG 3.3.1) ----
export const guard = (e: unknown) => {
  if (e instanceof ApiError && e.status === 404) location.hash = href.trees()
  else if (e instanceof ApiError && e.status === 0) toast('오프라인이에요')
  else if (e instanceof ApiError) toast(`${e.message}${e.field ? ` (${e.field})` : ''}`)
  else toast('실패했어요 · 다시 시도해 주세요')
}
export function useGet<T>(path: string, tick = 0): [T | null, Dispatch<SetStateAction<T | null>>] {
  const [v, set] = useState<T | null>(null)
  useEffect(() => {
    let on = true
    api<T>(path).then((r) => { if (on) set(r) }, guard)
    return () => { on = false }
  }, [path, tick])
  return [v, set]
}
export function usePaged<T>(path: string, tick = 0) {
  const [page, setPage] = useGet<Page<T>>(path, tick)
  const more = () => {
    if (!page?.next) return
    api<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(page.next)}`)
      .then((r) => setPage((p) => ({ items: [...(p?.items ?? []), ...r.items], next: r.next })), guard)
  }
  const patch = (f: (xs: T[]) => T[]) => setPage((p) => (p ? { ...p, items: f(p.items) } : p))
  return { items: page?.items ?? [], loaded: !!page, next: page?.next ?? null, more, patch }
}
export const ACTION: Record<string, string> = {
  'user.suspend': '사용자 정지', 'user.unsuspend': '정지 해제', 'user.delete': '사용자 삭제(7일 유예)', 'user.purge': '사용자 삭제(즉시)', 'user.restore': '탈퇴 취소',
  'user.delete_requested': '탈퇴 요청(본인)', 'tree.hide': '트리 숨김', 'tree.unhide': '숨김 해제', 'tree.restore': '트리 복구', 'report.dismiss': '신고 기각',
  'settings.notice': '공지 변경', 'settings.maintenance': '점검 모드 변경', 'admin.login': '관리자 로그인',
  'user.search': '사용자 검색', 'user.view': '사용자 상세 조회', 'tree.appeal': '소명 접수(소유자)', 'appeal.reject': '소명 기각',
  'system.sessions_revoke_all': '전 세션 폐기', 'system.incident': '사건 기록', 'system.restore': '복원 기록', 'system.note': '운영 메모',
}
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body })
export const TARGET: Record<string, string> = { user: '사용자', tree: '트리', report: '신고', settings: '설정' }
