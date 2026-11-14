// 관리자 탭 공용 컴포넌트 — 숫자 카드·더 보기·로딩·트리 보기 링크. 훅·포맷은 shared.ts
import type { ReactNode } from 'react'
import { externalLink } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'

export const More = ({ next, more }: { next: string | null; more: () => void }) =>
  next ? <button type="button" className="more" onClick={more}>더 보기</button> : null
export const Loading = () => <p className="muted" aria-busy="true">불러오는 중…</p>
export const TreeLink = ({ slug }: { slug: string | null }) => slug ? <a href={`/t/${slug}`} target="_blank" rel="noreferrer" aria-label="트리 보기(새 탭)"><Icon d={externalLink} /> 보기</a> : null

export const Card = ({ icon, label, value, sub }: { icon: string; label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="stat-card">
    <span className="stat-label"><Icon d={icon} /> {label}</span>
    <strong className="tnum">{value}</strong>
    {sub && <span className="stat-sub tnum">{sub}</span>}
  </div>
)

