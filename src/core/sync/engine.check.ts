// 실행: npx tsx src/core/sync/engine.check.ts — 동기화 엔진(push/pull·LWW·고아·410·reId·track) 을 fake-indexeddb + fetch 스텁으로 돈다.
// 브라우저 전역(window·document·navigator·dispatchEvent)은 엔진·Toast 가 쓰는 최소만 흉내 낸다. 시나리오는 순서대로 한 DB 에서 이어진다.
import 'fake-indexeddb/auto'

const et = new EventTarget()
const armed: number[] = [] // Toast 가 window.setTimeout 으로 켠 ms — "다른 기기 변경 반영됨" 토스트(8000) 가 떴는지 본다
Object.assign(globalThis, {
  // 토스트 타이머(8초)는 unref — 끝난 뒤 프로세스를 붙잡지 않게
  window: { setTimeout: (f: () => void, ms: number) => { armed.push(ms); const t = setTimeout(f, ms); (t as unknown as { unref?: () => void }).unref?.(); return t } },
  document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' },
  addEventListener: et.addEventListener.bind(et),
  removeEventListener: et.removeEventListener.bind(et),
  dispatchEvent: et.dispatchEvent.bind(et),
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true })

type Res = { status?: number; json?: unknown }
type Handler = (url: string, body: Record<string, unknown>) => Res | Promise<Res>
const queue: Handler[] = [] // 호출 순서대로 소비되는 응답. 모자라면 throw → ApiError(0) 로 보여 단언이 잡는다
const calls: { url: string; body?: Record<string, unknown> }[] = []
const json = (o: unknown, status: number) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  if (url === '/api/me') return json({ error: { code: 'unauthorized', message: '' } }, 401) // 409 뒤 refreshMe — 시나리오 밖
  calls.push({ url, body })
  const h = queue.shift()
  if (!h) throw new Error(`예정에 없는 요청 ${url}`)
  const r = await h(url, body)
  return json(r.json ?? {}, r.status ?? 200)
}) as typeof fetch

const { db, track } = await import('../db')
const { onLogin, sync } = await import('./engine')
const { TRASH_MS } = await import('../repo')
type Tree = import('../types').Tree
type TreeNode = import('../types').TreeNode
type NodeSrs = import('../types').NodeSrs

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const T = (id: string, updatedAt: number): Tree => ({ id, title: id, createdAt: updatedAt, updatedAt })
const N = (id: string, treeId: string, parentId: string | null, updatedAt: number): TreeNode => ({ id, treeId, parentId, order: 0, title: id, aliases: [], updatedAt })
const S = (nodeId: string, treeId: string, updatedAt: number): NodeSrs => ({ nodeId, treeId, card: {}, due: 0, lastGradeSource: null, lastStructure: null, autoCorrectDays: [], pendingRecheck: false, updatedAt })
const ALL = () => [db.trees, db.nodes, db.srs, db.attempts, db.outbox, db.meta]
const applied = (ids: string[], extra: Record<string, unknown> = {}) => ({ json: { seq: 1, applied: ids, superseded: { trees: [], nodes: [], srs: [] }, dropped: [], id_taken: [], ...extra } })
const pull = (nodes: TreeNode[], seq: number, trees: Tree[] = []) => ({ json: { seq, more: false, trees, nodes, srs: [] } })
const pushCalls = () => calls.filter((c) => c.url === '/api/sync' && c.body)
/** 로컬 행을 넣고 outbox 에 올린다(사용자가 쓴 것처럼) */
async function write(trees: Tree[], nodes: TreeNode[], srs: NodeSrs[] = [], tracked = true) {
  await db.transaction('rw', ALL(), async () => {
    await db.trees.bulkPut(trees)
    await db.nodes.bulkPut(nodes)
    await db.srs.bulkPut(srs)
    if (tracked) await track([
      ...trees.map((t) => ({ kind: 'tree' as const, id: t.id, treeId: t.id, op: 'put' as const })),
      ...nodes.map((n) => ({ kind: 'node' as const, id: n.id, treeId: n.treeId, op: 'put' as const })),
      ...srs.map((s) => ({ kind: 'srs' as const, id: s.nodeId, treeId: s.treeId, op: 'put' as const })),
    ])
  })
}

