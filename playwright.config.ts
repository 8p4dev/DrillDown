import { defineConfig } from '@playwright/test'

// E2E 는 실제 Node 서버(dist 정적 + /api + /t/:slug)에 붙는다. 가짜 로그인 켬, DB 는 매 실행 새로 (orchestration_server.md §5)
const PORT = 4173
export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`, channel: 'msedge', reducedMotion: 'reduce', // 애니메이션이 위치 측정·클릭을 흔들지 않게 // 설치된 Edge 사용 (브라우저 다운로드 불필요)
  },
  webServer: {
    command: `npm run build && node -e "require('fs').rmSync('.e2e-data',{recursive:true,force:true})" && node server/index.ts`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { PORT: String(PORT), HOST: '127.0.0.1', AUTH_FAKE: '1', DATA_DIR: '.e2e-data', PUBLIC_ORIGIN: `http://127.0.0.1:${PORT}` },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
