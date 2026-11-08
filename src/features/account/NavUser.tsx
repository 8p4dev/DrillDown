// [스텁 — AA 가 교체] 상단 바 오른쪽 계정 슬롯. 계약: 02 §3.1 상단 바 — 비로그인 ≤760 사람 아이콘(aria '로그인') / ≥761 '로그인' 텍스트 버튼,
// 로그인 시 아바타 32px(+ 닉네임 ≥761) → #/account. 아바타에 동기화 점(오프라인·오류일 때만, useSyncState).
import { useMe } from '../../core/mock/me'
import { href } from '../../router'
import { I } from '../../ui/icons'
import { Icon } from '../../ui/Icon'

export default function NavUser() {
  const me = useMe()
  if (!me) return <a className="nav-login" href={href.login(location.hash || '#/')} aria-label="로그인"><Icon d={I.user} size={20} /></a>
  return <a className="nav-avatar" href={href.account()} aria-label="계정">{me.user.nickname[0]}</a>
}
