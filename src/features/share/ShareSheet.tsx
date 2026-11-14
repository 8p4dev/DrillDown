// 공개 범위 시트 — 04 §3.10 "공개 범위 컨트롤": 세그먼트 3(비공개/링크/공개), 링크 줄(복사·열기·재발급), 공개 안내, 첫 공개 고지 1회.
// 호출: TreeListPage(LM) ⋯ 메뉴 "공유…" → <ShareSheet tree={t} onClose={...} onChange={reload} />. 비로그인은 로그인 안내 1줄.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { api, ApiError } from '../../core/api'
import { refreshMe, useMe } from '../../core/me'
import { getTreeNodes, reissueSlug, setVisibility } from '../../core/repo'
import type { Tree, Visibility } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { toast } from '../Toast'
import { Sheet } from '../../ui/Sheet'
import './share-list.css'

const ACK = 'publicNoticeAck'
// 저장소가 막힌 브라우저(사생활 모드 일부·기업 정책)에서도 "공개" 가 터지지 않게
const acked = () => { try { return !!localStorage.getItem(ACK) } catch { return false } }
const setAcked = () => { try { localStorage.setItem(ACK, '1') } catch { /* 저장 없이 진행 */ } }
const NOTICE = '공개하면 누구나 열람·복제할 수 있습니다. 타인의 교재·강의 목차를 그대로 올리면 신고로 숨김 처리될 수 있습니다.'
const SEGS: { v: Visibility; label: string; icon: string }[] = [
  { v: 'private', label: '비공개', icon: I.lock },
  { v: 'unlisted', label: '링크', icon: I.link },
  { v: 'public', label: '공개', icon: I.globe },
]

/** 운영 숨김 사유(관리자 메모) + 소명 폼 — 03 §3.4 통지, 약관 4·6. 사유·소명 상태는 /api/me 의 hidden_trees */
function HiddenNotice({ treeId }: { treeId: string }) {
  const me = useMe()
  const h = me?.hidden_trees.find((t) => t.id === treeId)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = () => {
    setBusy(true)
    api(`/api/trees/${treeId}/appeal`, { method: 'POST', body: { text: text.trim() } })
      .then(() => { toast('소명을 보냈어요 · 검토 뒤 이 자리에 결과가 보입니다'); setText(''); return refreshMe() }, (e) => toast(e instanceof ApiError ? e.message : '보내지 못했어요'))
      .finally(() => setBusy(false))
  }
  return (
    <div className="share-notice" role="note">
      <p>운영 정책으로 숨김 — 링크가 열리지 않습니다{h?.reason && <><br />사유: {h.reason}</>}</p>
      {h?.appealed_at ? <p className="muted">소명 보냄 · 검토 중</p> : (
        <>
          <textarea aria-label="소명" placeholder="소명 (500자, 연락처·개인정보는 적지 마세요)" maxLength={500} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="primary" disabled={busy || !text.trim()} onClick={send}>소명 보내기</button>
        </>
      )}
      <p className="muted">절차는 <a href={href.terms()}>이용약관</a> 4·6항</p>
    </div>
  )
}

const subOnline = (f: () => void) => {
  addEventListener('online', f)
  addEventListener('offline', f)
  return () => {
    removeEventListener('online', f)
    removeEventListener('offline', f)
  }
}
const useOnline = () => useSyncExternalStore(subOnline, () => navigator.onLine)

export default function ShareSheet({ tree: initial, onClose, onChange }: { tree: Tree; onClose: () => void; onChange?: () => void }) {
  const me = useMe()
  const online = useOnline()
  const [tree, setTree] = useState(initial)
  const [count, setCount] = useState<number | null>(null)
  const [notice, setNotice] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => void getTreeNodes(tree.id).then((ns) => setCount(ns.length)), [tree.id])

  const v: Visibility = tree.visibility ?? 'private'
  const canPublic = count === null || (count >= 3 && tree.title.trim().length > 0)
  const url = tree.slug ? location.origin + href.shared(tree.slug) : ''

  // 서버 API 호출(04 §3.3). 오류는 시트 안 한 줄
  const run = async (f: () => Promise<Tree>) => {
    setErr('')
    try {
      setTree(await f())
      onChange?.()
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      setErr(code === 'offline' ? '오프라인' : code === 'not_publishable' ? '공개하려면 제목과 노드 3개 이상이 필요합니다' : code === 'hidden_by_admin' ? '운영 정책으로 숨김 상태라 공개할 수 없습니다' : e instanceof Error ? e.message : '변경하지 못했습니다')
    }
  }
  const apply = (next: Visibility) => run(() => setVisibility(tree.id, next))
  const change = (next: Visibility) => {
    if (next === v) return
    if (next === 'public' && !acked()) return setNotice(true)
    void apply(next)
  }
  const ack = () => {
    setAcked()
    setNotice(false)
    void apply('public')
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      toast('복사하지 못했습니다') // 권한 거부·비보안 컨텍스트 — 링크는 위에 보이니 길게 눌러 복사할 수 있다
      return
    }
    setCopied(true)
    toast('링크 복사됨')
    setTimeout(() => setCopied(false), 1500)
  }
  const reissue = () => run(() => reissueSlug(tree.id))
  const hidden = !!(tree as Tree & { hiddenByAdmin?: boolean }).hiddenByAdmin // pull 로 받은 서버 값

  return (
    <Sheet open onClose={onClose} label="공유">
      <div className="share-sheet">
        <header className="sheet-head">
          <h2>공유</h2>
          <button type="button" className="ghost sheet-x" aria-label="닫기" data-tip="닫기" onClick={onClose}><Icon d={I.x} /></button>
        </header>
        {!me ? (
          <p className="muted">로그인하면 링크로 공유할 수 있습니다 <a href={href.login(location.hash)}>로그인</a></p>
        ) : (
          <>
            <div className="seg" role="group" aria-label="공개 범위">
              {SEGS.map((s) => (
                <button key={s.v} type="button" aria-pressed={v === s.v} disabled={!online || (s.v === 'public' && !canPublic)} onClick={() => change(s.v)}>
                  <Icon d={s.icon} />{s.label}
                </button>
              ))}
            </div>
            {hidden && <HiddenNotice treeId={tree.id} />}
            {!online && <p className="muted">오프라인</p>}
            {online && err && <p className="muted" role="alert">{err}</p>}
            {online && !canPublic && <p className="muted">공개하려면 제목과 노드 3개 이상이 필요합니다</p>}
            {notice && (
              <div className="share-notice" role="note">
                <p>{NOTICE}</p>
                <button type="button" className="primary" onClick={ack}>확인</button>
              </div>
            )}
            {v !== 'private' && tree.slug && (
              <div className="share-link">
                <code className="share-url">{url}</code>
                <div className="actions">
                  <button type="button" onClick={copy}>
                    <span key={copied ? 'c' : 'l'} className="xfade"><Icon d={copied ? I.check : I.link} /></span>복사
                  </button>
                  <button type="button" onClick={() => open(url, '_blank', 'noopener')}>열기</button>
                  <button type="button" onClick={reissue}>재발급</button>
                </div>
              </div>
            )}
            {v === 'public' && <p className="muted">공개 트리 목록에 표시됩니다 · 노드 {count ?? '…'}개</p>}
          </>
        )}
      </div>
    </Sheet>
  )
}
