CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  security_question TEXT,
  security_answer_hash TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_data (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Migration for existing databases:
-- ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
-- ALTER TABLE users ADD COLUMN security_question TEXT;
-- ALTER TABLE users ADD COLUMN security_answer_hash TEXT;
