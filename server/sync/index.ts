// [스텁 — SS 가 교체] 저장·동기화·공유 서버 모듈. 계약: orchestration_server.md §3.7 · 04 §3.1·§3.3~§3.6
import type { Hono } from 'hono'
import type { AppEnv } from '../http.ts'

/** /api/sync /api/trees* /api/t/:slug(GET·copy) /api/gallery */
export function registerSync(_app: Hono<AppEnv>) {}
/** GET /t/:slug → index.html 의 <!--OG--> 자리에 OG 태그 치환 */
export function registerSharePages(_app: Hono<AppEnv>, _shell: () => string) {}
