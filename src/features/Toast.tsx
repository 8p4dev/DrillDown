// 전역 토스트: 짧은 피드백 + 선택적 동작(예: 실행 취소). 공유 계약 docs/plans/orchestration_ux_polish.md §3.2 — 오케스트레이터 소유
import { useSyncExternalStore } from 'react'

type Action = { label: string; run: () => void }
type Item = { id: number; text: string; action?: Action }

let items: Item[] = []
let seq = 0
const subs = new Set<() => void>()
const set = (next: Item[]) => {
  items = next
  subs.forEach((f) => f())
}
const drop = (t: Item) => set(items.filter((x) => x !== t))

/** 화면 하단에 ms 동안 표시. 최대 3개, 오래된 것부터 밀려남 */
// oxlint-disable-next-line react/only-export-components -- 토스트 API 와 Toaster 를 한 파일에 둔다
export function toast(text: string, action?: Action, ms = 4000) {
  const t: Item = { id: ++seq, text, action }
  set([...items.slice(-2), t])
  setTimeout(() => drop(t), ms)
}

export function Toaster() {
  const list = useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => items)
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
          {t.action && (
            <button type="button" onClick={() => (t.action!.run(), drop(t))}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
