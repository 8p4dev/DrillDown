// 공개 범위 시트 — 04 §3.10 "공개 범위 컨트롤": 세그먼트 3(비공개/링크/공개), 링크 줄(복사·열기·재발급), 공개 안내, 첫 공개 고지 1회.
// 호출: TreeListPage(LM) ⋯ 메뉴 "공유…" → <ShareSheet tree={t} onClose={...} onChange={reload} />. 비로그인은 로그인 안내 1줄.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useMe } from '../../core/me'
import { getTreeNodes, reissueSlug, setVisibility } from '../../core/repo'
import type { Tree, Visibility } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { toast } from '../Toast'
import { Sheet } from '../../ui/Sheet'
import './share.css'

const ACK = 'publicNoticeAck'
const NOTICE = '공개하면 누구나 열람·복제할 수 있습니다. 타인의 교재·강의 목차를 그대로 올리면 신고로 숨김 처리될 수 있습니다.'
const SEGS: { v: Visibility; label: string; icon: string }[] = [
  { v: 'private', label: '비공개', icon: I.lock },
  { v: 'unlisted', label: '링크', icon: I.link },
  { v: 'public', label: '공개', icon: I.globe },
]

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
  useEffect(() => void getTreeNodes(tree.id).then((ns) => setCount(ns.length)), [tree.id])

  const v: Visibility = tree.visibility ?? 'private'
  const canPublic = count === null || (count >= 3 && tree.title.trim().length > 0)
  const url = tree.slug ? location.origin + href.shared(tree.slug) : ''

  const apply = async (next: Visibility) => {
    setTree(await setVisibility(tree.id, next))
    onChange?.()
  }
  const change = (next: Visibility) => {
    if (next === v) return
    if (next === 'public' && !localStorage.getItem(ACK)) return setNotice(true)
    void apply(next)
  }
  const ack = () => {
    localStorage.setItem(ACK, '1')
    setNotice(false)
    void apply('public')
  }
  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast('링크 복사됨')
    setTimeout(() => setCopied(false), 1500)
  }
  const reissue = async () => {
    setTree(await reissueSlug(tree.id))
    onChange?.()
  }

  return (
    <Sheet open onClose={onClose} label="공유">
      <div className="share-sheet">
        <header className="sheet-head">
          <h2>공유</h2>
          <button type="button" className="link" onClick={onClose}>닫기</button>
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
            {!online && <p className="muted">오프라인</p>}
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
            {v === 'public' && <p className="muted">갤러리에 표시됩니다 · 노드 {count ?? '…'}개</p>}
          </>
        )}
      </div>
    </Sheet>
  )
}
