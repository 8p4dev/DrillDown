// 제품 지표·피드백·운영 스위치 — 학습 지표(attempts·srs), daily_stats 스냅샷, 공유 조회 수, 피드백함, flags·featured, 시드 트리.
// docs/research/admin/00_synthesis.md T4 #40~#45·#49, w3_product.md. 개인정보 원칙: 집계값만, IP·이메일 없음.
import type { Hono } from 'hono'
import type { ProductMe, ProductStats } from '../../src/core/api.ts'
import type { DB } from '../db.ts'
import type { AppEnv } from '../http.ts'

/** GET /api/admin/stats 의 product 부분 */
export function productStats(_db: DB): ProductStats {
  return {}
}
/** GET /api/me 에 합쳐지는 부분(flags 등) */
export function productMe(_db: DB, _userId: string): ProductMe {
  return {}
}
/** 일일 작업에서 호출 — daily_stats 1행 적재, 피드백 90일 삭제 등 */
export function productDaily(_db: DB, _now: number): void {}

export function registerProduct(_app: Hono<AppEnv>) {}
