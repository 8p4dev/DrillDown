// [mock] 공유 트리·갤러리 스토어 — 공유 계약 orchestration_ui_first.md §3.4 (SH 소유). 04 §3.4·§3.5.
// 서버 구현 때 getSharedTree 는 GET /api/t/:slug, listGallery 는 GET /api/gallery 로 바뀌고 시그니처는 그대로.
import type { GalleryItem, ReportReason, SharedTree } from '../api'
import type { TreeNode } from '../types'

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
/** 11자 base58 slug (04 §3.3). 서버가 생기면 서버가 발급한다 */
export function mockIssueSlug(): string {
  const b = crypto.getRandomValues(new Uint8Array(11))
  return [...b].map((x) => BASE58[x % 58]).join('')
}

// ── 데모 트리: 들여쓰기(2칸) 개요. "제목 | 내용 | 별칭,별칭" ─────────────────
const LABOR = `근로기준법 | 근로조건의 최저기준을 정한 법 | 근기법
  근로계약 | 사용자와 근로자가 근로조건을 정하는 계약
    근로조건 명시 | ==y:임금·소정근로시간·휴일·연차== 서면 명시 의무
    위약 예정 금지 | 손해배상액 예정 계약 금지 | 위약금 금지
    전차금 상계 금지 | 임금과 전차금의 상계 금지
  임금 | 근로의 대가로 지급하는 일체의 금품
    통상임금 | 정기적·일률적·고정적으로 지급되는 임금
    평균임금 | 산정 사유 발생일 이전 3개월 임금 총액 ÷ 총일수
    최저임금 | 매년 고시, 위반 시 ==p:3년 이하 징역==
    임금 지급 4원칙 | - 통화 지급 ⏎ - 직접 지급 ⏎ - 전액 지급 ⏎ - 매월 1회 이상 정기 지급 | 4원칙
  근로시간 | 1주 40시간, 1일 8시간
    연장근로 | 당사자 합의 시 1주 12시간 한도 | 시간외근로
    휴게 | 4시간에 30분, 8시간에 1시간 이상
    야간근로 | 22시~06시, 가산 50% | 야간
  휴일·휴가 | 유급휴일과 연차유급휴가
    주휴일 | 1주 개근 시 1일 유급휴일 | 주휴
    연차유급휴가 | 1년 80% 이상 출근 시 15일 | 연차
    가산임금 | 연장·야간·휴일 50% 이상 가산
  해고 | 사용자의 일방적 근로관계 종료
    정당한 이유 | 해고에는 정당한 이유가 있어야 함
    해고 예고 | 30일 전 예고 또는 30일분 통상임금 | 해고예고수당
    서면 통지 | 사유와 시기를 서면으로 통지해야 효력
    부당해고 구제 | 노동위원회에 3개월 이내 신청 | 구제신청
  취업규칙 | 상시 10명 이상 사업장 작성·신고 의무
    불이익 변경 | 근로자 과반수 동의 필요`

const CIVIL = `민법 총칙 | 민법 전체에 공통되는 일반 원칙 | 총칙
  권리의 주체 | 자연인과 법인
    권리능력 | 출생으로 취득, 사망으로 소멸
    행위능력 | 단독으로 유효한 법률행위를 할 수 있는 능력
    제한능력자 | 미성년자·피성년후견인·피한정후견인
    법인 | 사단법인과 재단법인
  법률행위 | 의사표시를 요소로 하는 법률요건
    의사표시 | 효과의사를 외부에 표시하는 행위
    비진의표시 | 원칙 유효, 상대방이 알았거나 알 수 있었으면 무효 | 진의 아닌 의사표시
    통정허위표시 | 상대방과 통정한 허위 표시는 ==y:무효==, 선의의 제3자에게 대항 불가 | 허위표시
    착오 | 중요부분 착오는 취소 가능, 중과실이면 불가
    사기·강박 | 취소 가능, 선의의 제3자에게 대항 불가
  대리 | 대리인의 행위 효과가 본인에게 귀속
    현명주의 | 본인을 위한 것임을 표시
    무권대리 | 본인의 추인이 있어야 효력
    표현대리 | 외관을 신뢰한 상대방 보호
  소멸시효 | 권리 불행사 상태가 계속되면 권리 소멸
    시효기간 | 채권 ==p:10년==, 일반 채권 외 20년
    시효 중단 | 청구·압류·승인
    시효 이익 포기 | 완성 후에만 가능`

