// 학습 화면 공용: 데이터 소스 선택(04 §3.4.2) + 1회성 힌트. 플래시·빈칸·백지가 쓴다
import { useMemo } from 'react'
import { dexieSource, type StudySource } from '../../core/source'
import { hint, toast } from '../Toast'

/** `source ?? Dexie`. 체험(ephemeral) 소스는 첫 record 때 토스트 1회(04 §3.10) */
export function useStudySource(source: StudySource | undefined, treeId: string): StudySource {
  return useMemo(() => {
    const s = source ?? dexieSource(treeId)
    if (!s.ephemeral) return s
    let warned = false
    return {
      ...s,
      record: (id, ok) => {
        if (!warned) { warned = true; toast('체험 중 — 복제하면 학습 기록이 남습니다') }
        return s.record(id, ok)
      },
    }
  }, [source, treeId])
}

/** 터치 기기에서만 화면당 1회 힌트(02 §3.5). icon 은 Toast.hint 기본값(circle-alert) 또는 화면 아이콘 */
export function coarseHint(id: string, text: string, icon?: string) {
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) hint(id, text, icon)
}

/** 해시 라우트는 해시로, 공유 보기(/t/<slug>?m=)는 pushState + popstate(router navigateShared 와 같게) */
export const goTo = (h: string) =>
  h.startsWith('#') ? (location.hash = h) : (history.pushState(null, '', h), dispatchEvent(new PopStateEvent('popstate')))
