// 실행: npx tsx src/core/backup.check.ts — parseBackup 형식·한도 검사 (U04), planImport 재매핑·updatedAt (F18)
import { parseBackup, planImport } from './backup'

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

// F18: 가져온 행은 전부 updatedAt=now (서버의 더 나중 톰스톤·수정에 지지 않게). id 충돌 없으면 id 그대로
const NOW = 777_000
const keep = planImport(b, new Set(), NOW)
ok(keep.copied === 0 && keep.trees[0].id === 't1' && keep.nodes.every((n) => n.treeId === 't1'), 'no collision: ids kept')
ok([...keep.trees, ...keep.nodes, ...keep.srs].every((r) => r.updatedAt === NOW), 'all imported rows stamped with now')
ok(keep.nodes.find((n) => n.id === 'a')!.parentId === 'r', 'parent kept')
// 충돌: 트리·노드 새 id, parentId·srs.nodeId 재매핑, 공유 상태 초기화
let seq = 0
const copy = planImport(b, new Set(['t1']), NOW, () => `new${++seq}`)
ok(copy.copied === 1 && copy.trees[0].id === 'new1' && copy.trees[0].visibility === 'private' && copy.trees[0].slug === null, 'collision: tree copied')
const root = copy.nodes.find((n) => n.parentId === null)!, child = copy.nodes.find((n) => n.parentId !== null)!
ok(root.id === 'new2' && child.parentId === 'new2' && child.treeId === 'new1', 'collision: node ids and parentId remapped')
ok(copy.srs.length === 1 && copy.srs[0].nodeId === child.id && copy.srs[0].treeId === 'new1' && copy.srs[0].updatedAt === NOW, 'collision: srs follows node')
console.log('backup.check ok')
