import Database from 'better-sqlite3';

export interface Run {
  id: string;
  start_time: number;
  end_time: number | null;
  total_files: number;
  completed: number;
  skipped: number;
  failed: number;
  total_engines: number;
  completed_engines: number;
  total_videos: number;
  completed_videos: number;
  status: 'running' | 'completed' | 'cancelled';
  logs: string;
  current_video: string | null;
}

export interface FileResult {
  id: number;
  run_id: string;
  file_path: string;
  video_path: string | null;
  status: 'pending' | 'processing' | 'completed' | 'skipped' | 'error';
  current_engine: string | null;
  video_status: string | null;
  engines: string; // JSON stringified { ffsubsync?: {...}, autosubsync?: {...}, alass?: {...} }
  best_engine: string | null;
  best_score: number | null;
  agreement_status: 'verified' | 'suspicious' | 'low_confidence' | null;
  created_at: number;
  updated_at: number;
}

export interface EngineFailureTracking {
  id: number;
  file_path: string;
  engine: string;
  consecutive_failures: number;
  last_failure_time: number | null;
  last_success_time: number | null;
  is_skipped: boolean;
  created_at: number;
  updated_at: number;
}

export class SubsyncarrPlusPlusDatabase {
  private db: Database.Database;

  constructor(dbPath: string, skipInit: boolean = false) {
    this.db = new Database(dbPath);
    if (!skipInit) {
      this.initSchema();
    } else {
      // Even if skipping full init, set critical pragmas
      this.db.pragma('busy_timeout = 30000');
      this.db.pragma('journal_mode = WAL');
    }
  }

