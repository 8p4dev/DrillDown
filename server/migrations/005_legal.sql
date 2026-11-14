-- 3단계 워커 B 법규·통지 (docs/plans/orchestration_admin_stage3.md §2, docs/research/admin/w4_external.md §3)
-- 임시조치 30일(망법 §44조의2 ④): 보류 숨김의 만료 시각. NULL = 확정 숨김 또는 숨김 아님. legalDaily 가 지나면 해제한다
ALTER TABLE trees ADD COLUMN hidden_until INTEGER;

-- 저작권 게시중단 요청(저작권법 §103). 연락처는 이 목적 한정 — 처리(resolved_at) 후 90일 지나면 행 삭제(legalDaily). IP 저장 금지
CREATE TABLE takedowns(
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,                 -- 요구자가 적은 공유 주소의 slug
  tree_id TEXT NULL,                  -- 접수 시점에 slug 가 가리킨 트리(없으면 NULL → 관리자가 기각)
  claimant_name TEXT NOT NULL,        -- ≤40
  claimant_contact TEXT NOT NULL,     -- ≤120 (이메일·전화)
  claim TEXT NOT NULL,                -- 권리 소명 ≤1000 (등록 번호·원본 주소·진술)
  state TEXT NOT NULL,                -- received | hidden | resume_notified | resumed | litigation | confirmed | rejected
  received_at INTEGER NOT NULL,
  hidden_at INTEGER NULL,             -- 즉시 중단(숨김) 시각 = 소유자 앱 내 통보 시각
  counter_at INTEGER NULL,            -- 소유자 재개 요구(= appeals) 시각
  resume_due INTEGER NULL,            -- 재개 예정일(권리주장자 통보 후 7일, 운영 규칙)
  resolved_at INTEGER NULL
);
CREATE INDEX takedowns_open ON takedowns(resolved_at, received_at);
CREATE INDEX takedowns_tree ON takedowns(tree_id);

-- 정보주체 요청 큐(개인정보보호법 영 §41·43·44 — 10일). 이메일 등으로 온 요청을 관리자가 손으로 적는다. 처리 후 90일 삭제
CREATE TABLE requests(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('access','correct','delete','suspend','minor','other')),
  channel TEXT NOT NULL,              -- 'email' | 'app' | 'other'
  received_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,            -- received_at + 10일
  target_type TEXT NULL,              -- 'user' | 'tree'
  target_id TEXT NULL,
  state TEXT NOT NULL DEFAULT 'open', -- open | done | rejected
  note TEXT NULL,                     -- ≤300, 개인정보 최소
  resolved_at INTEGER NULL
);
CREATE INDEX requests_open ON requests(resolved_at, due_at);

-- 공지 한 줄(notice) → 공지 배열(notices). 켜져 있던 공지만 옮긴다
INSERT INTO settings(key, value, updated_at)
  SELECT 'notices', json_array(json_object('id', 'n-legacy', 'text', json_extract(value, '$.text'), 'audience', 'all')), updated_at
  FROM settings WHERE key = 'notice' AND json_extract(value, '$.enabled') = 1 AND json_extract(value, '$.text') <> '';
DELETE FROM settings WHERE key = 'notice';
