// oxlint-disable react/only-export-components -- 토스트 API(toast·hint) 와 Toaster 를 한 파일에 둔다
// 전역 토스트 + 1회성 힌트 — 공유 계약 orchestration_ui_first.md §3.2 (DS 소유). 01 §3.6 #13 · 02 §3.5.
// 동시 1개(큐): 떠 있는 것이 끝나야 다음이 나온다. 힌트(hint)는 [확인] 을 누를 때까지 떠 있고 그동안 일반 토스트는 대기한다.
// 단, 정보 토스트(버튼 없음)는 기다리지 않는다: 액션·힌트 토스트 앞에 끼어 바로 보이고, 끝나면 밀린 것이 다시 뜬다(타이머 새로).
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
const UNDO = /되돌리기|실행 취소/

function push(t: Item, now = false) {
  const head = queue[0]
  // now: 지금 떠 있는 것을 대체(힌트·되돌리기 외 액션 토스트는 대체하지 않음 — 그 액션은 아직 유효하다)
  if (now && head && !head.hint && (!head.action || UNDO.test(head.action.label))) queue = queue.slice(1)
  // 일반 토스트는 언제나 힌트보다 앞(힌트가 [확인] 전까지 되돌리기·복사됨을 막지 않게). 힌트는 맨 뒤.
  // 정보 토스트는 액션 토스트보다도 앞('잘라냄' 이 10초 [되돌리기] 뒤에서 기다리지 않게)
  const i = t.hint ? -1 : queue.findIndex((x) => x.hint || (!t.action && !!x.action))
  const next = i < 0 ? [...queue, t] : [...queue.slice(0, i), t, ...queue.slice(i)]
  // 기다리는 일반 토스트는 2개까지(오래된 것부터 버림). 힌트는 버리지 않는다
  while (next.filter((x, k) => k > 0 && !x.hint).length > 2) next.splice(next.findIndex((x, k) => k > 0 && !x.hint), 1)
  queue = next
  if (queue[0] !== head) arm()
  emit()
}

/** 화면 하단(키보드 위)에 ms 동안 표시. 동시 1개, 나머지는 큐.
 *  now = 방금 그 동작을 되돌린 결과처럼 떠 있는 [되돌리기] 토스트를 무의미하게 만드는 알림: 기다리지 않고 대체한다 */
export function toast(text: string, action?: Action, ms = 4000, now = false) {
  push({ id: ++seq, text, action, ms }, now)
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
