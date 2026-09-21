CREATE TABLE IF NOT EXISTS classroom_auth_attempts (
  client_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS classroom_auth_attempts_client_time
  ON classroom_auth_attempts (client_key, attempted_at);
