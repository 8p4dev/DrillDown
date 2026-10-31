import { db, newId } from './db'
import type { EventType, ID } from './types'

export async function logEvent(type: EventType, props: Record<string, unknown>, treeId?: ID): Promise<void> {
  await db.events.add({ id: newId(), ts: Date.now(), type, treeId, props })
}

export async function exportEvents(): Promise<string> {
  return JSON.stringify(await db.events.orderBy('ts').toArray(), null, 2)
}