function expand(slug: string, outline: string): TreeNode[] {
  const nodes: TreeNode[] = []
  const stack: { depth: number; id: string }[] = []
  const orders = new Map<string | null, number>()
  const updatedAt = Date.UTC(2026, 10, 1)
  outline.split('\n').forEach((raw, i) => {
    const depth = raw.search(/\S/) / 2
    const [title, note, aliases] = raw.trim().split(' | ').map((s) => s?.trim())
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop()
    const parentId = stack.length ? stack[stack.length - 1].id : null
    const order = orders.get(parentId) ?? 0
    orders.set(parentId, order + 1)
    const id = `${slug}-${i}`
    nodes.push({ id, treeId: slug, parentId, order, title, note: note?.replaceAll(' ⏎ ', '\n') || undefined, aliases: aliases ? aliases.split(',').map((a) => a.trim()) : [], updatedAt })
    stack.push({ depth, id })
  })
  return nodes
}

const demo = (slug: string, outline: string, owner: string, copies: number, daysAgo: number): SharedTree => {
  const nodes = expand(slug, outline)
  return { slug, title: nodes[0].title, visibility: 'public', owner: { nickname: owner, avatar_url: null }, node_count: nodes.length, copy_count: copies, updated_at: Date.now() - daysAgo * 86400_000, nodes }
}

const trees = new Map<string, SharedTree>()
for (const t of [demo('3fK9pQ2xT7m', LABOR, '김수험', 42, 2), demo('Bn7Rt2Lp9Wq', CIVIL, '민법러', 17, 9)]) trees.set(t.slug, t)

// 가명 트리 18개: 제목 풀 × 결정적 slug(새로고침해도 같은 링크). 내용은 "항목 n" 자식만
const TITLES = ['행정법 총론', '헌법 기본권', '형법 총칙', '상법 회사편', '세법 개론', '경제학 미시', '회계원리', '한국사 근현대', '영어 문법 핵심', '국어 문법', '화학 I 개념', '생명과학 유전', '물리 역학', '지구과학 천체', '컴퓨터구조', '네트워크 기초', '운영체제', '데이터베이스']
const OWNERS = ['공시생A', '야간반', '독학러', '스터디장', '재수생', '편입러']
function pseudoSlug(i: number): string {
  let x = (i + 1) * 2654435761 >>> 0
  let s = ''
  for (let k = 0; k < 11; k++) {
    x = (x * 1103515245 + 12345) >>> 0
    s += BASE58[x % 58]
  }
  return s
}
TITLES.forEach((title, i) => {
  const slug = pseudoSlug(i)
  const n = 8 + ((i * 7) % 15)
  const outline = [title, ...Array.from({ length: n - 1 }, (_, k) => `  ${title.split(' ')[0]} 항목 ${k + 1} | 항목 ${k + 1}의 핵심 내용`)].join('\n')
  const t = demo(slug, outline, OWNERS[i % OWNERS.length], (i * 13) % 31, 3 + i * 4)
  trees.set(slug, t)
})

/** GET /api/t/:slug 대응. 없으면 null (404) */
export function getSharedTree(slug: string): SharedTree | null {
  return trees.get(slug) ?? null
}

const toItem = (t: SharedTree): GalleryItem => ({ slug: t.slug, title: t.title, nodeCount: t.node_count, copyCount: t.copy_count, ownerNickname: t.owner.nickname, updatedAt: t.updated_at })

/** GET /api/gallery?sort=&page= 대응. 20건/페이지 (04 §3.5) */
export function listGallery(sort: 'recent' | 'copies', page = 1): GalleryItem[] {
  const all = [...trees.values()].map(toItem)
  all.sort((a, b) => (sort === 'copies' ? b.copyCount - a.copyCount : b.updatedAt - a.updatedAt))
  return all.slice((page - 1) * 20, page * 20)
}

/** POST /api/t/:slug/copy 대응 — 복제 수 +1 */
export function recordCopy(slug: string) {
  const t = trees.get(slug)
  if (t) t.copy_count += 1
}

/** POST /api/t/:slug/report 대응 (03 §3.6). mock 은 메모리에 저장만 */
const reports: { slug: string; reason: ReportReason; note?: string; at: number }[] = []
export function submitReport(slug: string, reason: ReportReason, note?: string) {
  reports.push({ slug, reason, note: note?.trim().slice(0, 300) || undefined, at: Date.now() })
}
