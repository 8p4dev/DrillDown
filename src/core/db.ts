import Dexie, { type EntityTable } from 'dexie'
import type { AppEvent, BlankAttempt, NodeSrs, Tree, TreeNode } from './types'

export const db = new Dexie('drilldown') as Dexie & {
  trees: EntityTable<Tree, 'id'>
  nodes: EntityTable<TreeNode, 'id'>
  srs: EntityTable<NodeSrs, 'nodeId'>
  events: EntityTable<AppEvent, 'id'>
  attempts: EntityTable<BlankAttempt, 'id'>
}

db.version(1).stores({
  trees: 'id, updatedAt',
  nodes: 'id, treeId, parentId',
  srs: 'nodeId, treeId, due',
  events: 'id, ts, type, treeId',
  attempts: 'id, treeId, completedAt',
})

export const newId = () => crypto.randomUUID()
