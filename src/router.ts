import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

// 라우트 — 공유 계약 orchestration_ui_first.md §3.1 (오케스트레이터 소유). 해시 라우터 + 공유 보기만 pathname(/t/<slug>, 04 §3.4.2)
export type Mode = 'edit' | 'flash' | 'dnd' | 'blank'
export type AdminTab = 'dashboard' | 'users' | 'trees' | 'requests' | 'metrics' | 'feedback' | 'system'
export type Route =
  | { name: 'trees' }
  | { name: Mode; treeId: string; rootId?: string }
  | { name: 'login'; e?: string; r?: string; returnTo?: string } // e = denied | suspended | state (03 §3.6), r = 정지 사유
  | { name: 'account' }
  | { name: 'admin'; tab: AdminTab }
  | { name: 'gallery' }
  | { name: 'privacy' }
  | { name: 'terms' }
  | { name: 'takedown' } // 저작권 게시중단 요청 폼 (약관 5)
  | { name: 'report'; id: string } // 신고·게시중단 접수 상태 조회
  | { name: 'shared'; slug: string; mode: 'view' | Exclude<Mode, 'edit'>; rootId?: string }

const MODES: Mode[] = ['flash', 'dnd', 'blank']
const ADMIN_TABS: AdminTab[] = ['users', 'trees', 'requests', 'metrics', 'feedback', 'system']
export const SLUG_RE = /^[1-9A-HJ-NP-Za-km-z]{11}$/

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const p = path.split('/').filter(Boolean)
  const qs = new URLSearchParams(query)
  const rootId = qs.get('root') ?? undefined
  if (p[0] === 'tree' && p[1]) {
    const m = MODES.find((x) => x === p[2]) ?? 'edit'
    return { name: m, treeId: p[1], rootId }
  }
  if (p[0] === 'login') return { name: 'login', e: qs.get('e') ?? undefined, r: qs.get('r')?.slice(0, 200) || undefined, returnTo: qs.get('return_to') ?? undefined }
  if (p[0] === 'account') return { name: 'account' }
  if (p[0] === 'admin') return { name: 'admin', tab: ADMIN_TABS.find((t) => t === p[1]) ?? 'dashboard' }
  if (p[0] === 'gallery') return { name: 'gallery' }
  if (p[0] === 'privacy') return { name: 'privacy' }
  if (p[0] === 'terms') return { name: 'terms' }
  if (p[0] === 'takedown') return { name: 'takedown' }
  if (p[0] === 'report' && p[1]) return { name: 'report', id: p[1].slice(0, 64) }
  return { name: 'trees' }
}

/** pathname /t/<slug> 가 우선, 아니면 해시 */
export function parseLocation(loc: Pick<Location, 'pathname' | 'search' | 'hash'>): Route {
  const m = /^\/t\/([^/]+)\/?$/.exec(loc.pathname)
  // 공유 보기에서 '#/…' 링크(내 트리 등)를 누르면 /t/<slug>#/… 가 된다 → 앱 해시 라우트로 보고 경로를 / 로 정리
  if (m && loc.hash.length > 1) {
    if (typeof history !== 'undefined' && location.pathname === loc.pathname) history.replaceState(null, '', '/' + loc.hash)
    return parseHash(loc.hash)
  }
  if (m && SLUG_RE.test(m[1])) {
    const q = new URLSearchParams(loc.search)
    const mm = q.get('m')
    const mode = MODES.find((x) => x !== 'edit' && x === mm) as Exclude<Mode, 'edit'> | undefined
    return { name: 'shared', slug: m[1], mode: mode ?? 'view', rootId: q.get('root') ?? undefined }
  }
  return parseHash(loc.hash)
}

const q = (rootId?: string) => (rootId ? `?root=${rootId}` : '')
export const href = {
  trees: () => '#/',
  /** 편집: rootId = 이 가지만 보기(서브트리 포커스, T1) */
  edit: (treeId: string, rootId?: string) => `#/tree/${treeId}${q(rootId)}`,
  /** 플래시카드: rootId = 시작 개념(없으면 루트) */
  flash: (treeId: string, rootId?: string) => `#/tree/${treeId}/flash${q(rootId)}`,
  /** 드래그 앤 드롭 퀴즈: rootId = 범위 */
  dnd: (treeId: string, rootId?: string) => `#/tree/${treeId}/dnd${q(rootId)}`,
  /** 백지 드래그 앤 드롭 퀴즈: rootId = 범위 */
  blank: (treeId: string, rootId?: string) => `#/tree/${treeId}/blank${q(rootId)}`,
  login: (returnTo?: string) => `#/login${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`,
  account: () => '#/account',
  admin: (tab: AdminTab = 'dashboard') => (tab === 'dashboard' ? '#/admin' : `#/admin/${tab}`),
  gallery: () => '#/gallery',
  /** 개인정보 처리방침 (03 §3.7) */
  privacy: () => '#/privacy',
  /** 이용약관·신고 처리 절차 */
  terms: () => '#/terms',
  /** 저작권 게시중단 요청 폼 */
  takedown: () => '#/takedown',
  /** 신고·게시중단 접수 상태(접수번호) */
  report: (id: string) => `#/report/${id}`,
  /** 공유 보기. 모드 전환은 ?m= (해시를 쓰면 복사한 URL 에서 OG 가 빠진다, 04 §3.4.2) */
  shared: (slug: string, mode?: Exclude<Mode, 'edit'>, rootId?: string) =>
    `/t/${slug}${mode ? `?m=${mode}${rootId ? `&root=${rootId}` : ''}` : ''}`,
}

/** 공유 보기 안에서 ?m= 만 바꿀 때 (pushState + 라우터 갱신) */
export function navigateShared(slug: string, mode?: Exclude<Mode, 'edit'>, rootId?: string) {
  history.pushState(null, '', href.shared(slug, mode, rootId))
  dispatchEvent(new PopStateEvent('popstate'))
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)')

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseLocation(location))
  useEffect(() => {
    let vt: ViewTransition | undefined
    // 화면 전환 연속성: 지원 브라우저에서 짧은 교차 페이드 (index.css ::view-transition-*)
    const on = () => {
      const next = () => setRoute(parseLocation(location))
      if (!document.startViewTransition || reduced.matches) return next()
      // 연달아 전환하면 앞 전환은 건너뛴다. 건너뛴 전환의 AbortError 는 정상 동작이므로 삼킨다
      vt?.skipTransition()
      const t = (vt = document.startViewTransition(() => flushSync(next)))
      for (const p of [t.ready, t.finished]) p.catch(() => {})
    }
    addEventListener('hashchange', on)
    addEventListener('popstate', on)
    return () => {
      removeEventListener('hashchange', on)
      removeEventListener('popstate', on)
    }
  }, [])
  return route
}
