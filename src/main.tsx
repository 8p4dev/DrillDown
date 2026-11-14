import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 클라이언트 오류 → 서버 메모리 카운터(관리자 대시보드, T4 #48). 메시지 200자·번들 파일명만, 페이지당 5건
let budget = 5
const report = (m: unknown) => {
  if (budget-- <= 0 || !navigator.onLine) return
  const message = String(m instanceof Error ? m.message : m).slice(0, 200)
  void fetch('/api/client-error', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, version: import.meta.url.split('/').pop() }) }).catch(() => {})
}
window.onerror = (m, _s, _l, _c, e) => report(e ?? m)
window.addEventListener('unhandledrejection', (e) => report(e.reason))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
