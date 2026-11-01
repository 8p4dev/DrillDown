import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173', channel: 'msedge', reducedMotion: 'reduce' }, // 애니메이션이 위치 측정·클릭을 흔들지 않게 // 설치된 Edge 사용 (브라우저 다운로드 불필요)
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
