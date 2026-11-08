// 동기화 엔진 — 04 §3.1 push/pull·LWW·톰스톤·고아, §3.8 병합 M1~M6, §3.10 상태. sync.ts 가 onLogin 때만 동적 import 한다.
import { api, ApiError } from '../api'
import { db, newId, setKick, track, type MetaRow, type OutboxRow } from '../db'
import { setSyncState, type MergeChoice, type MergePlan } from '../sync'
import { CAP, type BlankAttempt, type ID, type NodeSrs, type Tree, type TreeNode } from '../types'
import { toast } from '../../features/Toast'

type RTree = Tree & { hiddenByAdmin?: boolean }
type Del = { deletedAt?: number | null }
interface Batch { trees: (RTree & Del)[]; nodes: (TreeNode & Del)[]; srs: (NodeSrs & Del)[] }
interface PushRes { seq: number; applied: ID[]; superseded: Batch; dropped: ID[]; id_taken: ID[] }
interface PullRes extends Batch { seq: number; more: boolean }
type Row = Omit<OutboxRow, 'seq' | 'at'>

const ALL = () => [db.trees, db.nodes, db.srs, db.attempts, db.outbox, db.meta]
const ORDER = { tree: 0, node: 1, srs: 2, attempt: 3 } as const
const MAX_ROWS = 500
const MAX_BYTES = 900_000 // 서버 상한 1MB 보다 여유
const enc = new TextEncoder()

const getMeta = async (k: MetaRow['key']) => (await db.meta.get(k))?.value ?? null
const isDef = <T,>(x: T | undefined): x is T => x !== undefined
const live = async () => (await db.trees.toArray()).filter((t) => !t.deletedAt)
const emit = (treeIds: Iterable<ID>) => {
  const ids = [...treeIds]
  if (ids.length) dispatchEvent(new CustomEvent('dd:remote', { detail: { treeIds: ids } }))
}

// ── 상태·트리거 ─────────────────────────────────────────────

let running = false
let pendingUser: string | null = null
let debounce: ReturnType<typeof setTimeout> | undefined
let retry: ReturnType<typeof setTimeout> | undefined
let poll: ReturnType<typeof setInterval> | undefined
let chain: Promise<void> = Promise.resolve()
/** 마지막 pull 이 more=false 로 끝났나 (U08·R5-P3). 시작·새로고침 때 false — start() 가 늘 pull 하므로 영속할 필요 없다 */
let pullDone = false

const onOnline = () => void sync()
const onVis = () => document.visibilityState === 'visible' && void sync()

/** db.track 이 부른다: 쓰기 후 2초 디바운스 push(pull 생략) */
function schedule() {
  clearTimeout(debounce)
  if (!navigator.onLine) return void db.outbox.count().then((pending) => setSyncState({ kind: 'offline', pending }))
  setSyncState({ kind: 'syncing' })
  debounce = setTimeout(() => void sync(false), 2000)
}

async function start(): Promise<void> {
  held.clear() // 로그인 = 보류 해제 재시도 (C4)
  await loadBad()
  if (!running) {
    running = true
    setKick(schedule)
    addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVis)
    poll = setInterval(() => document.visibilityState === 'visible' && void sync(), 60_000)
  }
  return sync()
}

export function stop() {
  running = false
  pendingUser = null
  setKick(() => {})
  removeEventListener('online', onOnline)
  document.removeEventListener('visibilitychange', onVis)
  clearInterval(poll)
  clearTimeout(debounce)
  clearTimeout(retry)
}

/** push(+pull). 직렬화 — 동시에 두 번 돌지 않는다. 오류는 상태로만 알리고 throw 하지 않는다 */
export function sync(pullToo = true): Promise<void> {
  const p = chain.then(() => run(pullToo))
  chain = p
  return p
}
export function flush(): Promise<void> {
  clearTimeout(debounce)
  return sync(false)
}

