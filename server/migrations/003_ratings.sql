-- owner: WY. 공개 트리 별점(orchestration_editor_share.md §1.4 Y1). 1인 1표 = PK(user_id, tree_id), 수정은 upsert
CREATE TABLE ratings(
  user_id TEXT NOT NULL REFERENCES users(id),
  tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, tree_id)
) WITHOUT ROWID;
CREATE INDEX ratings_tree ON ratings(tree_id);
