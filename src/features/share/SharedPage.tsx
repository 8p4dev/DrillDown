// [스텁 — SH 가 교체] 공유 보기 /t/<slug>?m=. 계약: 04 §3.4·§3.10, 02 §3.1 공유 보기 와이어.
import type { Mode } from '../../router'

export default function SharedPage({ slug, mode }: { slug: string; mode: 'view' | Exclude<Mode, 'edit'>; rootId?: string }) {
  return (
    <section className="shared">
      <h1>공유 트리</h1>
      <p>{slug} · {mode}</p>
    </section>
  )
}
