// 관리자 탭 공용(훅·포맷·감사 로그 라벨). 컴포넌트(Card·More·Loading·Dday·treeLink)는 widgets.tsx. 탭별 파일(Dashboard·UsersTab·TreesTab·SystemTab·RequestsTab·MetricsTab·FeedbackTab)이 import 한다.
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api, ApiError, type Page } from '../../core/api'
import { href } from '../../router'
import { toast } from '../Toast'

export { p2, date, when } from '../../core/fmt'
export const DAY = 86_400_000
/** 기한까지 남은 날(올림). 지났으면 음수 */
export const dday = (at: number) => Math.ceil((at - Date.now()) / DAY)
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
/** 감사 로그 action → 라벨(한 표). 새 action 은 여기에 */
export const ACTION: Record<string, string> = {
  'user.suspend': '사용자 정지', 'user.unsuspend': '정지 해제', 'user.delete': '사용자 삭제(7일 유예)', 'user.purge': '사용자 삭제(즉시)', 'user.restore': '탈퇴 취소',
  'user.delete_requested': '탈퇴 요청(본인)', 'user.sessions_revoke': '사용자 세션 전부 폐기', 'user.search': '사용자 검색', 'user.view': '사용자 상세 조회',
  'tree.hide': '트리 숨김', 'tree.unhide': '숨김 해제', 'tree.restore': '트리 복구', 'tree.hide_confirm': '임시조치 → 확정 숨김', 'tree.appeal': '소명 접수(소유자)',
  'report.dismiss': '신고 기각', 'appeal.reject': '소명 기각',
  'settings.notice': '공지 변경', 'settings.maintenance': '점검 모드 변경', 'settings.auto_hide_reports': '자동 숨김 기준 변경', 'settings.flags': '운영 스위치 변경', 'settings.featured': '추천 트리 변경',
  'admin.login': '관리자 로그인',
  'system.sessions_revoke_all': '전 세션 폐기', 'system.incident': '사건 기록', 'system.restore': '복원 기록', 'system.note': '운영 메모',
  'system.backup_run': '수동 백업 실행', 'system.daily_run': '일일 작업 실행', 'system.checkpoint': 'WAL checkpoint', 'system.restart': '서버 재시작',
  'dsr.access': '열람 요청 처리', 'dsr.correct': '정정 요청 처리', 'dsr.delete': '삭제 요청 처리', 'dsr.suspend': '처리정지 요청 처리', 'dsr.minor': '미성년 요청 처리', 'dsr.other': '기타 요청 처리', 'dsr.reject': '정보주체 요청 반려',
  'takedown.notify': '재개 예정일 통보(권리자)', 'takedown.litigation': '소 제기 접수 · 숨김 유지', 'takedown.confirm': '게시중단 확정', 'takedown.reject': '게시중단 기각',
  'feedback.resolve': '피드백 처리', 'feedback.reopen': '피드백 다시 열기', 'feedback.note': '피드백 메모',
}
export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body })
export const TARGET: Record<string, string> = { user: '사용자', tree: '트리', report: '신고', settings: '설정' }
