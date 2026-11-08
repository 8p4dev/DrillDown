// 상단 바 오른쪽 계정 슬롯 — 02 §3.1 상단 바: 비로그인 ≤760 사람 아이콘(aria '로그인') / ≥761 '로그인' 텍스트 버튼(둘 다 그려 두고 CSS 로 교대),
// 로그인 시 아바타 32px(+ 닉네임 ≥761) → #/account. 아바타 모서리 동기화 점(오프라인·오류일 때만, 탭=목록). 로그인 왕복 직후 rise + "로그인됨"(01 §3.6 #18).
// 병합 대화(MergeDialog)는 me.ts 가 보관한 sync.onLogin 의 MergePlan 으로 띄운다(03 §3.3): (0,0) 무음 / (0,S) 토스트 / (L>0) 대화 / otherAccount 면 계정 전환.
import { lazy, Suspense, useEffect } from 'react'
import { applyMerge, dismissMerge, useJustLoggedIn, useMe, useMergePlan, type MergeChoice } from '../../core/me'
import { useSyncState } from '../../core/sync'
import { href } from '../../router'
import { I } from '../../ui/icons'
import { Icon } from '../../ui/Icon'
import { hint, toast } from '../Toast'
import { Avatar } from '../../ui/Avatar'
import './nav-user.css'

const MergeDialog = lazy(() => import('./MergeDialog'))

export default function NavUser() {
  const me = useMe()
  const sync = useSyncState()
  const plan = useMergePlan()
  const justLoggedIn = useJustLoggedIn()
  const id = me?.user.id

  useEffect(() => { if (!id) hint('login', '로그인하면 저장돼요') }, [id])
  useEffect(() => { if (justLoggedIn && toastedFor !== id) { toastedFor = id; toast('로그인됨') } }, [justLoggedIn, id])
  const dialog = !!plan && (plan.local > 0 || !!plan.otherAccount)
  useEffect(() => {
    if (!plan || dialog) return
    if (plan.server > 0) toast(`계정의 트리 ${plan.server}개를 가져왔어요`)
    dismissMerge()
  }, [plan, dialog])

  if (!me) {
    return (
      <a className="nav-login" href={href.login(location.hash || '#/')} aria-label="로그인" data-tip="로그인">
        <Icon d={I.user} size={20} className="nav-login-icon" /><span className="nav-login-text">로그인</span>
      </a>
    )
  }
  const bad = sync.kind === 'offline' || sync.kind === 'error'
  const choose = (c: MergeChoice) =>
    applyMerge(c).then(() => toast(c === 'wipe_other' ? '새로 시작해요' : '저장됨'), () => toast('저장하지 못했어요 · 다시 시도해 주세요'))
  return (
    <>
      <a className={`nav-avatar${justLoggedIn ? ' rise' : ''}`} href={href.account()} aria-label="계정" data-tip="계정">
        <Avatar name={me.user.nickname} url={me.user.avatar_url} size={32} />
        <span className="nav-nick">{me.user.nickname}</span>
      </a>
      {bad && (
        <a className="nav-sync-dot" href={href.trees()} data-kind={sync.kind}
          aria-label={sync.kind === 'offline' ? `오프라인 · ${sync.pending}건 대기` : `동기화 오류 · ${sync.reason}`} data-tip="동기화 상태" />
      )}
      {dialog && (
        <Suspense fallback={null}>
          <MergeDialog plan={plan} onChoose={(c) => void choose(c)} onClose={dismissMerge} />
        </Suspense>
      )}
    </>
  )
}

let toastedFor: string | undefined // StrictMode 의 이중 effect 에도 토스트 1개
