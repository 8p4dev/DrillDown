// 실행: npx tsx src/core/repo.check.ts — 목록 정렬·메타·검색(U42·U43·U44)
import { matchTitle, summarizeTrees } from './repo'
import type { Tree } from './types'

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const t = (id: string, updatedAt: number, deletedAt?: number): Tree => ({ id, title: id, createdAt: 0, updatedAt, deletedAt })
const r = summarizeTrees(
  [t('a', 100), t('b', 200), t('gone', 999, 1)],
  [{ treeId: 'a', due: 50, card: { lastReviewAt: new Date(300) } }, { treeId: 'a', due: 500, card: { lastReviewAt: '1970-01-01T00:00:00.010Z' } }],
  ['a', 'a', 'a', 'b', 'gone'],
  100,
)
ok(r.map((x) => x.tree.id).join() === 'a,b', `학습한 트리가 위, 삭제 제외: ${r.map((x) => x.tree.id)}`)
ok(r[0].nodes === 3 && r[0].due === 1 && r[0].studiedAt === 300 && r[0].usedAt === 300, `a 메타 ${JSON.stringify(r[0])}`)
ok(r[1].nodes === 1 && r[1].due === 0 && r[1].studiedAt === undefined && r[1].usedAt === 200, `b 메타 ${JSON.stringify(r[1])}`)
ok(matchTitle('민법 총', '민법총칙') && matchTitle('TCP', 'tcp 핸드셰이크') && !matchTitle('형법', '민법'), 'matchTitle')
console.log('repo.check ok')
