// 공유 계약 — 변경은 오케스트레이터만 한다 (docs/plans/orchestration_core_features.md §4)
export type ID = string

export interface Tree {
  id: ID
  title: string
  createdAt: number
  updatedAt: number
}

export interface TreeNode {
  id: ID
  treeId: ID
  parentId: ID | null // null = 루트 (트리당 루트 1개, 루트 title = 트리 중심 개념)
  order: number // 형제 정렬키. 중간 삽입은 두 값의 중간값
  title: string // 짧은 쟁점어 — 백지 퀴즈 채점 대상
  note?: string // 서술형 메모 — 채점 대상 아님
  aliases: string[] // 허용 표현(동의어·약어)
  collapsed?: boolean
  /** 그래프 뷰에서 마우스로 옮긴 양(px). 자동 배치 위치 기준이며 자손에게도 누적 적용. 없으면 {0,0} */
  offset?: { x: number; y: number }
  updatedAt: number
}

/** 노드 1개의 최종 판정 출처 (04 §5 ③, 11 §4) */
export type GradeSource =
  | 'exact' // 정규화 일치
  | 'alias' // 허용 표현 사전 일치
  | 'fuzzy' // 퍼지 상한 이상
  | 'self_accept' // 애매 → 의미 단위 전부 체크
  | 'self_partial' // 애매 → 일부만 체크 (Again 취급)
  | 'self_reject' // 애매 → 0개 체크
  | 'auto_reject' // 퍼지 하한 미만 또는 누락

export type Structure = 'ok' | 'misplaced' | null // null = 구조 판정 없음(누락 등)

/** 노드별 학습 상태. card 는 ts-fsrs 가 돌려준 Card 객체를 그대로 저장 (형태는 core/srs 소유) */
export interface NodeSrs {
  nodeId: ID
  treeId: ID
  card: unknown
  due: number // epoch ms, card.due 와 동일 (인덱스용)
  lastGradeSource: GradeSource | null
  lastStructure: Structure
  autoCorrectDays: string[] // 자동 정답(exact|alias|fuzzy + 구조 ok)을 받은 서로 다른 날짜 YYYY-MM-DD
  pendingRecheck: boolean // self_accept 후, 다음 회차 자동 정답 전까지 true
  updatedAt: number
}

export type EventType =
  | 'blank_node_graded'
  | 'blank_grade_overridden'
  | 'blank_attempt_completed'
  | 'self_graded_node_rechecked'
  | 'drilldown_retrieval_submitted'
  | 'tree_created'
  | 'outline_imported'

export interface AppEvent {
  id: ID
  ts: number
  type: EventType
  treeId?: ID
  props: Record<string, unknown>
}

export interface BlankAttempt {
  id: ID
  treeId: ID
  rootId: ID
  startedAt: number
  completedAt: number
  nodeRecall: number
  edgeAccuracy: number
  autoGradedCount: number
  selfGradedCount: number
  overriddenCount: number
}
