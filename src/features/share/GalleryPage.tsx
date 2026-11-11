// 공개 트리 #/gallery — 04 §3.5: 정렬 2개(최신·복제 수)·제목 검색(U58), 20건, 카드 7요소(제목·유저·별점·노드·복제·날짜·미리보기) → /t/<slug>
import { useEffect, useState } from 'react'
import { api, ApiError, type GalleryItem, type SharedTree } from '../../core/api'
import { nodesToOutline, serializeOutline, type OutlineItem } from '../../core/outline'
import { href } from '../../router'
import { Avatar } from '../../ui/Avatar'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { externalLink, star } from '../../ui/icons.all'
import { Sheet } from '../../ui/Sheet'
import './share.css'

type Sort = 'recent' | 'copies'
const DATE = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' })
const PREVIEW_LINES = 60 // A6: 제목 개요 앞 60줄, 내용 제외

/** 별점 한 조각: ★ 평균(수), 없으면 '평가 없음' */
function Stars({ avg, count }: { avg: number | null; count: number }) {
  return (
    <span className="gallery-rating"><Icon d={star} />{avg === null ? <span className="muted">평가 없음</span> : <><span className="tnum">{avg.toFixed(1)}</span><span className="muted tnum">({count})</span></>}</span>
  )
}

/** A6: 한 줄 내용(`제목 :: 내용`)도 뺀다 — 미리보기는 제목 개요만 */
const titlesOnly = (xs: OutlineItem[]): OutlineItem[] => xs.map((x) => ({ text: x.text, children: titlesOnly(x.children) }))
/** 미리보기 본문: GET /api/t/<slug> 1회 → 제목 개요 텍스트 앞 60줄 */
function previewText(t: SharedTree) {
  const root = t.nodes.find((n) => n.parentId === null)
  const lines = root ? serializeOutline(titlesOnly(nodesToOutline(t.nodes, root.id, false))).split('\n').filter((l) => l.trim()) : []
  if (lines.length <= PREVIEW_LINES) return lines.join('\n') || '(비어 있음)'
  return [...lines.slice(0, PREVIEW_LINES), `… 외 ${lines.length - PREVIEW_LINES}줄`].join('\n')
}

