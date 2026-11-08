// 학습 화면의 데이터 소스 주입 — 공유 계약 orchestration_ui_first.md §3.5 (오케스트레이터 소유). 04 §3.4.2
// 기본 = Dexie(현재 동작). 공유 보기(/t/<slug>)는 메모리 소스를 넣어 같은 플래시·빈칸·백지 컴포넌트를 읽기 전용으로 쓴다.
import { getTreeNodes } from './repo'
import { getSrsMap, recordResult } from './srs'
import type { ID, NodeSrs, TreeNode } from './types'

export interface StudySource {
  /** 트리의 모든 노드 */
  nodes(): Promise<TreeNode[]>
  /** nodeId → NodeSrs */
  srs(): Promise<Map<ID, NodeSrs>>
  /** 채점 결과 기록. 돌려주는 NodeSrs 는 색 계산에 쓴다. 공유 보기는 메모리 Map 만 갱신한다 */
  record(nodeId: ID, ok: boolean): Promise<NodeSrs>
  /** true 면 기록이 저장되지 않는 체험 모드(첫 채점 때 토스트 1회) */
  readonly ephemeral?: boolean
}

export function dexieSource(treeId: ID): StudySource {
  return {
    nodes: () => getTreeNodes(treeId),
    srs: () => getSrsMap(treeId),
    record: (nodeId, ok) => recordResult(nodeId, treeId, ok),
  }
}