async function run(pullToo: boolean) {
  if (!running) return
  clearTimeout(retry)
  if (!navigator.onLine) return setSyncState({ kind: 'offline', pending: await db.outbox.count() })
  setSyncState({ kind: 'syncing' })
  try {
    await pushAll()
    if (pullToo) {
      await pull()
      await pushAll() // pull 이 만든 행(고아 복구·srs 합집합)과 트리 삭제로 풀린 보류 행
    }
    await db.meta.put({ key: 'lastSyncAt', value: Date.now() })
    const pending = await db.outbox.count()
    const msgs = [
      ...(held.size ? [`트리는 ${CAP.treesPerUser}개까지 저장할 수 있습니다 — ${held.size}개 보류`] : []),
      ...(bad.size ? [`저장 못 한 항목 ${bad.size}개 — ${[...bad.values()].at(-1)!.reason}`] : []),
    ]
    if (msgs.length) {
      const reason = msgs.join(' · ')
      await db.meta.put({ key: 'lastSyncError', value: reason })
      setSyncState({ kind: 'error', reason, pending })
    } else setSyncState(pending || !pullDone ? { kind: 'syncing' } : { kind: 'saved' })
  } catch (e) {
    await fail(e)
  }
}

async function fail(e: unknown) {
  const pending = await db.outbox.count()
  if (e instanceof ApiError && e.status === 429) {
    // U08·R5-P2: 리밋은 오류가 아니라 대기 — Retry-After(없으면 15초) 뒤 이어서
    setSyncState({ kind: 'syncing' })
    retry = setTimeout(() => void sync(), (e.retryAfter ?? 15) * 1000)
    return
  }
  if (e instanceof ApiError && (e.status === 0 || e.status === 503)) {
    setSyncState({ kind: 'offline', pending })
    if (e.status === 503) retry = setTimeout(() => void sync(), (e.retryAfter ?? 30) * 1000) // 점검 모드 (RV L17)
    return
  }
  const reason = !(e instanceof ApiError) ? '동기화 오류'
    : e.status === 401 ? '다시 로그인해 주세요'
    : e.code === 'tree_limit' ? '트리가 너무 많습니다(200개)'
    : e.code === 'payload_too_large' ? '트리가 너무 큽니다(5,000노드)'
    : e.message
  if (!(e instanceof ApiError)) console.error(e)
  await db.meta.put({ key: 'lastSyncError', value: reason })
  setSyncState({ kind: 'error', reason, pending })
  // 401: 세션이 끝났을 수 있다 → me 재확인 (CA refreshMe)
  if (e instanceof ApiError && e.status === 401) void import('../me').then((m) => (m as { refreshMe?: () => unknown }).refreshMe?.())
}

// ── push ────────────────────────────────────────────────────

/** outbox 를 한 번 읽어 배치로 나눠 보낸다(U08·R5-P10). 보내는 동안 바뀌거나 남은 행은 다음 바퀴에서 다시 읽는다 */
async function pushAll() {
  for (let guard = 0; guard < 100; guard++) {
    let rows = (await db.outbox.toArray()).filter((r) => !held.has(r.treeId)).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.seq! - b.seq!)
    if (!rows.length) return
    while (rows.length) {
      rows = rows.slice(await pushOnce(rows.slice(0, MAX_ROWS))).filter((r) => !held.has(r.treeId))
    }
  }
}

