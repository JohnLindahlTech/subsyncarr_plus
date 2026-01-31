export const MIGRATIONS = [
  // Migration 1: Initial Schema
  `
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    total_files INTEGER NOT NULL,
    completed INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    total_engines INTEGER DEFAULT 0,
    completed_engines INTEGER DEFAULT 0,
    total_videos INTEGER DEFAULT 0,
    completed_videos INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    logs TEXT DEFAULT '',
    current_video TEXT
  );

  CREATE TABLE IF NOT EXISTS file_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    video_path TEXT,
    status TEXT NOT NULL,
    current_engine TEXT,
    video_status TEXT,
    engines TEXT DEFAULT '{}',
    is_hidden_live BOOLEAN DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_file_results_run ON file_results(run_id);
  CREATE INDEX IF NOT EXISTS idx_file_results_status ON file_results(status);
  CREATE INDEX IF NOT EXISTS idx_file_results_path ON file_results(file_path);
  `,

  // Migration 2: Add quality metrics columns to file_results
  // Note: SQLite doesn't support 'IF NOT EXISTS' for ADD COLUMN,
  // so we rely on the migration version runner to ensure this only runs once.
  `
  ALTER TABLE file_results ADD COLUMN best_engine TEXT;
  ALTER TABLE file_results ADD COLUMN best_score INTEGER;
  ALTER TABLE file_results ADD COLUMN agreement_status TEXT;
  `,

  // Migration 3: Create engine_failure_tracking table
  `
  CREATE TABLE IF NOT EXISTS engine_failure_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    engine TEXT NOT NULL,
    consecutive_failures INTEGER DEFAULT 0,
    last_failure_time INTEGER,
    last_success_time INTEGER,
    is_skipped BOOLEAN DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(file_path, engine)
  );

  CREATE INDEX IF NOT EXISTS idx_failure_tracking_file ON engine_failure_tracking(file_path);
  CREATE INDEX IF NOT EXISTS idx_failure_tracking_skipped ON engine_failure_tracking(is_skipped);
  `,
];
