import Dexie, { type EntityTable } from 'dexie'
import type { AppEvent, BlankAttempt, ID, NodeSrs, Tree, TreeNode } from './types'

/** 동기화 큐 1행 = 엔티티 1개(04 §3.1). 페이로드는 없다 — 보낼 때 현재 행을 읽는다 */
export interface OutboxRow { seq?: number; kind: 'tree' | 'node' | 'srs' | 'attempt'; id: ID; treeId: ID; op: 'put' | 'del'; at: number }
export interface MetaRow { key: 'userId' | 'cursor' | 'lastSyncAt' | 'lastSyncError' | 'rejected'; value: string | number | null }
/** track 에 넣는 행(seq·at 은 track 이 붙인다) */
export type Row = Omit<OutboxRow, 'seq' | 'at'>

export const db = new Dexie('drilldown') as Dexie & {
  trees: EntityTable<Tree, 'id'>
  nodes: EntityTable<TreeNode, 'id'>
  srs: EntityTable<NodeSrs, 'nodeId'>
  events: EntityTable<AppEvent, 'id'>
  attempts: EntityTable<BlankAttempt, 'id'>
  outbox: EntityTable<OutboxRow, 'seq'>
  meta: EntityTable<MetaRow, 'key'>
}

// 04 §3.1 Dexie 버전 2 — 선택 필드만 추가라 upgrade() 없음. upgrade 없는 과거 버전(1)은 선언하지 않아도 Dexie 3+ 가 스키마 차이를 맞춘다
db.version(2).stores({
  trees: 'id, updatedAt, slug',
  nodes: 'id, treeId, parentId',
  srs: 'nodeId, treeId, due',
  events: 'id, ts, type, treeId',
  attempts: 'id, treeId, completedAt',
  outbox: '++seq, &[kind+id]',
  meta: 'key',
})

export const newId = () => crypto.randomUUID()

/** 엔진이 등록하는 push 예약(디바운스). 엔진 미로드(비로그인)면 no-op */
let kick = () => {}
export const setKick = (f: () => void) => void (kick = f)

let lastAt = 0
/**
 * 쓰기 훅(04 §3.1 표). 호출자의 rw 트랜잭션 안에서 부른다(outbox·meta 포함).
 * meta.userId 가 없으면(비로그인) 아무것도 쓰지 않는다(원칙 2). 같은 엔티티는 1행으로 덮어쓴다.
 */
export async function track(rows: Row[]): Promise<void> {
  if (!rows.length || !(await db.meta.get('userId'))?.value) return
  const at = (lastAt = Math.max(Date.now(), lastAt + 1)) // 단조 증가: push 후 "보낸 뒤 다시 바뀜" 판정용
  const uniq = [...new Map(rows.map((r) => [r.kind + r.id, r])).values()]
  const old = await db.outbox.where('[kind+id]').anyOf(uniq.map((r) => [r.kind, r.id])).toArray()
  const seqOf = new Map(old.map((o) => [o.kind + o.id, o.seq]))
  await db.outbox.bulkPut(uniq.map((r) => {
    const seq = seqOf.get(r.kind + r.id)
    return seq === undefined ? { ...r, at } : { ...r, at, seq }
  }))
  kick()
}