/** 보낸(처리한) 앞쪽 행 수를 돌려준다 — 바이트 상한으로 slice 보다 적을 수 있다 */
async function pushOnce(slice: OutboxRow[]): Promise<number> {
  const ids = (k: OutboxRow['kind']) => slice.filter((r) => r.kind === k && r.op === 'put').map((r) => r.id)
  const [ts, ns, ss, as] = await Promise.all([db.trees.bulkGet(ids('tree')), db.nodes.bulkGet(ids('node')), db.srs.bulkGet(ids('srs')), db.attempts.bulkGet(ids('attempt'))])
  const cur = new Map<string, RTree | TreeNode | NodeSrs | BlankAttempt>()
  for (const x of [...ts, ...ns, ...as].filter(isDef)) cur.set(x.id, x)
  for (const s of ss.filter(isDef)) cur.set('srs' + s.nodeId, s)

  const body = { trees: [] as Tree[], nodes: [] as TreeNode[], srs: [] as NodeSrs[], attempts: [] as BlankAttempt[], deleted: { trees: [] as { id: ID; deletedAt: number }[], nodes: [] as { id: ID; treeId: ID; deletedAt: number }[] } }
  const sent: OutboxRow[] = []
  const pos: Record<string, OutboxRow[]> = {} // 'nodes' → 보낸 순서의 outbox 행 — 400 field(nodes[3].title) 역추적용
  const at = (k: string, r: OutboxRow) => (pos[k] ??= []).push(r)
  let bytes = 0
  for (const r of slice) {
    const v = cur.get(r.kind === 'srs' ? 'srs' + r.id : r.id)
    let item: object | undefined
    if (r.kind === 'tree') {
      const t = v as RTree | undefined
      if (r.op === 'del' || t?.deletedAt) item = { id: r.id, deletedAt: t?.deletedAt ?? r.at }
      else if (t) {
        const { deletedAt: _d, hiddenByAdmin: _h, ...rest } = t
        item = rest
      }
      if (item) {
        const del = r.op === 'del' || !!t?.deletedAt
        ;(del ? body.deleted.trees : body.trees).push(item as never)
        at(del ? 'deleted.trees' : 'trees', r)
      }
    } else if (r.kind === 'node') {
      item = r.op === 'del' ? { id: r.id, treeId: r.treeId, deletedAt: r.at } : v
      if (item) {
        ;(r.op === 'del' ? body.deleted.nodes : body.nodes).push(item as never)
        at(r.op === 'del' ? 'deleted.nodes' : 'nodes', r)
      }
    } else if (v) {
      item = v
      ;(r.kind === 'srs' ? body.srs : body.attempts).push(v as never)
      at(r.kind === 'srs' ? 'srs' : 'attempts', r)
    }
    sent.push(r) // 엔티티가 사라진 put 행도 보낸 것으로 쳐서 지운다
    if (item && (bytes += enc.encode(JSON.stringify(item)).length) > MAX_BYTES) break
  }

  let res: PushRes
  try {
    res = await api<PushRes>('/api/sync', { body })
  } catch (e) {
    // C4 tree_limit: 새 트리는 격리가 아니라 보류(outbox 에 남김). 어느 트리가 새것인지 모르므로 tree put 행만 이분 탐색
    if (e instanceof ApiError && e.code === 'tree_limit') {
      const tp = sent.filter((r) => r.kind === 'tree' && r.op === 'put' && cur.has(r.id) && !(cur.get(r.id) as RTree).deletedAt)
      if (!tp.length) throw e
      if (tp.length === 1) return held.add(tp[0].treeId), sent.length
      const half = Math.ceil(tp.length / 2)
      await pushOnce(tp.slice(0, half))
      await pushOnce(tp.slice(half))
      return sent.length // 트리 아닌 행은 outbox 에 남아 다음 바퀴에 간다
    }
    // 행 하나 때문에 큐 전체가 막히지 않게: 400 invalid 는 field 로 범인 행을, 못 찾거나 payload_too_large·413 이면 반씩 나눠 격리
    if (!(e instanceof ApiError) || !(e.status === 413 || (e.status === 400 && (e.code === 'invalid' || e.code === 'payload_too_large')))) throw e
    const m = /^((?:deleted\.)?\w+)\[(\d+)\](?:\.(\w+))?/.exec(e.field ?? '')
    const hit = m ? pos[m[1]]?.[Number(m[2])] : undefined
    if (hit) return await quarantine(hit, why(e, m?.[3])), sent.length // 나머지는 다음 바퀴에
    if (sent.length === 1) return await quarantine(sent[0], why(e)), 1
    const half = Math.ceil(sent.length / 2)
    await pushOnce(sent.slice(0, half))
    await pushOnce(sent.slice(half))
    return sent.length
  }
  if (sent.filter((r) => bad.delete(r.kind + r.id)).length) await saveBad() // 다시 바뀌어 통과하면 오류 목록에서 뺀다
  if (body.deleted.trees.some((d) => res.applied.includes(d.id))) held.clear() // 자리가 났을 수 있다 → 보류 재시도
  const taken = new Set(res.id_taken ?? [])
  // 보낸 행 제거(applied·superseded·dropped 전부). 보낸 뒤 다시 바뀐 행(at 다름)은 남긴다
  await db.transaction('rw', db.outbox, async () => {
    const now = await db.outbox.bulkGet(sent.map((r) => r.seq!))
    await db.outbox.bulkDelete(sent.filter((r, i) => !taken.has(r.id) && now[i]?.at === r.at).map((r) => r.seq!))
  })
  const sup = res.superseded ?? { trees: [], nodes: [], srs: [] }
  const n = sup.trees.length + sup.nodes.length + sup.srs.length
  if (n) {
    const losers: Batch = {
      trees: sup.trees.map((t) => cur.get(t.id) as RTree).filter(isDef),
      nodes: sup.nodes.map((x) => cur.get(x.id) as TreeNode).filter(isDef),
      srs: sup.srs.map((s) => cur.get('srs' + s.nodeId) as NodeSrs).filter(isDef),
    }
    const ch = await applyRemote(sup, true)
    await rescueOrphans(ch)
    emit(ch)
    toast(`다른 기기 변경 반영됨 ${n}건`, { label: '내 버전 유지', run: () => void keepMine(losers) }, 8000)
  }
  if (taken.size) await reId(taken)
  return sent.length
}

