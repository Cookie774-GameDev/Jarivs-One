PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS intelligence_repository_trends (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  description TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK (stars >= 0),
  star_delta INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL CHECK (forks >= 0),
  open_issues INTEGER NOT NULL CHECK (open_issues >= 0),
  language TEXT,
  pushed_at TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intelligence_repository_trends_rank
  ON intelligence_repository_trends(star_delta DESC, stars DESC, full_name ASC);

CREATE TABLE IF NOT EXISTS intelligence_news_creator_subscriptions (
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL
    REFERENCES intelligence_news_sources(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, source_id)
);

CREATE TABLE IF NOT EXISTS intelligence_news_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL
    REFERENCES intelligence_news_events(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL
    REFERENCES intelligence_news_sources(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  UNIQUE (user_id, event_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_intelligence_news_notifications_pending
  ON intelligence_news_notifications(user_id, acknowledged_at, created_at ASC);
