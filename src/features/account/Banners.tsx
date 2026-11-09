// 공지·점검 배너 — 03 §3.4 시스템 탭(공지 1줄 ≤80자·점검 모드) ↔ useMe().notice/maintenance. 공지 닫기는 세션 동안만(sessionStorage). App.tsx 가 상단 바 아래에 렌더한다.
import { useState } from 'react'
import { useMe } from '../../core/me'
import { I } from '../../ui/icons'
import { Icon } from '../../ui/Icon'
import './nav-user.css'

const K = 'notice:dismissed'
const dismissed = () => { try { return sessionStorage.getItem(K) } catch { return null } }

export default function Banners() {
  const me = useMe()
  const [hidden, setHidden] = useState(dismissed())
  if (!me) return null
  const notice = me.notice?.text && hidden !== me.notice.text ? me.notice.text : null
  return (
    <>
      {me.maintenance && (
        <div className="banner" data-kind="maintenance" role="status"><Icon d={I.circleAlert} /><span className="banner-text">점검 중 — 동기화 일시 중단</span></div>
      )}
      {notice && (
        <div className="banner" data-kind="notice" role="status">
          <Icon d={I.megaphone} /><span className="banner-text">{notice}</span>
          <button type="button" className="ghost" aria-label="공지 닫기" data-tip="닫기"
            onClick={() => { try { sessionStorage.setItem(K, notice) } catch { /* 무시 */ } setHidden(notice) }}><Icon d={I.x} /></button>
        </div>
      )}
    </>
  )
}
