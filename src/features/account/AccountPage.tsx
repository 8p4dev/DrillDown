// 계정 화면 #/account — 03 §3.3 요소 표, 02 §3.1 계정 와이어(560px 중앙 1열), 01 §3.5 계정 행·§3.6 #22.
// 닉네임·사진 토글 PATCH /api/me, 기기 /api/me/sessions, 휴지통 = 로컬 db.trees.deletedAt + 서버 POST /api/trees/:id/restore, 내보내기 = 로컬(events·trees·nodes·srs) + /api/me/export, 탈퇴 POST /api/me/delete.
// 비로그인은 휴지통·내보내기만 보인다(P0 #4·#5).
// 아바타 파일 업로드는 없다(서버는 이미지 저장 안 함, 03 §3.3).
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../core/api'
import { importBackup, parseBackup } from '../../core/backup'
import { db } from '../../core/db'
import { exportEvents } from '../../core/events'
import { deleteAccount, exportServer, loadSessions, login, logout, patchMe, revokeOtherSessions, revokeSession, useMe, useMeReady, useSessions } from '../../core/me'
import { deleteTree, listTrees, restoreTree, TRASH_MS } from '../../core/repo'
import { retrySync } from '../../core/sync'
import type { Tree } from '../../core/types'
import { href } from '../../router'
import { I } from '../../ui/icons'
import { logOut, shield, undo2 } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { toast } from '../Toast'
import { Avatar } from '../../ui/Avatar'
import { TwoStep } from '../../ui/TwoStep'
import { PROVIDER_LABEL, ProviderLogo } from './providers'
import './account.css'

