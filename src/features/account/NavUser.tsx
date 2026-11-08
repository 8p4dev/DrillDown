// 상단 바 오른쪽 계정 슬롯 — 02 §3.1 상단 바: 비로그인 ≤760 사람 아이콘(aria '로그인') / ≥761 '로그인' 텍스트 버튼(둘 다 그려 두고 CSS 로 교대),
// 로그인 시 아바타 32px(+ 닉네임 ≥761) → #/account. 아바타 모서리 동기화 점(오프라인·오류일 때만, 탭=목록). 로그인 직후 rise + "로그인됨"(01 §3.6 #18).
// 로그인 직후 로컬 트리 병합 대화(MergeDialog)를 세션당 1회 띄운다(03 §3.3) — 로그인 화면은 이동하며 언마운트되므로 여기서.
import { lazy, Suspense, useEffect, useState } from 'react'
import { getLastLoginAt, mockServerTreeCount, useMe } from '../../core/mock/me'
import { useSyncState } from '../../core/mock/sync'
import { listTrees } from '../../core/repo'
import { href } from '../../router'
import { I } from '../../ui/icons'
import { Icon } from '../../ui/Icon'
import { toast } from '../Toast'
import { Avatar } from '../../ui/Avatar'
import { hint } from '../Toast'
import './nav-user.css'

const MergeDialog = lazy(() => import('./MergeDialog'))

export default function NavUser() {
  const me = useMe()
  const sync = useSyncState()
  const [merge, setMerge] = useState<{ local: number; server: number } | null>(null)
  // 마운트 시점에 1회 판정(로그인 화면에서 돌아오며 다시 마운트된다)
  const [justLoggedIn] = useState(() => Date.now() - getLastLoginAt() < 2000)
  const id = me?.user.id

  useEffect(() => {
    if (!id) { hint('login', '로그인하면 저장돼요'); return }
    if (justLoggedIn && toastedAt !== getLastLoginAt()) { toastedAt = getLastLoginAt(); toast('로그인됨') }
    const k = `merge:${id}`
    try { if (sessionStorage.getItem(k)) return } catch { /* 매번 물어도 무해 */ }
    let on = true
    void listTrees().then((ts) => {
      if (!on) return
      const local = ts.length, server = mockServerTreeCount
      if (local === 0 && server === 0) return
      if (local === 0) { toast(`계정의 트리 ${server}개를 가져왔어요`); mark(k); return }
      setMerge({ local, server })
    })
    return () => { on = false }
  }, [id, justLoggedIn])

  if (!me) {
    return (
      <a className="nav-login" href={href.login(location.hash || '#/')} aria-label="로그인" data-tip="로그인">
        <Icon d={I.user} size={20} className="nav-login-icon" /><span className="nav-login-text">로그인</span>
      </a>
    )
  }
  const bad = sync.kind === 'offline' || sync.kind === 'error'
  return (
    <>
      <a className={`nav-avatar${justLoggedIn && me ? ' rise' : ''}`} href={href.account()} aria-label="계정" data-tip="계정">
        <Avatar name={me.user.nickname} url={me.user.avatar_url} size={32} />
        <span className="nav-nick">{me.user.nickname}</span>
      </a>
      {bad && (
        <a className="nav-sync-dot" href={href.trees()} data-kind={sync.kind}
          aria-label={sync.kind === 'offline' ? `오프라인 · ${sync.pending}건 대기` : `동기화 오류 · ${sync.reason}`} data-tip="동기화 상태" />
      )}
      {merge && (
        <Suspense fallback={null}>
          <MergeDialog local={merge.local} server={merge.server}
            onDone={() => { toast('저장됨'); mark(`merge:${id}`); setMerge(null) }} onClose={() => setMerge(null)} />
        </Suspense>
      )}
    </>
  )
}

let toastedAt = 0 // StrictMode 의 이중 effect 에도 토스트 1개
const mark = (k: string) => { try { sessionStorage.setItem(k, '1') } catch { /* 무시 */ } }
