// 갤러리 #/gallery — 04 §3.5 최소형: 정렬 2개(최신·복제 수), 20건, 카드 → /t/<slug>
import { useMemo, useState } from 'react'
import { listGallery } from '../../core/mock/shared'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import './share.css'

type Sort = 'recent' | 'copies'

export default function GalleryPage() {
  const [sort, setSort] = useState<Sort>('recent')
  const items = useMemo(() => listGallery(sort), [sort])
  return (
    <section className="gallery">
      <header className="gallery-head">
        <h1>갤러리</h1>
        <div className="seg" role="group" aria-label="정렬">
          <button type="button" aria-pressed={sort === 'recent'} onClick={() => setSort('recent')}>최신</button>
          <button type="button" aria-pressed={sort === 'copies'} onClick={() => setSort('copies')}>복제 수</button>
        </div>
      </header>
      {items.length === 0 ? (
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
    </section>
  )
}
