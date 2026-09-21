CREATE TABLE IF NOT EXISTS classroom_facilitation_state (
  class_code TEXT NOT NULL PRIMARY KEY,
  activity_id TEXT NOT NULL DEFAULT 'random',
  phase TEXT NOT NULL DEFAULT 'setup',
  ends_at INTEGER,
  remaining_seconds INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_presence (
  class_code TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (class_code, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_classroom_presence_class_updated
  ON classroom_presence (class_code, updated_at);

PRAGMA optimize;