/** tree_limit 으로 보류한 트리 id (C4). 그 트리의 outbox 행은 남겨 두고 전송만 건너뛴다. 로그인·트리 삭제 push/pull 때 비운다 */
const held = new Set<ID>()

/** 서버가 거부한 행: 로컬 데이터는 그대로 두고 outbox 에서만 뺀다. 같은 엔티티가 다시 바뀌면 track 이 새 행을 넣어 재시도된다.
 *  목록은 db.meta 'rejected' 에 영속 (C3) — 새로고침 뒤에도 오류 표시가 남는다 */
type Rejected = { kind: OutboxRow['kind']; id: ID; treeId: ID; reason: string }
const bad = new Map<string, Rejected>()
const REJ = 'rejected'
const saveBad = () => db.meta.put({ key: REJ, value: JSON.stringify([...bad.values()]) })
async function loadBad() {
  const v = await getMeta(REJ)
  const list: Rejected[] = typeof v === 'string' ? JSON.parse(v) : []
  const alive = new Set((await db.trees.bulkGet([...new Set(list.map((x) => x.treeId))])).filter(isDef).map((t) => t.id))
  bad.clear()
  for (const x of list) if (alive.has(x.treeId)) bad.set(x.kind + x.id, x) // 지워진 트리 것은 버린다
}
async function quarantine(r: OutboxRow, reason: string) {
  bad.set(r.kind + r.id, { kind: r.kind, id: r.id, treeId: r.treeId, reason })
  await saveBad()
  await db.transaction('rw', db.outbox, async () => {
    if ((await db.outbox.get(r.seq!))?.at === r.at) await db.outbox.delete(r.seq!)
  })
}
function why(e: ApiError, prop?: string): string {
  if (prop === 'title') return '제목이 너무 깁니다'
  if (prop === 'note') return '메모가 너무 깁니다'
  if (prop === 'aliases') return '별칭이 너무 많거나 깁니다'
  return e.code === 'invalid' ? '올바르지 않은 값이 있습니다' : e.message || '항목이 너무 큽니다'
}

