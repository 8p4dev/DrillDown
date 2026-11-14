// 법규·통지 — 저작권 게시중단(takedowns), 정보주체 요청 큐(requests), 접수 상태 조회, 임시조치 30일, 신고 N건 자동 숨김, 공지 복수·기간·점검 예약.
// docs/research/admin/00_synthesis.md T2 #23·#25~#29, w4_external.md §3. 공개 라우트(/api/takedown, /api/report/:id)와 관리자 라우트(/api/admin/*) 모두 여기.
import type { Hono } from 'hono'
import type { LegalMe } from '../../src/core/api.ts'
import type { DB } from '../db.ts'
import type { AppEnv } from '../http.ts'

/** GET /api/me 에 합쳐지는 부분(공지 목록 등) */
export function legalMe(_db: DB, _userId: string): LegalMe {
  return {}
}
/** 일일 작업에서 호출 — 임시조치 만료, 처리된 요청 90일 삭제 등 */
export function legalDaily(_db: DB, _now: number): void {}

export function registerLegal(_app: Hono<AppEnv>) {}
