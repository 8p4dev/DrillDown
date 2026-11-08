// oxlint-disable react/only-export-components -- 토스트 API(toast·hint) 와 Toaster 를 한 파일에 둔다
// 전역 토스트 + 1회성 힌트 — 공유 계약 orchestration_ui_first.md §3.2 (DS 소유). 01 §3.6 #13 · 02 §3.5.
// 동시 1개(큐): 떠 있는 것이 끝나야 다음이 나온다. 힌트(hint)는 [확인] 을 누를 때까지 떠 있고 그동안 일반 토스트는 대기한다.
import { useSyncExternalStore } from 'react'
import { Icon } from '../ui/Icon'
import { I } from '../ui/icons'
import { undo2 } from '../ui/icons.all'

type Action = { label: string; run: () => void; icon?: string }
type Item = { id: number; text: string; action?: Action; ms: number; hint?: boolean; icon?: string }

let queue: Item[] = [] // queue[0] 이 지금 보이는 것
let seq = 0
let timer = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

function arm() {
  clearTimeout(timer)
  const cur = queue[0]
  if (cur && cur.ms > 0) timer = window.setTimeout(() => dismiss(cur), cur.ms)
}
function dismiss(t: Item) {
  const head = queue[0] === t
  queue = queue.filter((x) => x !== t)
  if (head) arm()
  emit()
}
function push(t: Item) {
  // 대기열은 2개까지(오래된 대기 토스트부터 버림). 힌트는 버리지 않는다
  const waiting = queue.slice(1)
  while (waiting.length >= 2) {
    const i = waiting.findIndex((x) => !x.hint)
    if (i < 0) break
    waiting.splice(i, 1)
  }
  // 되돌리기처럼 동작이 있는 토스트는 떠 있는 힌트를 밀어내고 먼저 보인다(힌트는 그 뒤로) — 되돌릴 기회를 놓치지 않게
  queue = t.action && queue[0]?.hint ? [t, queue[0], ...waiting] : [...queue.slice(0, 1), ...waiting, t]
  if (queue[0] === t) arm()
  emit()
}

/** 화면 하단(키보드 위)에 ms 동안 표시. 동시 1개, 나머지는 큐 */

export function toast(text: string, action?: Action, ms = 4000) {
  push({ id: ++seq, text, action, ms })
}

/** 1회성 힌트(02 §3.5): 화면당 1개, 첫 진입 때만. localStorage `hint:<id>` 가 있으면 무시. [확인] 으로 닫는다 */
export function hint(id: string, text: string, icon: string = I.circleAlert) {
  const key = `hint:${id}`
  try {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
  } catch { /* 저장 불가면 그냥 한 번 보여준다 */ }
  push({ id: ++seq, text, ms: 0, hint: true, icon })
}

const UNDO = /되돌리기|실행 취소/

export function Toaster() {
  const list = useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => queue)
  const t = list[0]
  return (
    <div className="toasts" aria-live="polite">
      {t && (
        <div key={t.id} className="toast" role={t.hint ? 'status' : undefined}>
          {t.icon && <Icon d={t.icon} className="toast-icon" />}
          <span>{t.text}</span>
          {t.action && (
            <button type="button" onClick={() => (t.action!.run(), dismiss(t))}>
              {(t.action.icon ?? (UNDO.test(t.action.label) ? undo2 : undefined)) && <Icon d={t.action.icon ?? undo2} />}
              {t.action.label}
            </button>
          )}
          {t.hint && <button type="button" onClick={() => dismiss(t)}>확인</button>}
        </div>
      )}
    </div>
  )
}
