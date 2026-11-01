import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { fromDom, getSel, setSel } from './dom'
import { autoBullet, highlight, lineText, parse, serialize, toggleBullet, toHtml, type Color, type Line, type Pos } from './format'

export type NoteOp = Color | 'bullet' | 'clear'
export interface NoteApi { apply(op: NoteOp): void }
type Range = { start: Pos; end: Pos }

let lastColor: Color = 'y' // Shift+H 가 쓸 색 = 마지막으로 고른 형광펜 (편집기 공용)

/**
 * 내용 편집기 — 비제어 contentEditable. React 는 자식을 그리지 않고 innerHTML 을 직접 관리한다.
 * 한글 IME 조합 중에는 DOM 재렌더·저장·단축키를 모두 건너뛰고 compositionend 에서 한 번 동기화.
 */
export default function NoteEditor({ ref: api, ...p }: {
  value: string
  onChange: (v: string) => void
  label: string
  /** 툴바가 apply 를 부르는 핸들 */
  ref?: React.Ref<NoteApi>
  autoFocus?: boolean
  placeholder?: string
  onFocus?: () => void
  onBlur?: () => void
  onEscape?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null) // 편집 영역 DOM (api 는 툴바용 핸들)
  const emitted = useRef<string | null>(null) // 마지막으로 내보낸 값: 같은 값이 돌아오면 DOM 을 건드리지 않는다
  const composing = useRef(false)
  const lastSel = useRef<Range>({ start: { line: 0, col: 0 }, end: { line: 0, col: 0 } })

  function render(lines: Line[], s?: Range) {
    const el = ref.current!
    el.innerHTML = toHtml(lines)
    if (s && document.activeElement === el) setSel(el, s.start, s.end)
  }
  function emit(lines: Line[]) {
    const v = serialize(lines)
    emitted.current = v
    if (v !== p.value) p.onChange(v)
  }
  /** 입력 후: DOM → 모델, 자동 불릿, 정규형이 아니면 다시 그리고 커서 복원 */
  function sync() {
    const el = ref.current!
    const s = getSel(el)
    const { lines, changed } = autoBullet(fromDom(el))
    if (el.innerHTML !== toHtml(lines)) {
      const fix = (q: Pos) => (changed.includes(q.line) ? { line: q.line, col: Math.max(q.col - 2, 0) } : q)
      render(lines, s ? { start: fix(s.start), end: fix(s.end) } : undefined)
    }
    emit(lines)
  }
  function apply(op: NoteOp) {
    const el = ref.current!
    const s = getSel(el) ?? lastSel.current
    let lines = fromDom(el)
    if (op === 'bullet') lines = toggleBullet(lines, s.start.line, s.end.line)
    else {
      if (op !== 'clear') lastColor = op
      lines = highlight(lines, s.start, s.end, op === 'clear' ? null : op)
    }
    el.focus()
    render(lines, s)
    emit(lines)
  }

  // 바깥(다른 편집기·실행취소)에서 값이 바뀌었을 때만 다시 그린다
  useLayoutEffect(() => {
    if (p.value === emitted.current || composing.current) return
    emitted.current = p.value
    render(parse(p.value))
  }, [p.value]) // oxlint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current!
    if (!p.autoFocus) return
    el.focus()
    setSel(el, { line: el.childNodes.length - 1, col: Infinity })
  }, []) // oxlint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(api, () => ({ apply }))

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    const el = ref.current!
    if (e.key === 'Escape') {
      e.preventDefault()
      return p.onEscape ? p.onEscape() : el.blur()
    }
    const s = getSel(el)
    if (!s) return
    const collapsed = s.start.line === s.end.line && s.start.col === s.end.col
    if (e.shiftKey && e.code === 'KeyH' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (collapsed) return // 선택 없으면 그냥 'H' 입력
      e.preventDefault()
      apply(lastColor)
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault() // 줄 안 <br> 대신 새 줄
      document.execCommand('insertParagraph')
    } else if ((e.key === 'Enter' || e.key === 'Backspace') && collapsed) {
      // 빈 불릿 줄 Enter, 불릿 줄 맨 앞 Backspace → 불릿 해제 (노트앱 관례)
      const lines = fromDom(el)
      const l = lines[s.start.line]
      if (!l?.bullet || (e.key === 'Enter' ? lineText(l) !== '' : s.start.col !== 0)) return
      e.preventDefault()
      const next = toggleBullet(lines, s.start.line, s.start.line)
      render(next, s)
      emit(next)
    }
  }

  return (
    <div
      ref={ref}
      className="note-edit"
      contentEditable
      role="textbox"
      aria-multiline
      aria-label={p.label}
      data-placeholder={p.placeholder}
      spellCheck={false}
      onInput={(e) => {
        if (!composing.current && !(e.nativeEvent as InputEvent).isComposing) sync()
      }}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false
        sync()
      }}
      onKeyDown={onKeyDown}
      onSelect={() => {
        const s = getSel(ref.current!)
        if (s) lastSel.current = s
      }}
      onPaste={(e) => {
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
      onFocus={p.onFocus}
      onBlur={p.onBlur}
    />
  )
}
