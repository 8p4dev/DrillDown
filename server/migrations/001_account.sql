-- owner: AA (SA 워커). 03 §3.4·§3.5·§3.6. 시각은 전부 epoch ms INTEGER
CREATE TABLE users(
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('google','kakao','fake')),
  provider_sub TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar_url TEXT,
  use_provider_avatar INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  suspended_at INTEGER,
  deleted_at INTEGER,
  UNIQUE(provider, provider_sub)
);
CREATE TABLE sessions(
  id TEXT PRIMARY KEY,                -- sha256(sid) hex
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  ua TEXT NOT NULL                    -- 'Chrome · Android' 수준
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_exp ON sessions(expires_at);
CREATE TABLE audit_log(
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta TEXT                           -- JSON. 개인정보·IP 금지
);
CREATE INDEX audit_ts ON audit_log(ts);
CREATE INDEX audit_target ON audit_log(target_type, target_id);
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE reports(
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL,
  reporter_id TEXT,
  reason TEXT NOT NULL CHECK(reason IN ('copyright','spam','abuse','other')),
  note TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT CHECK(resolution IN ('hidden','dismissed'))
);
CREATE INDEX reports_tree ON reports(tree_id, resolved_at);
