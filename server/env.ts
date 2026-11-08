// 서버 설정 — 오케스트레이터 소유 (docs/plans/orchestration_server.md §3.1). 비밀값은 환경 변수(.env 는 systemd EnvironmentFile)로만.
import { resolve } from 'node:path'

const e = process.env
const root = resolve(import.meta.dirname, '..')

export const env = {
  port: Number(e.PORT ?? 3000),
  /** 127.0.0.1 만 (외부는 같은 호스트의 cloudflared Tunnel, 04 §3.12 D1) */
  host: e.HOST ?? '127.0.0.1',
  /** 공개 주소. OAuth redirect_uri·og:url·공유 링크에 쓴다. 도메인은 사용자 결정 D18 — 미정이면 로컬 주소 */
  origin: (e.PUBLIC_ORIGIN ?? `http://localhost:${e.PORT ?? 3000}`).replace(/\/$/, ''),
  dataDir: resolve(root, e.DATA_DIR ?? 'data'),
  distDir: resolve(root, e.DIST_DIR ?? 'dist'),
  /** ["google:<sub>", "kakao:<sub>"] — 03 §3.4 관리자 인증 1 */
  adminsFile: resolve(root, e.ADMINS_FILE ?? 'config/admins.json'),
  google: { id: e.GOOGLE_CLIENT_ID ?? '', secret: e.GOOGLE_CLIENT_SECRET ?? '' },
  kakao: { id: e.KAKAO_CLIENT_ID ?? '', secret: e.KAKAO_CLIENT_SECRET ?? '', adminKey: e.KAKAO_ADMIN_KEY ?? '' },
  /** 개발·E2E 전용 가짜 로그인(/api/auth/fake/*). 프로덕션에서는 켜지 않는다 */
  authFake: e.AUTH_FAKE === '1',
  /** 개인정보 보호책임자 연락처(처리방침 ⑦, D18) */
  privacyContact: e.PRIVACY_CONTACT ?? '',
  /** true 면 쿠키 Secure (https origin 일 때 자동) */
  get secure() { return this.origin.startsWith('https://') },
} as const