  private initSchema() {
    // Optimize SQLite for high performance with large datasets
    this.db.pragma('busy_timeout = 30000');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('journal_mode = WAL'); // High-concurrency
    this.db.pragma('synchronous = NORMAL'); // Faster writes, still safe in WAL mode
    this.db.pragma('mmap_size = 268435456'); // 256MB Memory-mapping for faster reads
    this.db.pragma('temp_store = MEMORY'); // Faster temp tables
    this.db.pragma('auto_vacuum = INCREMENTAL'); // Reclaim space gradually

    this.db.exec(`
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
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_file_results_run
        ON file_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_file_results_status
        ON file_results(status);
    `);

    // Migration: Add logs column if it doesn't exist
    const columns = this.db.pragma('table_info(runs)') as Array<{ name: string }>;
    const hasLogsColumn = columns.some((col) => col.name === 'logs');
    if (!hasLogsColumn) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN logs TEXT DEFAULT ''`);
    }

    // Migration: Add total_engines and completed_engines columns if they don't exist
    const hasTotalEnginesColumn = columns.some((col) => col.name === 'total_engines');
    if (!hasTotalEnginesColumn) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN total_engines INTEGER DEFAULT 0`);
    }
    const hasCompletedEnginesColumn = columns.some((col) => col.name === 'completed_engines');
    if (!hasCompletedEnginesColumn) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN completed_engines INTEGER DEFAULT 0`);
    }

    const hasTotalVideosColumn = columns.some((col) => col.name === 'total_videos');
    if (!hasTotalVideosColumn) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN total_videos INTEGER DEFAULT 0`);
    }
    const hasCompletedVideosColumn = columns.some((col) => col.name === 'completed_videos');
    if (!hasCompletedVideosColumn) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN completed_videos INTEGER DEFAULT 0`);
    }

    // Migration: Add current_video column if it doesn't exist
    const hasCurrentVideoColumn = columns.some((col) => col.name === 'current_video');
    if (!hasCurrentVideoColumn) {
      this.db.exec(`ALTER TABLE runs ADD COLUMN current_video TEXT`);
    }

    const fileResultsColumns = this.db.pragma('table_info(file_results)') as Array<{ name: string }>;
    const hasVideoStatusColumn = fileResultsColumns.some((col) => col.name === 'video_status');
    if (!hasVideoStatusColumn) {
      this.db.exec(`ALTER TABLE file_results ADD COLUMN video_status TEXT`);
    }

    const hasHiddenColumn = fileResultsColumns.some((col) => col.name === 'is_hidden_live');
    if (!hasHiddenColumn) {
      this.db.exec(`ALTER TABLE file_results ADD COLUMN is_hidden_live BOOLEAN DEFAULT 0`);
    }

    // Migration: Add quality metrics columns
    const hasBestEngineColumn = fileResultsColumns.some((col) => col.name === 'best_engine');
    if (!hasBestEngineColumn) {
      this.db.exec(`ALTER TABLE file_results ADD COLUMN best_engine TEXT`);
      this.db.exec(`ALTER TABLE file_results ADD COLUMN best_score INTEGER`);
      this.db.exec(`ALTER TABLE file_results ADD COLUMN agreement_status TEXT`);
    }

    // Migration: Create engine_failure_tracking table
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='engine_failure_tracking'")
      .all();
    if (tables.length === 0) {
      this.db.exec(`
        CREATE TABLE engine_failure_tracking (
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

        CREATE INDEX idx_failure_tracking_file ON engine_failure_tracking(file_path);
        CREATE INDEX idx_failure_tracking_skipped ON engine_failure_tracking(is_skipped);
      `);
    }
  }

  // Run methods
  createRun(id: string, totalFiles: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO runs (id, start_time, total_files, status)
      VALUES (?, ?, ?, 'running')
    `);
    stmt.run(id, Date.now(), totalFiles);
  }

  updateRun(id: string, updates: Partial<Run>): void {
    const fields = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(updates);
    this.db.prepare(`UPDATE runs SET ${fields} WHERE id = ?`).run(...values, id);
  }

  incrementRunCountersBulk(
    id: string,
    increments: {
      completed?: number;
      skipped?: number;
      failed?: number;
      completed_engines?: number;
      completed_videos?: number;
    },
  ): void {
    const fields = Object.keys(increments)
      .map((k) => `${k} = ${k} + ?`)
      .join(', ');
    const values = Object.values(increments);
    this.db.prepare(`UPDATE runs SET ${fields} WHERE id = ?`).run(...values, id);
  }

  getRun(id: string): Run | null {
    const result = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    return result ? (result as Run) : null;
  }

  getRunHistory(limit: number = 50): Run[] {
    return this.db
      .prepare(
        `
      SELECT * FROM runs
      ORDER BY start_time DESC
      LIMIT ?
    `,
      )
      .all(limit) as Run[];
  }

  /**
   * Delete old runs and their associated file results
   */
  deleteOldRuns(olderThanDays: number): string[] {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    // Find run IDs to delete
    const runsToDelete = this.db.prepare('SELECT id FROM runs WHERE start_time < ?').all(cutoffTime) as Array<{
      id: string;
    }>;
    const runIds = runsToDelete.map((r) => r.id);

    if (runIds.length === 0) return [];

    // Use transaction for atomicity
    const deleteFiles = this.db.prepare(
      'DELETE FROM file_results WHERE run_id IN (SELECT id FROM runs WHERE start_time < ?)',
    );
    const deleteRuns = this.db.prepare('DELETE FROM runs WHERE start_time < ?');

    const transaction = this.db.transaction(() => {
      deleteFiles.run(cutoffTime);
      deleteRuns.run(cutoffTime);
      return runIds;
    });

    return transaction();
  }

  /**
   * Trim logs for runs older than specified days, keeping only summary
   */
  trimOldLogs(olderThanDays: number, maxLogLength: number = 1000): number {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    const stmt = this.db.prepare(`
      UPDATE runs
      SET logs = SUBSTR(logs, 1, ?) || '\n... (log trimmed to save space)'
      WHERE start_time < ? AND LENGTH(logs) > ?
    `);

    const result = stmt.run(maxLogLength, cutoffTime, maxLogLength);
    return result.changes;
  }

  /**
   * Reclaim disk space and defragment the database
   */
  vacuum(): void {
    this.db.exec('VACUUM');
  }

  /**
   * Get database file size statistics
   */
  getDatabaseStats(): { sizeBytes: number; pageCount: number; pageSize: number } {
    const pageCount = this.db.pragma('page_count', { simple: true }) as number;
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;

    return {
      pageCount,
      pageSize,
      sizeBytes: pageCount * pageSize,
    };
  }

  // File methods
  createFileResult(runId: string, filePath: string, videoPath: string | null): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_results
        (run_id, file_path, video_path, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `);
    const now = Date.now();
    stmt.run(runId, filePath, videoPath, now, now);
  }

  bulkCreateFileResults(
    runId: string,
    files: Array<{ filePath: string; videoPath: string | null; status: FileResult['status'] }>,
  ): void {
    const now = Date.now();
    const insert = this.db.prepare(`
      INSERT INTO file_results
        (run_id, file_path, video_path, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        insert.run(runId, item.filePath, item.videoPath, item.status, now, now);
      }
    });

    transaction(files);
  }

  updateFileResult(runId: string, filePath: string, updates: Partial<FileResult>): void {
    const updatesWithTimestamp = { ...updates, updated_at: Date.now() };
    const fields = Object.keys(updatesWithTimestamp)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(updatesWithTimestamp);
    this.db
      .prepare(
        `
      UPDATE file_results
      SET ${fields}
      WHERE run_id = ? AND file_path = ?
    `,
      )
      .run(...values, runId, filePath);
  }

  updateFilesVideoStatus(runId: string, videoPath: string, videoStatus: string | null): void {
    this.db
      .prepare(
        `
      UPDATE file_results
      SET video_status = ?, updated_at = ?
      WHERE run_id = ? AND video_path = ?
    `,
      )
      .run(videoStatus, Date.now(), runId, videoPath);
  }

  manuallyVerifyFile(runId: string, filePath: string): void {
    this.db
      .prepare(
        `
      UPDATE file_results
      SET agreement_status = 'verified', updated_at = ?
      WHERE run_id = ? AND file_path = ?
    `,
      )
      .run(Date.now(), runId, filePath);
  }

  getFileResults(
    runId: string,
    limit?: number,
    offset?: number,
    search?: string,
    agreementFilter?: string,
    statusFilter?: string,
    sortColumn: string = 'file_path',
    sortOrder: 'ASC' | 'DESC' = 'ASC',
  ): FileResult[] {
    const allowedSortColumns = ['file_path', 'status', 'best_engine', 'best_score', 'created_at', 'updated_at'];
    const actualSortColumn = allowedSortColumns.includes(sortColumn) ? sortColumn : 'file_path';
    const actualSortOrder = sortOrder === 'DESC' ? 'DESC' : 'ASC';

    let sql = `
      SELECT * FROM file_results
      WHERE run_id = ? AND is_hidden_live = 0
    `;
    const params: unknown[] = [runId];

    if (search) {
      sql += ' AND file_path LIKE ?';
      params.push(`%${search}%`);
    }

    if (agreementFilter) {
      sql += ' AND agreement_status = ?';
      params.push(agreementFilter);
    }

    if (statusFilter) {
      sql += ' AND status = ?';
      params.push(statusFilter);
    }

    sql += ` ORDER BY ${actualSortColumn} ${actualSortOrder}`;

    if (limit !== undefined && offset !== undefined) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    return this.db.prepare(sql).all(...params) as FileResult[];
  }

  getFileCount(runId: string, search?: string, agreementFilter?: string, statusFilter?: string): number {
    let sql = 'SELECT COUNT(*) as count FROM file_results WHERE run_id = ? AND is_hidden_live = 0';
    const params: unknown[] = [runId];

    if (search) {
      sql += ' AND file_path LIKE ?';
      params.push(`%${search}%`);
    }

    if (agreementFilter) {
      sql += ' AND agreement_status = ?';
      params.push(agreementFilter);
    }

    if (statusFilter) {
      sql += ' AND status = ?';
      params.push(statusFilter);
    }

    const result = this.db.prepare(sql).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Gets a specialized set of files for the Live View:
   * 1. All currently processing files
   * 2. The N most recently completed/failed/skipped files
   */
  getLiveFileResults(runId: string, recentLimit: number = 10): FileResult[] {
    const processing = this.db
      .prepare(
        'SELECT * FROM file_results WHERE run_id = ? AND status = ? AND is_hidden_live = 0 ORDER BY file_path ASC',
      )
      .all(runId, 'processing') as FileResult[];

    const recentFinished = this.db
      .prepare(
        `SELECT * FROM file_results 
         WHERE run_id = ? AND status IN ('completed', 'error', 'skipped') 
         AND is_hidden_live = 0
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(runId, recentLimit) as FileResult[];

    // Combine and remove duplicates (though there shouldn't be any based on status)
    return [...processing, ...recentFinished];
  }

  updateAllFileResults(runId: string, updates: Partial<FileResult>, whereStatusIn: string[]): void {
    if (whereStatusIn.length === 0) {
      return;
    }

    const updatesWithTimestamp = { ...updates, updated_at: Date.now() };
    const fields = Object.keys(updatesWithTimestamp)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(updatesWithTimestamp);
    const statusPlaceholders = whereStatusIn.map(() => '?').join(', ');

    this.db
      .prepare(
        `
      UPDATE file_results
      SET ${fields}
      WHERE run_id = ? AND status IN (${statusPlaceholders})
    `,
      )
      .run(...values, runId, ...whereStatusIn);
  }

  clearCompletedFiles(runId: string): void {
    this.db
      .prepare(
        `
      UPDATE file_results
      SET is_hidden_live = 1
      WHERE run_id = ? AND status != 'processing'
    `,
      )
      .run(runId);
  }

  // Engine failure tracking methods
  getEngineFailureTracking(filePath: string, engine: string): EngineFailureTracking | null {
    return this.db
      .prepare(
        `SELECT * FROM engine_failure_tracking
         WHERE file_path = ? AND engine = ?`,
      )
      .get(filePath, engine) as EngineFailureTracking | null;
  }

  getAllSkippedEngines(filePath: string): string[] {
    const results = this.db
      .prepare(
        `SELECT engine FROM engine_failure_tracking
         WHERE file_path = ? AND is_skipped = 1`,
      )
      .all(filePath) as Array<{ engine: string }>;
    return results.map((r) => r.engine);
  }

  recordEngineFailure(filePath: string, engine: string, isPermanent: boolean = false): void {
    const existing = this.getEngineFailureTracking(filePath, engine);
    const now = Date.now();

    if (existing) {
      const newFailureCount = existing.consecutive_failures + 1;
      const isSkipped = isPermanent || newFailureCount >= 3;

      this.db
        .prepare(
          `
        UPDATE engine_failure_tracking
        SET consecutive_failures = ?,
            last_failure_time = ?,
            is_skipped = ?,
            updated_at = ?
        WHERE file_path = ? AND engine = ?
      `,
        )
        .run(newFailureCount, now, isSkipped ? 1 : 0, now, filePath, engine);
    } else {
      this.db
        .prepare(
          `
        INSERT INTO engine_failure_tracking
          (file_path, engine, consecutive_failures, last_failure_time,
           is_skipped, created_at, updated_at)
        VALUES (?, ?, 1, ?, ?, ?, ?)
      `,
        )
        .run(filePath, engine, now, isPermanent ? 1 : 0, now, now);
    }
  }

  recordEngineSuccess(filePath: string, engine: string): void {
    const existing = this.getEngineFailureTracking(filePath, engine);
    const now = Date.now();

    if (existing) {
      this.db
        .prepare(
          `
        UPDATE engine_failure_tracking
        SET consecutive_failures = 0,
            last_success_time = ?,
            is_skipped = 0,
            updated_at = ?
        WHERE file_path = ? AND engine = ?
      `,
        )
        .run(now, now, filePath, engine);
    } else {
      this.db
        .prepare(
          `
        INSERT INTO engine_failure_tracking
          (file_path, engine, consecutive_failures, last_success_time,
           is_skipped, created_at, updated_at)
        VALUES (?, ?, 0, ?, 0, ?, ?)
      `,
        )
        .run(filePath, engine, now, now, now);
    }
  }

  resetEngineSkipStatus(filePath: string, engine?: string): void {
    const now = Date.now();

    if (engine) {
      // Reset specific engine for specific file
      this.db
        .prepare(
          `
        UPDATE engine_failure_tracking
        SET consecutive_failures = 0,
            is_skipped = 0,
            updated_at = ?
        WHERE file_path = ? AND engine = ?
      `,
        )
        .run(now, filePath, engine);
    } else {
      // Reset all engines for specific file
      this.db
        .prepare(
          `
        UPDATE engine_failure_tracking
        SET consecutive_failures = 0,
            is_skipped = 0,
            updated_at = ?
        WHERE file_path = ?
      `,
        )
        .run(now, filePath);
    }
  }

  resetAllEngineSkipStatuses(): void {
    const now = Date.now();
    this.db
      .prepare(
        `
      UPDATE engine_failure_tracking
      SET consecutive_failures = 0,
          is_skipped = 0,
          updated_at = ?
    `,
      )
      .run(now);
  }

  getFailureTrackingStats(): {
    totalSkipped: number;
    skippedByEngine: Record<string, number>;
  } {
    const totalSkipped = this.db
      .prepare('SELECT COUNT(DISTINCT file_path) as count FROM engine_failure_tracking WHERE is_skipped = 1')
      .get() as { count: number };

    const byEngine = this.db
      .prepare('SELECT engine, COUNT(*) as count FROM engine_failure_tracking WHERE is_skipped = 1 GROUP BY engine')
      .all() as Array<{ engine: string; count: number }>;

    const skippedByEngine: Record<string, number> = {};
    byEngine.forEach((row) => {
      skippedByEngine[row.engine] = row.count;
    });

    return { totalSkipped: totalSkipped.count, skippedByEngine };
  }

  close() {
    this.db.close();
  }

  /**
   * Get global statistics across all historical runs
   */
  getGlobalStats() {
    const stats = this.db
      .prepare(
        `
      SELECT 
        COUNT(*) as total_files,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_count
      FROM file_results
    `,
      )
      .get() as { total_files: number; success_count: number; error_count: number; skipped_count: number };

    const engineStats = ['ffsubsync', 'autosubsync', 'alass'].map((engine) => {
      const res = this.db
        .prepare(
          `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN json_extract(engines, '$.' || ? || '.success') = 1 THEN 1 ELSE 0 END) as success
        FROM file_results
        WHERE json_extract(engines, '$.' || ? || '.success') IS NOT NULL
      `,
        )
        .get(engine, engine) as { total: number; success: number };
      return { engine, ...res };
    });

    return { ...stats, engines: engineStats };
  }

  /**
   * Aggregates errors by their message to identify systemic issues across all engines
   */
  getErrorGroups(limit: number = 10) {
    const engines = ['ffsubsync', 'autosubsync', 'alass'];
    const groups: Record<string, { message: string; count: number; examples: string[] }> = {};

    // Quality Fix: Look for any engine failure, even in files that eventually succeeded
    const filesWithFailures = this.db
      .prepare(
        `
      SELECT file_path, engines FROM file_results 
      WHERE engines LIKE '%"success":false%'
      ORDER BY updated_at DESC 
      LIMIT 1000
    `,
      )
      .all() as Array<{ file_path: string; engines: string }>;

    filesWithFailures.forEach((file) => {
      const engineData = JSON.parse(file.engines || '{}');
      for (const e of engines) {
        // Report every failure found in the file, not just the first one
        if (engineData[e] && engineData[e].success === false && engineData[e].message) {
          const rawMsg = engineData[e].message;

          // Normalization: Strip specific details to allow grouping.
          const genericMsg = rawMsg
            // 1. Strip timestamps like [23:39:21]
            .replace(/\[\d{2}:\d{2}:\d{2}\]/g, '[timestamp]')
            // 2. Strip quoted absolute paths (handles spaces correctly)
            .replace(/["']\/[^"']+\.(srt|mkv|mp4|avi|m4v|ts|mp3|wav|srt)["']/gi, '"<path>"')
            // 3. Strip unquoted absolute paths (allowing spaces, stopping at extension + boundary)
            .replace(/\/[\/a-z0-9\s\(\)\[\]\.\!\-\_\$]+?\.(srt|mkv|mp4|avi|m4v|ts|mp3|wav|srt)/gi, '<path>')
            // 4. Strip any leftover standalone filenames
            .replace(/[^\s\/\n]+?\.(srt|mkv|mp4|avi|m4v|ts|mp3|wav|srt)/gi, '<file>')
            // 5. Clean up standard prefixes and boilerplate
            .replace(/Error processing .*?:/i, 'Error processing <item>:')
            .replace(/Command failed: ffsubsync .*? -i/i, 'Command failed: ffsubsync <path> -i')
            .replace(/parsing subtitle file .*? failed/i, 'parsing subtitle file <item> failed')
            .replace(/ffsubsync\.py:\d+/g, 'ffsubsync.py:<line>')
            .trim();

          if (!groups[genericMsg]) {
            groups[genericMsg] = { message: genericMsg, count: 0, examples: [] };
          }
          groups[genericMsg].count++;
          if (groups[genericMsg].examples.length < 3) {
            groups[genericMsg].examples.push(`${e}: ${file.file_path.split('/').pop() || ''}`);
          }
        }
      }
    });

    return Object.values(groups)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get average duration for an engine in milliseconds
   */
  getAverageEngineDuration(engine: string): number {
    try {
      // Extract duration from JSON engines column
      const result = this.db
        .prepare(
          `
        SELECT AVG(json_extract(engines, '$.' || ? || '.duration')) as avg_duration
        FROM file_results
        WHERE json_extract(engines, '$.' || ? || '.success') = 1
      `,
        )
        .get(engine, engine) as { avg_duration: number | null };

      return result.avg_duration || 30000; // Default to 30s if no data
    } catch (e) {
      return 30000;
    }
  }
}
