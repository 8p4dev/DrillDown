// 공지(복수·기간·링크)·점검 예고·점검 중 배너 — settings.notices(T2 #29). 로그인은 useMe().legal, 비로그인은 GET /api/notices(audience='all' 만).
// 공지 닫기는 공지 id 별로 세션 동안만(sessionStorage). App.tsx 가 상단 바 아래에 렌더한다.
import { useEffect, useState } from 'react'
import { api, type LegalMe } from '../../core/api'
import { when } from '../../core/fmt'
import { useMaintenance, useMe, useMeReady } from '../../core/me'
import { I } from '../../ui/icons'
import { Icon } from '../../ui/Icon'
import './nav-user.css'

const K = 'notice:dismissed'
const read = (): string[] => { try { return JSON.parse(sessionStorage.getItem(K) ?? '[]') as string[] } catch { return [] } }

export default function Banners() {
  const me = useMe()
  const ready = useMeReady()
  const maintenance = useMaintenance()
  const [anon, setAnon] = useState<LegalMe | null>(null)
  const [gone, setGone] = useState(read)
  useEffect(() => { if (ready && !me) api<LegalMe>('/api/notices').then(setAnon, () => { /* 공지 못 받으면 조용히 */ }) }, [ready, me])
  const legal = me ? me.legal : anon
  const sched = legal?.maintenance_scheduled
  const items = [
    ...(legal?.notices ?? []).map((n) => ({ id: n.id, text: n.text, url: n.url })),
    ...(sched ? [{ id: `maint-${sched.from}`, text: `점검 예정 ${when(sched.from)}${sched.until ? ` ~ ${when(sched.until)}` : ''} · 그동안 저장·동기화가 멈춥니다`, url: undefined }] : []),
  ].filter((n) => !gone.includes(n.id))
  const dismiss = (id: string) => { const next = [...gone, id]; try { sessionStorage.setItem(K, JSON.stringify(next)) } catch { /* 무시 */ } setGone(next) }
  return (
    <>
      {maintenance && (
        <div className="banner" data-kind="maintenance" role="status"><Icon d={I.circleAlert} /><span className="banner-text">점검 중 — {me ? '동기화 일시 중단' : '잠시 후 다시 열어 주세요'}</span></div>
      )}
      {items.map((n) => (
        <div key={n.id} className="banner" data-kind="notice" role="status">
          <Icon d={I.megaphone} />
          <span className="banner-text">{n.text}{n.url && <> · <a href={n.url} target="_blank" rel="noreferrer">자세히</a></>}</span>
          <button type="button" className="ghost" aria-label="공지 닫기" data-tip="닫기" onClick={() => dismiss(n.id)}><Icon d={I.x} /></button>
        </div>
      ))}
    </>
  )
}
