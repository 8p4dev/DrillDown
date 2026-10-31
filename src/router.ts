import { useEffect, useState } from 'react'

export type Route =
  | { name: 'trees' }
  | { name: 'edit'; treeId: string }
  | { name: 'study'; treeId: string }
  | { name: 'quiz'; treeId: string; rootId?: string }
  | { name: 'review' }

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const p = path.split('/').filter(Boolean)
  const q = new URLSearchParams(query)
  if (p[0] === 'tree' && p[1]) {
    if (p[2] === 'study') return { name: 'study', treeId: p[1] }
    if (p[2] === 'quiz') return { name: 'quiz', treeId: p[1], rootId: q.get('root') ?? undefined }
    return { name: 'edit', treeId: p[1] }
  }
  if (p[0] === 'review') return { name: 'review' }
  return { name: 'trees' }
}

export const href = {
  trees: () => '#/',
  edit: (treeId: string) => `#/tree/${treeId}`,
  study: (treeId: string) => `#/tree/${treeId}/study`,
  quiz: (treeId: string, rootId?: string) => `#/tree/${treeId}/quiz${rootId ? `?root=${rootId}` : ''}`,
  review: () => '#/review',
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash))
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}
