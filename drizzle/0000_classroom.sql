CREATE TABLE IF NOT EXISTS classroom_votes (
  class_code TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  choice TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (class_code, activity_id, voter_id)
);
CREATE TABLE IF NOT EXISTS classroom_activity_state (
  class_code TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  open INTEGER NOT NULL DEFAULT 1,
  revealed INTEGER NOT NULL DEFAULT 0,
  correct_choice TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (class_code, activity_id)
);
CREATE TABLE IF NOT EXISTS classroom_scores (
  class_code TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  value REAL NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (class_code, activity_id, voter_id)
);
