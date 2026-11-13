import { defineConfig } from '@playwright/test'

// README 스크린샷 생성용. 실행: npx playwright test -c e2e-shots/pw.config.ts  → docs/screenshots/*.png
// E2E 와 같은 방식(빌드 + 실제 Node 서버 + 가짜 로그인), 포트·데이터 폴더만 다르다
const PORT = 4195
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, channel: 'msedge', reducedMotion: 'reduce', locale: 'ko-KR' },
  webServer: {
    cwd: `${import.meta.dirname}/..`, // 기본값은 이 설정 파일의 폴더
    command: `npm run build && node -e "require('fs').rmSync('.shots-data',{recursive:true,force:true})" && node server/index.ts`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { PORT: String(PORT), HOST: '127.0.0.1', AUTH_FAKE: '1', DATA_DIR: '.shots-data', PUBLIC_ORIGIN: `http://127.0.0.1:${PORT}` },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
