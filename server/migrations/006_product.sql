-- 3단계 워커 C (docs/plans/orchestration_admin_stage3.md §3, 00_synthesis.md T4 #41·#42·#43). 집계값·사용자 글만, IP·이메일·원문 UA 없음.
-- #42 공유 링크 조회 수: GET /t/:slug·/api/t/:slug 요청 수(크롤러 UA 제외). 유니크 방문자는 IP 비저장이라 불가
ALTER TABLE trees ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

-- #41 일별 스냅샷(집계값만). day = 로컬 'YYYY-MM-DD'. productDaily(04:00)가 어제 행을 upsert, 서버 기동 시 오늘 행 restarts +1(#49)
CREATE TABLE daily_stats(
  day TEXT PRIMARY KEY,
  dau INTEGER NOT NULL DEFAULT 0,              -- last_seen_at 24h 내(앱 열기 포함, 북극성 아님)
  wau INTEGER NOT NULL DEFAULT 0,
  mau INTEGER NOT NULL DEFAULT 0,
  retrieval_active INTEGER NOT NULL DEFAULT 0, -- 7일 내 백지 퀴즈 완료 사용자(attempts DISTINCT user)
  new_users INTEGER NOT NULL DEFAULT 0,
  new_trees INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,         -- 그날 완료된 백지 퀴즈 수
  share_views INTEGER NOT NULL DEFAULT 0,      -- SUM(trees.view_count) 누계
  copies INTEGER NOT NULL DEFAULT 0,           -- SUM(trees.copy_count) 누계
  gallery_hits INTEGER NOT NULL DEFAULT 0,     -- /api/gallery 요청 누계(서버가 5분마다 data/product-counters.json 에 적는 값)
  client_errors INTEGER NOT NULL DEFAULT 0,    -- 워커 A 의 클라이언트 오류 카운터 합류 지점(지금은 0)
  open_reports INTEGER NOT NULL DEFAULT 0,
  public_trees INTEGER NOT NULL DEFAULT 0,
  restarts INTEGER NOT NULL DEFAULT 0
);

-- #43 피드백·버그 수집함. user_id NULL = 비로그인. text ≤500자("연락처를 적지 마세요" 안내). client 는 sessions.ua 수준 축약. 처리 후 90일 삭제(일일 작업)
CREATE TABLE feedback(
  id TEXT PRIMARY KEY,
  user_id TEXT,
  category TEXT NOT NULL CHECK(category IN ('bug','idea','content','other')),
  text TEXT NOT NULL,
  tree_id TEXT,
  client TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  note TEXT                                    -- 운영자 메모(보낸 사람에게 보임, ≤300자)
);
CREATE INDEX feedback_open ON feedback(resolved_at, created_at);
CREATE INDEX feedback_user ON feedback(user_id, created_at);
