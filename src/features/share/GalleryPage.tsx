// 갤러리 #/gallery — 04 §3.5 최소형: 정렬 2개(최신·복제 수)·제목 검색(U58), 20건, 카드 → /t/<slug>
import { useEffect, useState } from 'react'
import { api, type GalleryItem } from '../../core/api'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import './share.css'

type Sort = 'recent' | 'copies'
const DATE = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' })

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
  // 타이핑마다 요청하지 않게 300ms 뒤 확정(갤러리 리밋 30/분)
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
  return (
    <section className="gallery">
      <header className="gallery-head">
        <h1>갤러리</h1>
        <div className="seg" role="group" aria-label="정렬">
          <button type="button" aria-pressed={sort === 'recent'} onClick={() => pick('recent')}>최신</button>
          <button type="button" aria-pressed={sort === 'copies'} onClick={() => pick('copies')}>복제 수</button>
        </div>
        <input type="search" className="gallery-search" aria-label="제목 검색" placeholder="제목 검색" maxLength={50} value={input} onChange={(e) => setInput(e.target.value)} />
      </header>
      {failed && !items?.length ? (
        <p className="empty muted">갤러리를 불러오지 못했습니다</p>
      ) : !items ? (
        <div className="route-loading" aria-busy="true" />
      ) : items.length === 0 ? (
        <p className="empty muted">{q ? '검색 결과가 없습니다' : '공개된 트리가 없습니다'}</p>
      ) : (
        <ul className="gallery-cards">
          {items.map((it) => (
            <li key={it.slug} className="card">
              <a href={href.shared(it.slug)}>
                <strong>{it.title}</strong>
                <span className="muted">{it.ownerNickname}</span>
                <span className="muted gallery-meta">노드 {it.nodeCount} · 복제 {it.copyCount} · <time dateTime={new Date(it.updatedAt).toISOString()}>{DATE.format(it.updatedAt)}</time><Icon d={I.globe} label="공개" /></span>
              </a>
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
    </section>
  )
}
