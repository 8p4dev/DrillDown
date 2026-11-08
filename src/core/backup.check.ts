// 실행: npx tsx src/core/backup.check.ts — parseBackup 형식·한도 검사 (U04)
import { parseBackup } from './backup'

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg) }
const err = (f: () => unknown) => { try { f() } catch (e) { return (e as Error).message } return '' }
const tree = { id: 't1', title: 'T', createdAt: 1, updatedAt: 1 }
const node = (id: string, parentId: string | null) => ({ id, treeId: 't1', parentId, order: 0, title: id, aliases: [], updatedAt: 1 })
const file = (o: object) => JSON.stringify({ trees: [tree], nodes: [node('r', null), node('a', 'r')], srs: [{ nodeId: 'a', treeId: 't1' }], ...o })

const b = parseBackup(file({}), 0)
ok(b.trees.length === 1 && b.nodes.length === 2 && b.srs.length === 1, 'valid file parses')
ok(err(() => parseBackup('nope', 0)).includes('JSON'), 'non-JSON rejected')
ok(err(() => parseBackup('{"events":[]}', 0)).includes('trees'), 'old export without trees rejected')
ok(err(() => parseBackup(file({}), 200)).includes('200개'), 'tree CAP')
ok(err(() => parseBackup(file({ nodes: Array.from({ length: 5001 }, (_, i) => node('n' + i, null)) }), 0)).includes('5,000'), 'node CAP')
ok(parseBackup(file({ trees: [tree, { ...tree, id: 'gone', deletedAt: 5 }] }), 0).trees.length === 1, 'deleted trees skipped')
console.log('backup.check ok')
