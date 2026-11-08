// 계정 화면 #/account — 03 §3.3 요소 표, 02 §3.1 계정 와이어(560px 중앙 1열), 01 §3.5 계정 행·§3.6 #22.
// mock: 닉네임·아바타는 mockPatchMe, 기기 목록은 me.ts 세션 스토어, 휴지통은 db.trees 의 deletedAt(읽기)·restoreTree(repo), 탈퇴는 mockLogout.
import { useEffect, useRef, useState } from 'react'
import { db } from '../../core/db'
import { exportEvents } from '../../core/events'
import { mockLogout, mockPatchMe, revokeOtherSessions, revokeSession, useMe, useSessions } from '../../core/mock/me'
import { listTrees, restoreTree } from '../../core/repo'
import type { Tree } from '../../core/types'
import { href } from '../../router'
import { I } from '../../ui/icons'
import { image, logOut, undo2 } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { toast } from '../Toast'
import Banners from './Banners'
import { Avatar } from '../../ui/Avatar'
import { TwoStep } from '../../ui/TwoStep'
import { PROVIDER_LABEL, ProviderLogo } from './providers'
import './account.css'

const rel = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`
}
const okNick = (s: string) => s.length >= 1 && s.length <= 20 && !/[\p{Cc}]/u.test(s)

export default function AccountPage() {
  const me = useMe()
  const sessions = useSessions()
  const [editing, setEditing] = useState(false)
  const [useProviderPic, setUseProviderPic] = useState(false)
  const [wipeLocal, setWipeLocal] = useState(false)
  const [treeCount, setTreeCount] = useState(0)
  const [trash, setTrash] = useState<Tree[]>([])
  const [syncedAt] = useState(() => Date.now() - 3 * 60000) // mock 마지막 동기화 시각
  const done = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!me) location.hash = href.login(href.account()) }, [me])
  const reload = () => {
    void listTrees().then((ts) => setTreeCount(ts.length))
    void db.trees.toArray().then((ts) => setTrash(ts.filter((t) => t.deletedAt)))
  }
  useEffect(reload, [])
  if (!me) return null
  const u = me.user

  const saveNick = (v: string) => {
    const next = v.trim()
    setEditing(false)
    if (next === u.nickname) return
    if (!okNick(next)) { toast('닉네임은 1~20자'); return }
    mockPatchMe({ nickname: next })
  }
  const pickAvatar = (f: File | undefined) => {
    if (!f) return
    mockPatchMe({ avatar_url: URL.createObjectURL(f) })
    toast('이 기기에서만 보여요 (서버 저장 없음)')
  }
  const exportData = async () => {
    const blob = new Blob([await exportEvents()], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'drilldown-events.json' })
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const logout = () => { mockLogout(); location.hash = href.trees() }
  const quit = () => {
    mockLogout()
    toast(wipeLocal ? '탈퇴 요청됨 · 데모라 이 기기 트리는 유지' : '탈퇴 요청됨 · 7일 안에 로그인하면 취소')
    location.hash = href.trees()
  }

  return (
    <section className="account">
      <Banners />
      <h1>계정</h1>

      <div className="row profile">
        <Avatar name={u.nickname} url={u.avatar_url} size={72} />
        <div className="profile-main">
          {editing ? (
            <input className="nick-edit" aria-label="닉네임" defaultValue={u.nickname} autoFocus maxLength={20}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { done.current = true; saveNick(e.currentTarget.value) }
                if (e.key === 'Escape') { done.current = true; setEditing(false) }
              }}
              onBlur={(e) => { if (!done.current) saveNick(e.target.value); done.current = false }} />
          ) : (
            <span className="nick">
              {u.nickname}
              <button type="button" className="ghost" aria-label="닉네임 변경" data-tip="닉네임 변경" onClick={() => setEditing(true)}><Icon d={I.pencil} /></button>
            </span>
          )}
          <span className="connected"><ProviderLogo provider={u.provider} size={16} /> {PROVIDER_LABEL[u.provider]} 연결됨</span>
          <span className="stat">트리 {treeCount}개 · 마지막 동기화 {rel(syncedAt)}</span>
        </div>
      </div>
      <div className="row">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickAvatar(e.target.files?.[0])} />
        <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()}><Icon d={image} /> 변경</button>
        <label className="toggle">
          <input type="checkbox" checked={useProviderPic}
            onChange={(e) => { setUseProviderPic(e.target.checked); if (e.target.checked) toast('다시 로그인하면 사진이 적용됩니다'); else mockPatchMe({ avatar_url: null }) }} />
          {PROVIDER_LABEL[u.provider]} 프로필 사진 사용
        </label>
      </div>

      <section aria-labelledby="devices">
        <h2 id="devices">로그인된 기기</h2>
        <ul>
          {sessions.map((s) => (
            <li key={s.id6}>
              <span className="grow">{s.ua} {s.current && <span className="badge">현재</span>}<br /><span className="muted">{rel(s.last_seen_at)}</span></span>
              {!s.current && <button type="button" className="ghost" aria-label={`${s.ua} 로그아웃`} data-tip="로그아웃" onClick={() => revokeSession(s.id6)}><Icon d={logOut} /></button>}
            </li>
          ))}
        </ul>
        {sessions.length > 1 && (
          <button type="button" className="icon-btn" style={{ alignSelf: 'flex-start' }} onClick={() => toast(`${revokeOtherSessions()}개 기기 로그아웃`)}>
            <Icon d={logOut} /> 다른 기기 모두 로그아웃
          </button>
        )}
      </section>

      <section aria-labelledby="trash">
        <h2 id="trash">휴지통 (7일)</h2>
        {trash.length === 0 ? <span className="empty-line">비어 있음</span> : (
          <ul>
            {trash.map((t) => (
              <li key={t.id}>
                <span className="grow">{t.title}<br /><span className="muted">{rel(t.deletedAt!)} 삭제</span></span>
                <button type="button" className="icon-btn" onClick={() => restoreTree(t.id).then(reload)}><Icon d={undo2} /> 복구</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="actions">
        <button type="button" className="icon-btn" onClick={() => void exportData()}><Icon d={I.download} /> 데이터 내보내기</button>
        <button type="button" className="icon-btn" onClick={logout}><Icon d={logOut} /> 로그아웃</button>
      </div>

      <section className="danger-zone">
        <label className="toggle"><input type="checkbox" checked={wipeLocal} onChange={(e) => setWipeLocal(e.target.checked)} /> 이 기기의 트리도 지우기</label>
        <span className="stat">7일 안에 다시 로그인하면 취소됩니다</span>
        <TwoStep label="탈퇴" confirmLabel="정말 탈퇴" onConfirm={quit} />
      </section>
    </section>
  )
}
