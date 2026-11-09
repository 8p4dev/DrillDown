# Drill Down

개념을 트리로 쪼개 적고(편집기), 그 노드를 그대로 플래시카드·빈칸·백지 퀴즈로 익히는 학습 앱. 데이터는 브라우저(IndexedDB)에 먼저 저장되고, 로그인하면 서버와 동기화된다. React 19 + Vite, 서버는 Node + Hono + SQLite.

## 실행

```sh
npm ci
npm run dev          # 화면만: http://localhost:5173 (로그인 없이 편집·학습 가능)
npm run dev:server   # 로그인·동기화·공유까지: .env.example → .env 복사 후, 다른 터미널에서
npm run build && npm run server   # 운영과 같은 모양: http://localhost:3000
```

검사: `npm run typecheck` · `npm run lint` · `npm run check`(자가 점검) · `npm run e2e`(Edge 필요).

## 더 읽기

- `docs/CODEBASE.md` — 코드베이스 안내서(구조·원리·화면별 동작·동기화·서버·함정). 처음이면 여기부터.
- `docs/specs/` — 설계 문서, `docs/plans/` — 작업 기록.
