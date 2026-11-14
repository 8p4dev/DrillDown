// 관리자 탭 공용 컴포넌트 — 숫자 카드·더 보기·로딩·D-N·트리 보기 링크. 훅·포맷은 shared.ts
import type { ReactNode } from 'react'
import { externalLink } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { dday } from './shared'

export const More = ({ next, more }: { next: string | null; more: () => void }) =>
  next ? <button type="button" className="more" onClick={more}>더 보기</button> : null
/** 로딩 한 가지 표현. onRetry 가 있으면 [다시 시도] */
export const Loading = ({ onRetry }: { onRetry?: () => void }) => (
  <p className="muted" aria-busy="true">불러오는 중…{onRetry && <> <button type="button" className="link" onClick={onRetry}>다시 시도</button></>}</p>
)
/** 기한 표식: soon 일 이내 빨강. clamp 면 0 에서 멈춤(자동 해제 기한), 아니면 지난 뒤 D+N 채움(법정 기한) */
export const Dday = ({ at, soon = 3, clamp = false, title }: { at: number; soon?: number; clamp?: boolean; title?: string }) => {
  const d = clamp ? Math.max(0, dday(at)) : dday(at)
  return <span className="dday" data-soon={d <= soon} data-over={d < 0} title={title}>{d < 0 ? `D+${-d}` : `D-${d}`}</span>
}
export const TreeLink = ({ slug }: { slug: string | null }) => slug ? <a href={`/t/${slug}`} target="_blank" rel="noreferrer" aria-label="트리 보기(새 탭)"><Icon d={externalLink} /> 보기</a> : null

export const Card = ({ icon, label, value, sub }: { icon: string; label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="stat-card">
    <span className="stat-label"><Icon d={icon} /> {label}</span>
    <strong className="tnum">{value}</strong>
    {sub && <span className="stat-sub tnum">{sub}</span>}
  </div>
)

