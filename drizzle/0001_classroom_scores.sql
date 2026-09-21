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