export default function GalleryPage() {
  const [sort, setSort] = useState<Sort>('recent')
  const [items, setItems] = useState<GalleryItem[] | null>(null)
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  // 같은 쪽 다시 시도: 실패해도 page 는 그대로 두고 이 값만 올린다('더 보기' 실패 쪽 건너뜀 방지)
  const [retry, setRetry] = useState(0)
  // 응답이 온 요청 키. 현재 키와 다르면 요청 중 → '더 보기' 비활성(U61 연타 방지)
  const key = `${sort}:${q}:${page}:${retry}`
  const [done, setDone] = useState('')
  // 미리보기 시트: 열린 카드 + 개요 텍스트(null = 로딩) 또는 실패 문구
  const [preview, setPreview] = useState<{ item: GalleryItem; text: string | null; fail?: string } | null>(null)
  // GET /api/gallery?sort=&page=&q= → { items, page, hasMore } 20건 (04 §3.6). 정렬·검색이 바뀌면 1쪽부터
  useEffect(() => {
    const ac = new AbortController()
    api<{ items: GalleryItem[]; hasMore: boolean }>(`/api/gallery?sort=${sort}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, { signal: ac.signal }).then(
      (r) => {
        // OFFSET 페이지 사이에 새 공개가 끼면 같은 카드가 다시 온다 → slug 로 거른다(U61)
        setItems((prev) => (page === 1 ? r.items : [...(prev ?? []), ...r.items.filter((it) => !prev?.some((p) => p.slug === it.slug))]))
        setMore(r.hasMore)
        setDone(key)
      },
      () => { if (!ac.signal.aborted) { setFailed(true); setDone(key) } },
    )
    return () => ac.abort()
  }, [sort, page, q, retry, key])
  const pick = (s: Sort) => {
    if (s === sort) return
    setFailed(false)
    setItems(null)
    setPage(1)
    setSort(s)
  }
  // 타이핑마다 요청하지 않게 300ms 뒤 확정(공개 트리 목록 리밋 30/분)
  useEffect(() => {
    const v = input.trim()
    if (v === q) return
    const id = setTimeout(() => {
      setFailed(false)
      setItems(null)
      setPage(1)
      setQ(v)
    }, 300)
    return () => clearTimeout(id)
  }, [input, q])
  const openPreview = (item: GalleryItem) => {
    setPreview({ item, text: null })
    api<SharedTree>(`/api/t/${item.slug}`).then(
      (t) => setPreview((p) => (p?.item.slug === item.slug ? { item, text: previewText(t) } : p)),
      (e) => setPreview((p) => (p?.item.slug === item.slug ? { item, text: null, fail: e instanceof ApiError && e.status !== 0 ? '미리보기를 불러오지 못했습니다' : '네트워크에 연결할 수 없습니다' } : p)),
    )
  }
  return (
    <section className="gallery">
      <header className="gallery-head">
        <h1>공개 트리</h1>
        <div className="seg" role="group" aria-label="정렬">
          <button type="button" aria-pressed={sort === 'recent'} onClick={() => pick('recent')}>최신</button>
          <button type="button" aria-pressed={sort === 'copies'} onClick={() => pick('copies')}>복제 수</button>
        </div>
        <input type="search" className="gallery-search" aria-label="제목 검색" placeholder="제목 검색" maxLength={50} value={input} onChange={(e) => setInput(e.target.value)} />
      </header>
      {failed && !items?.length ? (
        <div className="empty">
          <p className="muted">공개 트리를 불러오지 못했습니다</p>
          <button type="button" onClick={() => { setFailed(false); setItems(null); setRetry((n) => n + 1) }}>다시 시도</button>
        </div>
      ) : !items ? (
        <div className="route-loading" aria-busy="true" />
      ) : items.length === 0 ? (
        <p className="empty muted">{q ? '검색 결과가 없습니다' : '아직 공개된 트리가 없습니다'}</p>
      ) : (
        <ul className="gallery-cards">
          {items.map((it) => (
            <li key={it.slug} className="card">
              <a className="gallery-title" href={href.shared(it.slug)}>{it.title}</a>
              <span className="gallery-user"><Avatar name={it.ownerNickname} size={24} className="gallery-avatar" /><span>{it.ownerNickname}</span></span>
              <span className="gallery-meta">
                <Stars avg={it.ratingAvg} count={it.ratingCount} />
                <span>노드 {it.nodeCount}</span>
                <span>복제 {it.copyCount}</span>
                <time dateTime={new Date(it.updatedAt).toISOString()}>{DATE.format(it.updatedAt)}</time>
              </span>
              <span className="gallery-foot">
                <Icon d={I.globe} label="공개" className="muted" />
                <button type="button" className="gallery-preview" aria-label="미리보기" onClick={() => openPreview(it)}>미리보기</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {more && items && (
        <div className="actions">
          {failed && done === key && <span className="muted" role="status">불러오지 못했습니다</span>}
          <button type="button" disabled={done !== key} onClick={() => (failed ? setRetry((n) => n + 1) : setPage((p) => p + 1), setFailed(false))}>{failed ? '더 보기 다시 시도' : '더 보기'}</button>
        </div>
      )}

      <Sheet open={!!preview} onClose={() => setPreview(null)} label="미리보기">
        {preview && (
          <div className="share-sheet gallery-sheet">
            <header className="sheet-head">
              <h2>{preview.item.title}</h2>
              <button type="button" className="ghost sheet-x" aria-label="닫기" data-tip="닫기" onClick={() => setPreview(null)}><Icon d={I.x} /></button>
            </header>
            <p className="gallery-sheet-meta">
              <span className="gallery-user"><Avatar name={preview.item.ownerNickname} size={24} className="gallery-avatar" /><span>{preview.item.ownerNickname}</span></span>
              <Stars avg={preview.item.ratingAvg} count={preview.item.ratingCount} />
            </p>
            {preview.fail ? (
              <p className="muted" role="alert">{preview.fail}</p>
            ) : preview.text === null ? (
              <div className="route-loading" aria-busy="true" />
            ) : (
              <pre className="gallery-outline" aria-label="개요">{preview.text}</pre>
            )}
            <div className="actions">
              <a href={href.shared(preview.item.slug)}><Icon d={externalLink} />공유 보기 열기</a>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  )
}
