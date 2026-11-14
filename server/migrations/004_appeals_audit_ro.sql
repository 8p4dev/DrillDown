-- 2단계 (docs/research/admin/00_synthesis.md T1 #18, T2 #22)
-- 감사 로그 불변: UPDATE 금지, DELETE 는 1년 지난 행만(일일 작업이 지운다). OWASP A09 append-only
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
  WHEN OLD.ts > (CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 365 * 86400000)
  BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

-- 소명: 운영 숨김 당사자(소유자)가 보내는 글. 처리 후 90일 삭제(일일 작업). 저작권법 §103 ③·망법 §44조의2 통지의 앱 내 경로
CREATE TABLE appeals(
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,                 -- ≤500자. 개인정보를 적지 말라고 안내
  created_at INTEGER NOT NULL,
  resolved_at INTEGER NULL,
  resolution TEXT NULL                -- 'accepted'(숨김 해제) | 'rejected'
);
CREATE INDEX appeals_open ON appeals(resolved_at, created_at);
CREATE INDEX appeals_tree ON appeals(tree_id, resolved_at);
