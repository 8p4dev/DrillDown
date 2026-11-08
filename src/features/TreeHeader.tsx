// 트리 화면 공용 상단 헤더: 트리 이름 + 모드 탭. 공유 계약 orchestration_ui_first.md §3.2 (DS 소유) · 01 §3.5 헤더 행 · 02 §3.1.
// 탭은 아이콘 + 짧은 글자(편집·플래시·빈칸·백지), 접근 가능한 이름은 현재 라벨(편집·플래시카드·빈칸 퀴즈·백지 퀴즈) 유지(E2E).
// 헤더 실제 높이(+아래 여백)를 :root --tree-head-h 에 쓴다 — 에디터 캔버스 높이 계산용(02 §3.1).
import { useEffect, useRef, useState } from 'react'
import { db } from '../core/db'
import { href, type Mode } from '../router'
import { I } from '../ui/icons'
import { Icon } from '../ui/Icon'
import './tree-header.css'

const MODES: { mode: Mode; label: string; short: string; icon: string; to: (id: string) => string }[] = [
  { mode: 'edit', label: '편집', short: '편집', icon: I.pencil, to: href.edit },
  { mode: 'flash', label: '플래시카드', short: '플래시', icon: I.layers, to: href.flash },
  { mode: 'dnd', label: '빈칸 퀴즈', short: '빈칸', icon: I.squareDashed, to: href.dnd },
  { mode: 'blank', label: '백지 퀴즈', short: '백지', icon: I.file, to: href.blank },
]

/** title = 이미 아는 경우 넘기면 DB 조회 대신 사용(편집 중 루트 제목 즉시 반영). children = 헤더 오른쪽 화면별 도구 */
export default function TreeHeader(p: { treeId: string; active: Mode; title?: string; children?: React.ReactNode }) {
  const { treeId, active, children } = p
  const [title, setTitle] = useState('')
  const ref = useRef<HTMLElement>(null)
  useEffect(() => void db.trees.get(treeId).then((t) => setTitle(t?.title ?? '')), [treeId])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement.style
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginBottom)
      root.setProperty('--tree-head-h', `${Math.round(h)}px`)
    })
    ro.observe(el)
    return () => { ro.disconnect(); root.removeProperty('--tree-head-h') }
  }, [])
  return (
    <header className="tree-header" ref={ref}>
      <h1>{p.title ?? title}</h1>
      <nav aria-label="학습 모드" className="mode-tabs seg">
        {MODES.map((m) => (
          <a key={m.mode} href={m.to(treeId)} aria-label={m.label} aria-current={m.mode === active ? 'page' : undefined}>
            <Icon d={m.icon} /><span>{m.short}</span>
          </a>
        ))}
      </nav>
      {children && <div className="tree-header-tools">{children}</div>}
    </header>
  )
}
