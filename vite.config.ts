import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false, // PNG 아이콘은 설치 때만 필요 — precache 예산(≤640 KiB) 밖
      // 색은 01 §3.7: 설치 스플래시용 라이트 bg 고정. 아이콘은 favicon.svg 를 래스터화한 PNG(스크래치 Playwright, H4) — precache 밖(기본 glob 은 js/css/html)
      manifest: {
        name: 'Drill Down', short_name: 'DrillDown', lang: 'ko', display: 'standalone', theme_color: '#f4f4f4', background_color: '#f4f4f4',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 01 §3.8: 관리자 청크·웹폰트는 precache 밖(폰트 런타임 캐시 전략은 다음 단계). /api·/t/ 는 서버가 서빙
        // F3: 공유 보기(SharedPage, /t/<slug> 는 서버 서빙)·공개 트리 목록(GalleryPage, /api/gallery 없이는 빈 화면)·둘의 share.css 도 밖 — 온라인 전용 화면.
        //     share-????????.css 는 해시만 받아 share-list.css(공유 시트 등 오프라인 화면이 씀)는 남긴다
        globIgnores: ['**/AdminPage-*.js', '**/admin-*.css', '**/AdminPage-*.css', '**/fonts/**', '**/SharedPage-*.js', '**/GalleryPage-*.js', '**/share-????????.css'],
        navigateFallbackDenylist: [/^\/api/, /^\/t\//],
      },
    }),
  ],
  // dev: API·공유 페이지 HTML 은 Node 서버(npm run dev:server, :3000)로. 공유 보기 SPA 는 Vite 가 그대로 서빙
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
})