const rel = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`
}
const daysLeft = (deletedAt: number) => Math.max(1, Math.ceil((deletedAt + TRASH_MS - Date.now()) / 86_400_000))
const upload = '<path d="M12 3v12" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" />'
const okNick = (s: string) => s.length >= 1 && s.length <= 20 && !/[\p{Cc}]/u.test(s)
const fail = (e: unknown) => toast(e instanceof ApiError && e.status === 0 ? '오프라인이에요' : '실패했어요 · 다시 시도해 주세요')

export default function AccountPage() {
  const me = useMe()
  const ready = useMeReady()
  const sessions = useSessions()
  const [editing, setEditing] = useState(false)
  const [nickErr, setNickErr] = useState('')
  const [relogin, setRelogin] = useState(false)
  const [wipeLocal, setWipeLocal] = useState(false)
  const [treeCount, setTreeCount] = useState(0)
  const [trash, setTrash] = useState<Tree[]>([])
  const done = useRef(false)
  const file = useRef<HTMLInputElement>(null)

  const loggedIn = !!me
  useEffect(() => { if (loggedIn) loadSessions().catch(() => { /* 목록 비움 */ }) }, [loggedIn])
  const reload = () => {
    void listTrees().then((ts) => setTreeCount(ts.length))
    void db.trees.toArray().then((ts) => setTrash(ts.filter((t) => t.deletedAt)))
  }
  useEffect(() => {
    reload()
    addEventListener('dd:remote', reload) // 다른 기기 삭제가 pull 로 오면 휴지통 갱신(U03)
    return () => removeEventListener('dd:remote', reload)
  }, [])
  // 휴지통·내보내기는 비로그인도 쓴다(로컬 데이터). 서버 호출은 로그인일 때만
  const restore = async (t: Tree) => {
    // 서버 7일 휴지통 먼저 — 410 = 서버가 이미 영구 삭제(노드 없음) → 빈 트리로 되살리지 않고 로컬도 지운다. 동기화 안 된 로컬 트리는 404 라 무시
    const gone = me && (await api(`/api/trees/${t.id}/restore`, { method: 'POST', body: {} }).then(() => false, (e) => e instanceof ApiError && e.status === 410))
    if (gone) {
      await deleteTree(t.id)
      toast('복구 기간(7일)이 지나 복구할 수 없습니다')
      return reload()
    }
    await restoreTree(t.id)
    retrySync()
    reload()
  }
  const exportData = async () => {
    const [local, server, all, nodes, srs] = await Promise.all([
      exportEvents(), me ? exportServer().catch(() => null) : null, db.trees.toArray(), db.nodes.toArray(), db.srs.toArray(),
    ])
    const trees = all.filter((t) => !t.deletedAt)
    const live = new Set(trees.map((t) => t.id))
    const json = JSON.stringify({
      exported_at: Date.now(), events: JSON.parse(local) as unknown, account: server,
      trees, nodes: nodes.filter((n) => live.has(n.treeId)), srs: srs.filter((r) => live.has(r.treeId)),
    }, null, 2)
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: 'drilldown-export.json' })
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const trashSection = (
    <section aria-labelledby="trash">
      <h2 id="trash">휴지통 (7일)</h2>
      {trash.length === 0 ? <span className="empty-line">비어 있음</span> : (
        <ul>
          {trash.map((t) => (
            <li key={t.id}>
              <span className="grow">{t.title}<br /><span className="muted">{rel(t.deletedAt!)} 삭제 · {daysLeft(t.deletedAt!)}일 뒤 영구 삭제</span></span>
              <button type="button" className="icon-btn" aria-label={`${t.title} 복구`} onClick={() => void restore(t)}><Icon d={undo2} /> 복구</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
  const importData = async (f: File | undefined) => {
    if (!f) return
    try {
      const r = await importBackup(parseBackup(await f.text(), (await listTrees()).length))
      toast(`트리 ${r.trees}개를 가져왔어요${r.copied ? ` · ${r.copied}개는 이미 있어 사본으로` : ''}`)
    } catch (e) {
      // parseBackup 문구는 그대로, Dexie 오류(ConstraintError 등)는 일반 문구
      toast(e instanceof Error && e.name === 'Error' ? e.message : '가져오지 못했어요 · 파일을 확인해 주세요')
    }
    reload()
  }
  const importBtn = (
    <>
      <button type="button" className="icon-btn" onClick={() => file.current?.click()}><Icon d={upload} /> 백업 가져오기</button>
      <input ref={file} type="file" accept="application/json,.json" hidden aria-label="백업 파일" onChange={(e) => { void importData(e.target.files?.[0]); e.target.value = '' }} />
    </>
  )
  const exportBtn = <button type="button" className="icon-btn" onClick={() => void exportData()}><Icon d={I.download} /> 데이터 내보내기</button>
  if (!ready) return null
  if (!me) {
    return (
      <section className="account">
        <h1>휴지통·내보내기</h1>
        <span className="stat">이 기기에만 저장돼 있어요 · <a href={href.login(href.account())}>로그인</a>하면 계정에 저장됩니다</span>
        {trashSection}
        <div className="actions">{exportBtn}{importBtn}</div>
      </section>
    )
  }
  const u = me.user
  const providerPic = u.use_provider_avatar ?? !!u.avatar_url

  const saveNick = (v: string) => {
    const next = v.trim()
    setEditing(false)
    if (next === u.nickname) { setNickErr(''); return }
    if (!okNick(next)) { setNickErr('닉네임은 1~20자'); return }
    patchMe({ nickname: next }).then(() => setNickErr(''), (e: unknown) => {
      if (e instanceof ApiError && e.code === 'invalid') setNickErr(e.message)
      else fail(e)
    })
  }
  const togglePic = (on: boolean) =>
    patchMe({ use_provider_avatar: on }).then((r) => setRelogin(on && !!r.relogin_required), fail)
  const signOut = () => logout().then(() => { location.hash = href.trees() }, fail)
  const quit = async () => {
    try { await deleteAccount() } catch (e) { fail(e); return }
    // 하드 삭제(outbox 없이) — 7일 안에 재로그인해도 서버 트리는 남는다
    if (wipeLocal) for (const t of await db.trees.toArray()) await deleteTree(t.id)
    toast(wipeLocal ? '탈퇴 요청됨 · 이 기기 트리도 지웠어요' : '탈퇴 요청됨 · 7일 안에 로그인하면 취소')
    location.hash = href.trees()
  }

  return (
    <section className="account">
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
          {nickErr && <span className="stat nick-err" role="alert">{nickErr}</span>}
          <span className="connected"><ProviderLogo provider={u.provider} size={16} /> {PROVIDER_LABEL[u.provider]} 연결됨</span>
          <span className="stat">트리 {treeCount}개</span>
        </div>
      </div>
      {u.provider !== 'fake' && (
        <div className="row">
          <label className="toggle">
            <input type="checkbox" checked={providerPic} onChange={(e) => void togglePic(e.target.checked)} />
            {PROVIDER_LABEL[u.provider]} 프로필 사진 사용
          </label>
          {relogin && (
            <span className="stat">다시 로그인하면 사진이 적용됩니다{' '}
              <button type="button" className="link" onClick={() => login(u.provider, href.account())}>다시 로그인</button>
            </span>
          )}
        </div>
      )}

      <section aria-labelledby="devices">
        <h2 id="devices">로그인된 기기</h2>
        <ul>
          {sessions.map((s) => (
            <li key={s.id6}>
              <span className="grow">{s.ua} {s.current && <span className="badge">현재</span>}<br /><span className="muted">{rel(s.last_seen_at)}</span></span>
              {!s.current && <button type="button" className="ghost" aria-label={`${s.ua} 로그아웃`} data-tip="로그아웃" onClick={() => void revokeSession(s.id6).catch(fail)}><Icon d={logOut} /></button>}
            </li>
          ))}
        </ul>
        {sessions.length > 1 && (
          <button type="button" className="icon-btn" style={{ alignSelf: 'flex-start' }}
            onClick={() => void revokeOtherSessions().then((n) => toast(`${n}개 기기 로그아웃`), fail)}>
            <Icon d={logOut} /> 다른 기기 모두 로그아웃
          </button>
        )}
      </section>

      {trashSection}

      <div className="actions">
        {exportBtn}
        {importBtn}
        <button type="button" className="icon-btn" onClick={() => void signOut()}><Icon d={logOut} /> 로그아웃</button>
        {u.role === 'admin' && <a className="icon-btn" href={href.admin()}><Icon d={shield} /> 관리자</a>}
      </div>

      <section className="danger-zone">
        <label className="toggle"><input type="checkbox" checked={wipeLocal} onChange={(e) => setWipeLocal(e.target.checked)} /> 이 기기의 트리도 지우기</label>
        <span className="stat">7일 안에 다시 로그인하면 취소됩니다</span>
        <TwoStep label="탈퇴" confirmLabel="정말 탈퇴" onConfirm={() => void quit()} />
      </section>
      <a className="stat" href={href.privacy()}>개인정보 처리방침</a>
    </section>
  )
}