await db.meta.bulkPut([{ key: 'userId', value: 'u1' }, { key: 'cursor', value: 0 }])

// ── track: 같은 엔티티는 제자리 갱신(seq 유지·at 단조) ──
{
  const row = { kind: 'node' as const, id: 'n0', treeId: 't0', op: 'put' as const }
  await track([row])
  const a = (await db.outbox.toArray())[0]
  await track([row])
  const rows = await db.outbox.toArray()
  ok(rows.length === 1 && rows[0].seq === a.seq && rows[0].at > a.at, `track 제자리 갱신 ${JSON.stringify([a, rows[0]])}`)
  await db.outbox.clear()
}

// ── M1: updatedAt 이 같은 superseded(내 push 의 메아리)는 집계·토스트에서 제외 ──
{
  await write([T('TA', 1000)], [N('RA', 'TA', null, 1000), N('YA', 'TA', 'RA', 1000)])
  queue.push(() => applied(['TA', 'RA', 'YA'], { superseded: { trees: [], nodes: [N('YA', 'TA', 'RA', 1000)], srs: [] } }))
  queue.push(() => pull([], 1))
  await onLogin('u1') // cur === userId → start() → sync()
  ok(queue.length === 0 && pushCalls().length === 1, `M1 호출 ${calls.length}`)
  ok(armed.length === 0, `같은 updatedAt superseded 는 토스트 없음 ${armed}`)
  ok((await db.outbox.count()) === 0 && (await db.nodes.get('YA'))!.updatedAt === 1000, 'M1 outbox 비움·행 그대로')
  ok((await db.meta.get('cursor'))!.value === 1, 'cursor 갱신')
}

// ── H1: superseded 로 받은 노드의 부모(PB)가 아직 pull 전이면 루트로 끌어내리지 않는다. pull 로 PB 가 오면 고아가 아니다 ──
{
  await write([T('TB', 2000)], [N('RB', 'TB', null, 2000), N('XB', 'TB', 'RB', 2000)])
  const xbServer = N('XB', 'TB', 'PB', 3000)
  queue.push(() => applied(['TB', 'RB', 'XB'], { superseded: { trees: [], nodes: [xbServer], srs: [] } }))
  queue.push(async () => {
    const x = (await db.nodes.get('XB'))!
    ok(x.parentId === 'PB' && x.updatedAt === 3000, `superseded 직후 고아 복구 금지(H1): ${JSON.stringify(x)}`)
    ok((await db.outbox.count()) === 0, 'H1 재push 행 없음')
    return pull([N('PB', 'TB', 'RB', 3000), xbServer], 2)
  })
  await sync()
  ok(queue.length === 0 && pushCalls().length === 2, 'H1 호출 수')
  const x = (await db.nodes.get('XB'))!
  ok(x.parentId === 'PB' && x.updatedAt === 3000 && (await db.nodes.get('PB')) && (await db.outbox.count()) === 0, `H1 pull 뒤 구조 유지 ${JSON.stringify(x)}`)
  ok(armed.includes(8000), `다른 updatedAt superseded 는 토스트 ${armed}`)
}

