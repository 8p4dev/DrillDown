import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: { name: 'Drill Down', short_name: 'DrillDown', lang: 'ko', display: 'standalone', theme_color: '#3b6cf0', background_color: '#f4f5f7', icons: [] },
    }),
  ],
})
