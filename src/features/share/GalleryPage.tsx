// 갤러리 #/gallery — 04 §3.5 최소형: 정렬 2개(최신·복제 수), 20건, 카드 → /t/<slug>
import { useEffect, useState } from 'react'
import { api, type GalleryItem } from '../../core/api'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import './share.css'

type Sort = 'recent' | 'copies'

export default function GalleryPage() {
  const [sort, setSort] = useState<Sort>('recent')
  const [items, setItems] = useState<GalleryItem[] | null>(null)
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [failed, setFailed] = useState(false)
  // GET /api/gallery?sort=&page= → { items, page, hasMore } 20건 (04 §3.6). 정렬이 바뀌면 1쪽부터
  useEffect(() => {
    const ac = new AbortController()
    api<{ items: GalleryItem[]; hasMore: boolean }>(`/api/gallery?sort=${sort}&page=${page}`, { signal: ac.signal }).then(
      (r) => {
        setItems((prev) => (page === 1 ? r.items : [...(prev ?? []), ...r.items]))
        setMore(r.hasMore)
      },
      () => !ac.signal.aborted && setFailed(true),
    )
    return () => ac.abort()
  }, [sort, page])
  const pick = (s: Sort) => {
    if (s === sort) return
    setFailed(false)
    setItems(null)
    setPage(1)
    setSort(s)
  }
  return (
    <section className="gallery">
      <header className="gallery-head">
        <h1>갤러리</h1>
        <div className="seg" role="group" aria-label="정렬">
          <button type="button" aria-pressed={sort === 'recent'} onClick={() => pick('recent')}>최신</button>
          <button type="button" aria-pressed={sort === 'copies'} onClick={() => pick('copies')}>복제 수</button>
        </div>
      </header>
      {failed && !items?.length ? (
        <p className="empty muted">갤러리를 불러오지 못했습니다</p>
      ) : !items ? (
        <div className="route-loading" aria-busy="true" />
      ) : items.length === 0 ? (
        <p className="empty muted">공개된 트리가 없습니다</p>
      ) : (
        <ul className="gallery-cards">
          {items.map((it) => (
            <li key={it.slug} className="card">
              <a href={href.shared(it.slug)}>
                <strong>{it.title}</strong>
                <span className="muted">{it.ownerNickname}</span>
                <span className="muted gallery-meta">노드 {it.nodeCount} · 복제 {it.copyCount}<Icon d={I.globe} label="공개" /></span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {more && items && (
        <div className="actions"><button type="button" onClick={() => (setFailed(false), setPage((p) => p + 1))}>더 보기</button></div>
      )}
    </section>
  )
}