// ── reId: id_taken 트리는 트리·노드 전부 새 id, parentId·srs·attempts 매핑, 새 행 push ──
{
  await write([T('TC', 4000)], [N('RC', 'TC', null, 4000), N('CC', 'TC', 'RC', 4000)], [S('CC', 'TC', 4000)])
  await db.attempts.put({ id: 'AT', treeId: 'TC', rootId: 'RC', startedAt: 1, completedAt: 2, nodeRecall: 1, edgeAccuracy: 1, autoGradedCount: 1, selfGradedCount: 0, overriddenCount: 0 })
  queue.push(() => applied([], { id_taken: ['TC'], dropped: ['CC'] }))
  let second: Record<string, unknown> | undefined
  queue.push((_u, body) => { second = body; return applied([]) })
  await sync(false)
  ok(queue.length === 0 && second, 'reId 뒤 새 id 로 다시 push')
  const trees = (await db.trees.toArray()).filter((t) => t.title === 'TC')
  const tree = trees[0]
  ok(trees.length === 1 && tree.id !== 'TC' && !(await db.trees.get('TC')), 'reId 트리')
  const ns = await db.nodes.where('treeId').equals(tree.id).toArray()
  const root = ns.find((n) => n.parentId === null)!, child = ns.find((n) => n.parentId !== null)!
  ok(ns.length === 2 && root.id !== 'RC' && child.id !== 'CC' && child.parentId === root.id && !(await db.nodes.get('CC')), `reId 노드 ${JSON.stringify(ns)}`)
  const srs = await db.srs.where('treeId').equals(tree.id).toArray()
  ok(srs.length === 1 && srs[0].nodeId === child.id && !(await db.srs.get('CC')), 'reId srs 매핑')
  const at = (await db.attempts.get('AT'))!
  ok(at.treeId === tree.id && at.rootId === root.id, `reId attempts 매핑 ${JSON.stringify(at)}`)
  const b = second as { trees: Tree[]; nodes: TreeNode[]; srs: NodeSrs[] }
  ok(b.trees[0]?.id === tree.id && b.nodes.map((n) => n.id).sort().join() === [root.id, child.id].sort().join() && b.srs[0]?.nodeId === child.id, '두 번째 push 본문 = 새 id')
  ok((await db.outbox.count()) === 0, 'reId outbox 비움')
}

// ── 410 전체 재동기화: 서버에 없는 로컬 트리 — 7일 안 수정·보류(held) 는 다시 올리고, 나머지는 로컬 휴지통 ──
{
  const now = Date.now(), old = now - TRASH_MS - 86_400_000
  await write([T('T1', now), T('T2', old), T('T3', now)], [N('R1', 'T1', null, now), N('R2', 'T2', null, old), N('R3', 'T3', null, now)], [], false)
  await write([T('T4', old)], [N('R4', 'T4', null, old)]) // outbox 에 있는 유일한 트리 → tree_limit 으로 보류
  queue.push(() => ({ status: 400, json: { error: { code: 'tree_limit', message: '' } } }))
  queue.push(() => ({ status: 410, json: { error: { code: 'cursor_expired', message: '' } } }))
  queue.push(() => pull([], 10, [T('T1', now)]))
  let up: Record<string, unknown> | undefined
  queue.push((_u, body) => { up = body; return applied(['T3', 'R3']) })
  await sync()
  ok(queue.length === 0 && up, '410 뒤 다시 올리기 push')
  const [t2, t3, t4] = await db.trees.bulkGet(['T2', 'T3', 'T4'])
  ok(!!t2!.deletedAt && !t3!.deletedAt && !t4!.deletedAt, `분류: T2 휴지통, T3·T4 유지 ${JSON.stringify([t2, t3, t4])}`)
  ok((up as { trees: Tree[] }).trees.map((t) => t.id).join() === 'T3', `다시 올린 트리 = T3 만 ${JSON.stringify((up as { trees: Tree[] }).trees.map((t) => t.id))}`)
  const left = await db.outbox.toArray()
  ok(left.length === 2 && left.every((r) => r.treeId === 'T4'), `보류 트리 행만 남음 ${JSON.stringify(left)}`)
  ok((await db.meta.get('cursor'))!.value === 10, 'since=0 스냅샷 cursor')
}

// ── 계약 A: push 본문 userId, 409 user_mismatch → 엔진 stop(다음 sync 는 요청하지 않음) ──
{
  await write([], [N('Z1', 'T1', 'R1', Date.now())])
  queue.push((_u, body) => {
    ok(body.userId === 'u1', `push 본문 userId ${JSON.stringify(body.userId)}`)
    return { status: 409, json: { error: { code: 'user_mismatch', message: '' } } }
  })
  await sync(false)
  const n = calls.length
  await sync(false)
  ok(queue.length === 0 && calls.length === n && (await db.outbox.where('[kind+id]').equals(['node', 'Z1']).count()) === 1, '409 뒤 엔진 정지 — 요청 없음, outbox 유지')
}

console.log('engine.check ok')
