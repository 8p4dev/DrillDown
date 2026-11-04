import { defineConfig } from '@playwright/test'

// 시안 점검 도구 설정 (E2E 아님). BASE 의 dev 서버를 쓰므로 포트·DB 를 다른 워크트리와 나누지 않는다
export default defineConfig({ testDir: '.', timeout: 300_000, workers: 1, reporter: 'line', use: { channel: 'msedge', reducedMotion: 'reduce' } })
