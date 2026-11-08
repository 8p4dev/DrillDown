// 학습 화면 공용: 데이터 소스 선택(04 §3.4.2) + 1회성 힌트. 플래시·빈칸·백지가 쓴다
import { useMemo } from 'react'
import { dexieSource, type StudySource } from '../../core/source'
import * as Toast from '../Toast'

/** `source ?? Dexie`. 체험(ephemeral) 소스는 첫 record 때 토스트 1회(04 §3.10) */
export function useStudySource(source: StudySource | undefined, treeId: string): StudySource {
  return useMemo(() => {
    const s = source ?? dexieSource(treeId)
    if (!s.ephemeral) return s
    let warned = false
    return {
      ...s,
      record: (id, ok) => {
        if (!warned) { warned = true; Toast.toast('체험 중 — 기록은 저장되지 않아요') }
        return s.record(id, ok)
      },
    }
  }, [source, treeId])
}

// DS 가 `hint(id, text)` 를 Toast 에 추가하기 전까지 선택적 호출(계약 §3.2). 머지 뒤 `import { hint }` 로 바꿔도 된다
const hint = (Toast as unknown as { hint?: (id: string, text: string) => void }).hint

/** 터치 기기에서만 화면당 1회 힌트(02 §3.5) */
export function coarseHint(id: string, text: string) {
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) hint?.(id, text)
}
