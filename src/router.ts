import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export type Mode = 'edit' | 'flash' | 'dnd' | 'blank'
export type Route =
  | { name: 'trees' }
  | { name: Mode; treeId: string; rootId?: string }
  | { name: 'review' }

const MODES: Mode[] = ['flash', 'dnd', 'blank']

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const p = path.split('/').filter(Boolean)
  const rootId = new URLSearchParams(query).get('root') ?? undefined
  if (p[0] === 'tree' && p[1]) {
    const m = MODES.find((x) => x === p[2]) ?? 'edit'
    return { name: m, treeId: p[1], rootId }
  }
  if (p[0] === 'review') return { name: 'review' }
  return { name: 'trees' }
}

const q = (rootId?: string) => (rootId ? `?root=${rootId}` : '')
export const href = {
  trees: () => '#/',
  edit: (treeId: string) => `#/tree/${treeId}`,
  /** 플래시카드: rootId = 시작 개념(없으면 루트) */
  flash: (treeId: string, rootId?: string) => `#/tree/${treeId}/flash${q(rootId)}`,
  /** 드래그 앤 드롭 퀴즈: rootId = 범위 */
  dnd: (treeId: string, rootId?: string) => `#/tree/${treeId}/dnd${q(rootId)}`,
  /** 백지 드래그 앤 드롭 퀴즈: rootId = 범위 */
  blank: (treeId: string, rootId?: string) => `#/tree/${treeId}/blank${q(rootId)}`,
  review: () => '#/review',
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)')

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    let vt: ViewTransition | undefined
    // 화면 전환 연속성: 지원 브라우저에서 짧은 교차 페이드 (index.css ::view-transition-*)
    const on = () => {
      const next = () => setRoute(parseHash(location.hash))
      if (!document.startViewTransition || reduced.matches) return next()
      // 연달아 전환하면 앞 전환은 건너뛴다. 건너뛴 전환의 AbortError 는 정상 동작이므로 삼킨다
      vt?.skipTransition()
      const t = (vt = document.startViewTransition(() => flushSync(next)))
      for (const p of [t.ready, t.finished]) p.catch(() => {})
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}
