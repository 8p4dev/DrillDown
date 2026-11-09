// 학습 화면의 데이터 소스 주입 — 공유 계약 orchestration_ui_first.md §3.5 (오케스트레이터 소유). 04 §3.4.2
// 기본 = Dexie(현재 동작). 공유 보기(/t/<slug>)는 메모리 소스를 넣어 같은 플래시·빈칸·백지 컴포넌트를 읽기 전용으로 쓴다.
import { getTreeNodes } from './repo'
import { getSrsMap, recordResult, recordResults } from './srs'
import type { ID, NodeSrs, TreeNode } from './types'

export interface StudySource {
  /** 트리의 모든 노드 */
  nodes(): Promise<TreeNode[]>
  /** nodeId → NodeSrs */
  srs(): Promise<Map<ID, NodeSrs>>
  /**
   * 채점 결과 기록. 돌려주는 NodeSrs 는 색 계산에 쓴다(노드가 지워졌으면 null). 공유 보기는 메모리 Map 만 갱신한다.
   * base: "다시 평가" 때 첫 평가 전 기록(null = 없었음) → 그 기준으로 다시 계산해 덮어쓴다(S2)
   */
  record(nodeId: ID, ok: boolean, base?: NodeSrs | null): Promise<NodeSrs | null>
  /** 빈칸·백지 채점: 여러 노드를 한 번에(S18) */
  recordResults(ids: ID[], oks: boolean[]): Promise<void>
  /** true 면 기록이 저장되지 않는 체험 모드(첫 채점 때 토스트 1회) */
  readonly ephemeral?: boolean
  /** 체험 토스트의 [복제] 동작(공유 보기만) */
  readonly copy?: () => void
}

export function dexieSource(treeId: ID): StudySource {
  return {
    nodes: () => getTreeNodes(treeId),
    srs: () => getSrsMap(treeId),
    record: (nodeId, ok, base) => recordResult(nodeId, treeId, ok, new Date(), base),
    recordResults: (ids, oks) => recordResults(treeId, ids, oks),
  }
}