/** "내 버전 유지": 패자 행을 updatedAt=now 로 다시 put(LWW 역이용, 04 §3.1) */
async function keepMine(l: Batch) {
  const now = Date.now()
  const treeIds = new Set<ID>()
  await db.transaction('rw', ALL(), async () => {
    await db.trees.bulkPut(l.trees.map((t) => ({ ...t, updatedAt: now })))
    await db.nodes.bulkPut(l.nodes.map((x) => ({ ...x, updatedAt: now })))
    await db.srs.bulkPut(l.srs.map((s) => ({ ...s, updatedAt: now })))
    const rows: Row[] = [
      ...l.trees.map((t) => (treeIds.add(t.id), { kind: 'tree' as const, id: t.id, treeId: t.id, op: 'put' as const })),
      ...l.nodes.map((x) => (treeIds.add(x.treeId), { kind: 'node' as const, id: x.id, treeId: x.treeId, op: 'put' as const })),
      ...l.srs.map((s) => (treeIds.add(s.treeId), { kind: 'srs' as const, id: s.nodeId, treeId: s.treeId, op: 'put' as const })),
    ]
    await track(rows)
  })
  emit(treeIds)
}

/** M5 id 충돌(C17): 다른 사용자 id 와 겹친 트리는 트리·노드 전부, 노드는 그 노드만 새 id. parentId·srs nodeId 매핑 */
async function reId(taken: Set<ID>) {
  await db.transaction('rw', ALL(), async () => {
    const tm = new Map<ID, ID>()
    const nm = new Map<ID, ID>()
    const trees = (await db.trees.bulkGet([...taken])).filter(isDef)
    for (const t of trees) tm.set(t.id, newId())
    for (const x of await db.nodes.where('treeId').anyOf([...tm.keys()]).toArray()) nm.set(x.id, newId())
    for (const id of taken) if (!tm.has(id) && !nm.has(id) && (await db.nodes.get(id))) nm.set(id, newId())
    const old = [...nm.keys()]
    const moved = (await db.nodes.bulkGet(old)).filter(isDef)
    const kids = await db.nodes.where('parentId').anyOf(old).toArray()
    const touched = [...new Map([...moved, ...kids].map((x) => [x.id, x])).values()].map((x) => ({
      ...x, id: nm.get(x.id) ?? x.id, treeId: tm.get(x.treeId) ?? x.treeId, parentId: x.parentId ? (nm.get(x.parentId) ?? x.parentId) : null,
    }))
    const srs = (await db.srs.bulkGet(old)).filter(isDef).map((s) => ({ ...s, nodeId: nm.get(s.nodeId)!, treeId: tm.get(s.treeId) ?? s.treeId }))
    await db.nodes.bulkDelete(old)
    await db.nodes.bulkPut(touched)
    await db.srs.bulkDelete(old)
    await db.srs.bulkPut(srs)
    await db.trees.bulkDelete([...tm.keys()])
    await db.trees.bulkPut(trees.map((t) => ({ ...t, id: tm.get(t.id)! })))
    await db.attempts.where('treeId').anyOf([...tm.keys()]).modify((a) => {
      a.treeId = tm.get(a.treeId)!
      a.rootId = nm.get(a.rootId) ?? a.rootId
    })
    const gone = new Set([...tm.keys(), ...old])
    await db.outbox.filter((o) => gone.has(o.id)).delete()
    await track([
      ...[...tm.values()].map((id) => ({ kind: 'tree' as const, id, treeId: id, op: 'put' as const })),
      ...touched.map((x) => ({ kind: 'node' as const, id: x.id, treeId: x.treeId, op: 'put' as const })),
      ...srs.map((s) => ({ kind: 'srs' as const, id: s.nodeId, treeId: s.treeId, op: 'put' as const })),
    ])
  })
}

// ── pull ────────────────────────────────────────────────────

