import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 색은 01 §3.7: 설치 스플래시용 라이트 bg 고정
      manifest: { name: 'Drill Down', short_name: 'DrillDown', lang: 'ko', display: 'standalone', theme_color: '#f4f4f4', background_color: '#f4f4f4', icons: [] },
      workbox: {
        // 01 §3.8: 관리자 청크·웹폰트는 precache 밖(폰트 런타임 캐시 전략은 다음 단계). /api·/t/ 는 서버가 서빙
        globIgnores: ['**/AdminPage-*.js', '**/admin-*.css', '**/fonts/**'],
        navigateFallbackDenylist: [/^\/api/, /^\/t\//],
      },
    }),
  ],
})
