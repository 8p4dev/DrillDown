// [스텁 — SS 가 구현] AA(SA) 가 탈퇴·복구·일일 작업에서 호출하는 SH 함수 4개 + 관리자용 조회. 시그니처 고정 (04 §3.12 D3, 03 §3.4 요청 표)
import type { DB } from '../db.ts'

/** 탈퇴: UPDATE trees SET deleted_at=now WHERE owner_id=? AND deleted_at IS NULL → 바뀐 행 수 */
export function softDeleteTreesOfUser(_db: DB, _ownerId: string, _now: number): number { return 0 }
/** 탈퇴 취소: deleted_at >= since 인 트리만 복원 (since = users.deleted_at) */
export function restoreTreesOfUser(_db: DB, _ownerId: string, _since: number): number { return 0 }
/** 7일 경과 purge: trees·nodes·srs·attempts·user_seq 물리 삭제 (events 는 서버 미저장) */
export function purgeUser(_db: DB, _ownerId: string): void {}
/** 톰스톤 정리: deleted_at 이 cutoff 보다 오래된 trees(+하위)·nodes·srs 물리 삭제 → 삭제 행 수 */
export function purgeTombstones(_db: DB, _cutoff: number): number { return 0 }
/** 단일 트리 복구(소유자·관리자 공용). 7일 지나 purge 됐으면 null */
export function restoreTree(_db: DB, _treeId: string): { id: string; title: string } | null { return null }
/** slug → tree_id (신고 저장용). 없으면 null */
export function treeIdBySlug(_db: DB, _slug: string): string | null { return null }
/** 소유자별 트리 수 (관리자 사용자 목록) */
export function treeCountOf(_db: DB, _ownerId: string): number { return 0 }
/** 관리자 대시보드 트리 집계 */
export function treeStats(_db: DB): { total: number; public: number; hidden: number; pending_delete: number } { return { total: 0, public: 0, hidden: 0, pending_delete: 0 } }
/** 관리자 공개 트리 목록(visibility='public' 또는 삭제 7일 이내). 소유자 닉네임은 users 조인. open_reports 는 SA 가 reports 로 채운다 */
export function listTreesForAdmin(_db: DB, _opts: { cursor?: string; limit: number; deleted?: boolean }): { items: { id: string; title: string; owner: { id: string; nickname: string }; node_count: number; updated_at: number; hidden_by_admin_at: number | null; deleted_at: number | null }[]; next: string | null } { return { items: [], next: null } }
/** 관리자 숨김/해제 → 바뀐 트리(없으면 null). seq 를 올려 소유자 기기가 pull 로 hidden 상태를 받는다 */
export function setHidden(_db: DB, _treeId: string, _hidden: boolean, _now: number): { id: string; title: string; hidden_by_admin_at: number | null } | null { return null }
/** 사용자 상세(관리자) 트리 목록 */
export function treesOfUser(_db: DB, _ownerId: string): { id: string; title: string; visibility: string; updated_at: number }[] { return [] }