async function pull() {
  try {
    await pullFrom(Number(await getMeta('cursor')) || 0)
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 410)) throw e
    // C18 커서 만료: outbox 먼저 비우고 since=0 스냅샷 → M4 "이 기기에만 있는 트리"는 기본값 '올리기' 자동 적용
    await pushAll()
    const seen = await pullFrom(0)
    const only = (await live()).filter((t) => !seen.has(t.id))
    if (only.length) {
      await enqueueAll(only.map((t) => t.id))
      await pushAll()
      toast(`이 기기에만 있던 트리 ${only.length}개를 계정에 올렸습니다`)
    }
  }
}

/** since 부터 more 가 끝날 때까지. 받은 트리 id(톰스톤 포함)를 돌려준다 */
async function pullFrom(since: number): Promise<Set<ID>> {
  const seen = new Set<ID>()
  const changed = new Set<ID>()
  pullDone = false
  for (let guard = 0; guard < 1000; guard++) {
    const r = await api<PullRes>(`/api/sync?since=${since}`)
    for (const t of r.trees) seen.add(t.id)
    const ch = await applyRemote(r, false)
    ch.forEach((id) => changed.add(id))
    emit(ch)
    await db.meta.put({ key: 'cursor', value: r.seq })
    since = r.seq
    // D1: 고아 복구는 마지막 페이지까지 받은 뒤 1회. 중간에 끊기면(throw) 건너뛴다 — 부모가 뒤 페이지에 있을 수 있다
    if (!r.more) {
      pullDone = true
      emit(await rescueOrphans(changed))
      break
    }
  }
  return seen
}

/**
 * 서버 행 적용(sequences S2). force=false: 로컬에 보내지 않은 변경(outbox)이 더 나중이면 로컬 유지(다음 push 가 이김).
 * force=true: push 응답 superseded — 서버가 이겼다. 트리 톰스톤은 deletedAt 만 반영(휴지통, C2), 노드 톰스톤은 하드 삭제.
 * 고아 복구는 호출자가 rescueOrphans 로(D1). 바뀐 트리 id 반환
 */
async function applyRemote(r: Batch, force: boolean): Promise<Set<ID>> {
  const changed = new Set<ID>()
  await db.transaction('rw', ALL(), async () => {
    const pend = new Map((await db.outbox.toArray()).map((o) => [o.kind + o.id, o]))
    const localWins = (key: string, localAt: number | undefined, remoteAt: number) => !force && pend.has(key) && (localAt ?? pend.get(key)!.at) >= remoteAt

    for (const t of r.trees ?? []) {
      const { deletedAt, ...rest } = t
      const local: RTree | undefined = await db.trees.get(t.id)
      const serverOwned = { visibility: t.visibility, slug: t.slug, hiddenByAdmin: t.hiddenByAdmin } // 서버가 진실 (04 §3.2)
      if (localWins('tree' + t.id, local && (local.deletedAt ?? local.updatedAt), deletedAt ?? t.updatedAt)) {
        if (local) await db.trees.update(t.id, JSON.parse(JSON.stringify(serverOwned)))
        continue
      }
      if (deletedAt) {
        // C2: 하드 삭제 대신 톰스톤 보존 → 휴지통에 보인다. 노드는 그대로, 로컬 purge 는 7일 뒤 repo.purgeDeletedTrees
        held.clear() // 다른 기기 삭제로 자리가 났을 수 있다
        if (!local || local.deletedAt === deletedAt) continue
        await db.trees.put({ ...local, ...rest, deletedAt })
      } else {
        if (local && !local.deletedAt && local.updatedAt === t.updatedAt && local.slug === t.slug && local.visibility === t.visibility && !!local.hiddenByAdmin === !!t.hiddenByAdmin) continue
        const next: RTree = { ...local, ...rest }
        delete next.deletedAt
        await db.trees.put(next)
      }
      changed.add(t.id)
    }

    for (const x of r.nodes ?? []) {
      const { deletedAt, ...rest } = x
      const local = await db.nodes.get(x.id)
      if (localWins('node' + x.id, local?.updatedAt, deletedAt ?? x.updatedAt)) continue
      if (deletedAt) {
        if (!local) continue
        await db.nodes.delete(x.id)
        await db.srs.delete(x.id)
      } else {
        if (local?.updatedAt === x.updatedAt) continue // 내 push 의 메아리
        await db.nodes.put(rest)
      }
      changed.add(x.treeId)
    }

    const resend: Row[] = []
    for (const s of r.srs ?? []) {
      const { deletedAt, ...rest } = s
      const local = await db.srs.get(s.nodeId)
      const days = [...new Set([...(local?.autoCorrectDays ?? []), ...(rest.autoCorrectDays ?? [])])].sort()
      if (localWins('srs' + s.nodeId, local?.updatedAt, deletedAt ?? s.updatedAt)) {
        if (local && days.length !== local.autoCorrectDays.length) await db.srs.update(s.nodeId, { autoCorrectDays: days })
        continue
      }
      if (deletedAt) {
        if (local) await db.srs.delete(s.nodeId)
        continue
      }
      if (local?.updatedAt === s.updatedAt && days.length === local.autoCorrectDays.length) continue
      await db.srs.put({ ...rest, autoCorrectDays: days }) // autoCorrectDays 합집합 (04 §3.2)
      if (days.length !== (rest.autoCorrectDays ?? []).length) resend.push({ kind: 'srs', id: s.nodeId, treeId: s.treeId, op: 'put' })
      changed.add(s.treeId)
    }
    await track(resend)
  })
  return changed
}

