// 실행: npx tsx src/core/repo.check.ts — 목록 정렬·메타·검색(U42·U43·U44)
import { matchTitle, summarizeTrees, takeHeldSrs } from './repo'
import type { NodeSrs, Tree } from './types'

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const t = (id: string, updatedAt: number, deletedAt?: number): Tree => ({ id, title: id, createdAt: 0, updatedAt, deletedAt })
const r = summarizeTrees(
  [t('a', 100), t('b', 200), t('gone', 999, 1)],
  [{ treeId: 'a', card: { lastReviewAt: new Date(300) } }, { treeId: 'a', card: { lastReviewAt: '1970-01-01T00:00:00.010Z' } }],
  ['a', 'a', 'a', 'b', 'gone'],
)
ok(r.map((x) => x.tree.id).join() === 'a,b', `학습한 트리가 위, 삭제 제외: ${r.map((x) => x.tree.id)}`)
ok(r[0].nodes === 3 && !('due' in r[0]) && r[0].studiedAt === 300 && r[0].usedAt === 300, `a 메타 ${JSON.stringify(r[0])}`)
ok(r[1].nodes === 1 && r[1].studiedAt === undefined && r[1].usedAt === 200, `b 메타 ${JSON.stringify(r[1])}`)
ok(matchTitle('민법 총', '민법총칙') && matchTitle('TCP', 'tcp 핸드셰이크') && !matchTitle('형법', '민법'), 'matchTitle')
// E3: 지운 노드의 srs 보관 → 같은 id 가 돌아오면 새 updatedAt 으로 한 번만 돌려준다
{
  const s: NodeSrs = { nodeId: 'n1', treeId: 't', card: {}, due: 1, lastGradeSource: null, lastStructure: null, autoCorrectDays: [], pendingRecheck: false, miss: 2, updatedAt: 100 }
  const held = new Map([[s.nodeId, s]])
  const back = takeHeldSrs(held, [{ id: 'n1' }, { id: 'other' }], 500)
  ok(back.length === 1 && back[0].updatedAt === 500 && back[0].miss === 2 && s.updatedAt === 100, `srs 복원 ${JSON.stringify(back)}`)
  ok(held.size === 0 && takeHeldSrs(held, [{ id: 'n1' }], 600).length === 0, '보관분은 한 번만 돌려준다')
}
console.log('repo.check ok')
