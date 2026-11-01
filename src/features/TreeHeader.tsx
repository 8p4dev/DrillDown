// 트리 화면 공용 상단 헤더: 트리 이름 + 모드 버튼. 공유 계약 (docs/plans/orchestration_modes.md §3.4) — 오케스트레이터 소유
import { useEffect, useState } from 'react'
import { db } from '../core/db'
import { href, type Mode } from '../router'
import './tree-header.css'

const MODES: { mode: Mode; label: string; to: (id: string) => string }[] = [
  { mode: 'edit', label: '편집', to: href.edit },
  { mode: 'flash', label: '플래시카드', to: href.flash },
  { mode: 'dnd', label: '빈칸 퀴즈', to: href.dnd },
  { mode: 'blank', label: '백지 퀴즈', to: href.blank },
]

/** title = 이미 아는 경우 넘기면 DB 조회 대신 사용(편집 중 루트 제목 즉시 반영). children = 헤더 오른쪽 화면별 도구 */
export default function TreeHeader(p: { treeId: string; active: Mode; title?: string; children?: React.ReactNode }) {
  const { treeId, active, children } = p
  const [title, setTitle] = useState('')
  useEffect(() => void db.trees.get(treeId).then((t) => setTitle(t?.title ?? '')), [treeId])
  return (
    <header className="tree-header">
      <h1>{p.title ?? title}</h1>
      <nav aria-label="학습 모드" className="mode-tabs">
        {MODES.map((m) => (
          <a key={m.mode} href={m.to(treeId)} aria-current={m.mode === active ? 'page' : undefined}>{m.label}</a>
        ))}
      </nav>
      {children && <div className="tree-header-tools">{children}</div>}
    </header>
  )
}