/** 고아(부모가 없는 노드) → 루트 자식으로, updatedAt=now, 다시 push (C8·C9). pull 전체가 끝난 뒤나 superseded 적용 직후에만 (D1) */
async function rescueOrphans(changed: Set<ID>): Promise<Set<ID>> {
  const hit = new Set<ID>()
  await db.transaction('rw', ALL(), async () => {
    const resend: Row[] = []
    let orphans = 0
    const now = Date.now()
    for (const treeId of changed) {
      const ns = await db.nodes.where('treeId').equals(treeId).toArray()
      const root = ns.find((x) => x.parentId === null)
      if (!root) continue
      const ids = new Set(ns.map((x) => x.id))
      for (const x of ns) {
        if (x.parentId === null || ids.has(x.parentId)) continue
        await db.nodes.put({ ...x, parentId: root.id, updatedAt: now })
        resend.push({ kind: 'node', id: x.id, treeId, op: 'put' })
        hit.add(treeId)
        orphans++
      }
    }
    await track(resend)
    if (orphans) setTimeout(() => toast(`복구된 노드 ${orphans}개를 루트 아래 두었습니다`))
  })
  return hit
}

// ── 병합 (04 §3.8) ──────────────────────────────────────────

/** 로컬 트리(삭제 대기 제외)와 그 노드·srs·attempts 를 outbox 에 넣는다. 호출 전 meta.userId 가 있어야 한다 */
async function enqueueAll(treeIds: ID[]) {
  await db.transaction('rw', ALL(), async () => {
    const [ns, ss, as] = await Promise.all([db.nodes.where('treeId').anyOf(treeIds).toArray(), db.srs.where('treeId').anyOf(treeIds).toArray(), db.attempts.where('treeId').anyOf(treeIds).toArray()])
    await track([
      ...treeIds.map((id) => ({ kind: 'tree' as const, id, treeId: id, op: 'put' as const })),
      ...parentFirst(ns).map((x) => ({ kind: 'node' as const, id: x.id, treeId: x.treeId, op: 'put' as const })),
      ...ss.map((s) => ({ kind: 'srs' as const, id: s.nodeId, treeId: s.treeId, op: 'put' as const })),
      ...as.map((a) => ({ kind: 'attempt' as const, id: a.id, treeId: a.treeId, op: 'put' as const })),
    ])
  })
}

