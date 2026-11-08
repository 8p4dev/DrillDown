-- owner: SH (SS 워커). 04 §3.6 DDL 의 SQLite 치환(uuid/jsonb→TEXT, bigint→INTEGER, boolean→INTEGER 0/1, double→REAL)
CREATE TABLE trees(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','unlisted','public')),
  slug TEXT UNIQUE,
  source_tree_id TEXT,
  node_count INTEGER NOT NULL DEFAULT 0,
  copy_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  hidden_by_admin_at INTEGER,
  seq INTEGER NOT NULL
);
CREATE INDEX trees_owner_seq ON trees(owner_id, seq);
CREATE INDEX trees_gallery ON trees(updated_at DESC) WHERE visibility='public' AND deleted_at IS NULL AND hidden_by_admin_at IS NULL;
CREATE TABLE nodes(
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  parent_id TEXT,
  "order" REAL NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  collapsed INTEGER,
  "offset" TEXT,
  width INTEGER CHECK(width IN (1,2,3)),
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  seq INTEGER NOT NULL
);
CREATE INDEX nodes_tree ON nodes(tree_id) WHERE deleted_at IS NULL;
CREATE INDEX nodes_owner_seq ON nodes(owner_id, seq);
CREATE TABLE srs(
  user_id TEXT NOT NULL REFERENCES users(id),
  node_id TEXT NOT NULL,
  tree_id TEXT NOT NULL,
  card TEXT NOT NULL,
  due INTEGER NOT NULL,
  last_grade_source TEXT,
  last_structure TEXT,
  auto_correct_days TEXT NOT NULL DEFAULT '[]',
  pending_recheck INTEGER NOT NULL DEFAULT 0,
  miss INTEGER,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  seq INTEGER NOT NULL,
  PRIMARY KEY(user_id, node_id)
) WITHOUT ROWID;
CREATE INDEX srs_owner_seq ON srs(user_id, seq);
CREATE TABLE attempts(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  tree_id TEXT NOT NULL,
  root_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  node_recall REAL NOT NULL,
  edge_accuracy REAL NOT NULL,
  auto_graded_count INTEGER NOT NULL,
  self_graded_count INTEGER NOT NULL,
  overridden_count INTEGER NOT NULL
);
CREATE INDEX attempts_user ON attempts(user_id, completed_at);
CREATE TABLE user_seq(user_id TEXT PRIMARY KEY, seq INTEGER NOT NULL DEFAULT 0);