/** 부모가 자식보다 먼저(BFS). 서버 seq 도 이 순서로 붙어 다른 기기 pull 페이지에서 부모가 앞선다 (D1) */
function parentFirst(ns: TreeNode[]): TreeNode[] {
  const ids = new Set(ns.map((x) => x.id))
  const kids = new Map<ID, TreeNode[]>()
  const out = ns.filter((x) => x.parentId === null || !ids.has(x.parentId))
  for (const x of ns) if (x.parentId !== null && ids.has(x.parentId)) (kids.get(x.parentId) ?? kids.set(x.parentId, []).get(x.parentId)!).push(x)
  for (let i = 0; i < out.length; i++) out.push(...(kids.get(out[i].id) ?? []))
  const got = new Set(out)
  return out.length === ns.length ? out : [...out, ...ns.filter((x) => !got.has(x))] // 순환 등 남은 것도 빠짐없이
}

async function serverCount(): Promise<number> {
  try {
    return (await api<{ trees: unknown[] }>('/api/trees')).trees.length
  } catch {
    return 0 // 오프라인 — 대화는 로컬 수만으로
  }
}

export async function onLogin(userId: string): Promise<MergePlan> {
  const cur = await getMeta('userId')
  if (cur === userId) {
    await start()
    return { local: 0, server: 0, otherAccount: null }
  }
  const local = (await live()).length
  const server = await serverCount()
  if (cur) {
    pendingUser = userId // M3: 다른 계정 데이터 — 대화 결과(wipe_other·copy_other)를 기다린다
    return { local, server, otherAccount: String(cur) }
  }
  if (!local) {
    // L=0: 대화 없이 바로 내려받기
    await db.meta.bulkPut([{ key: 'userId', value: userId }, { key: 'cursor', value: 0 }])
    await start()
    return { local: 0, server, otherAccount: null }
  }
  pendingUser = userId // M1·M2: 대화 결과(upload)를 기다린다
  return { local, server, otherAccount: null }
}

export async function applyMerge(choice: MergeChoice): Promise<void> {
  const userId = pendingUser
  if (!userId) return
  pendingUser = null
  if (choice === 'wipe_other') {
    await db.transaction('rw', ALL(), () => Promise.all(ALL().map((t) => t.clear())))
  } else if (choice === 'copy_other') {
    await rekeyAll()
  }
  await db.transaction('rw', db.meta, db.outbox, async () => {
    await db.meta.clear()
    await db.meta.bulkPut([{ key: 'userId', value: userId }, { key: 'cursor', value: 0 }])
  })
  await enqueueAll((await live()).map((t) => t.id))
  emit((await db.trees.toArray()).map((t) => t.id))
  await start() // push → pull(since=0)
}

/** M3 "이 계정으로 복제": 모든 로컬 트리를 새 id 로(sourceTreeId 없음, SRS·attempts 비움), 옛 outbox 버림 */
async function rekeyAll() {
  await db.transaction('rw', ALL(), async () => {
    const trees = await live()
    const nodes = await db.nodes.toArray()
    const tm = new Map(trees.map((t) => [t.id, newId()]))
    const nm = new Map(nodes.map((x) => [x.id, newId()]))
    await Promise.all([db.trees, db.nodes, db.srs, db.attempts, db.outbox].map((t) => t.clear()))
    await db.trees.bulkAdd(trees.map(({ sourceTreeId: _s, slug: _g, visibility: _v, ...t }) => ({ ...t, id: tm.get(t.id)! })))
    await db.nodes.bulkAdd(nodes.filter((x) => tm.has(x.treeId)).map((x) => ({ ...x, id: nm.get(x.id)!, treeId: tm.get(x.treeId)!, parentId: x.parentId ? (nm.get(x.parentId) ?? null) : null })))
  })
}
