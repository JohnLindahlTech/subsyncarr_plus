import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';
import * as fs from 'fs';

/**
 * maintenanceWorker.ts - Performs heavy DB tasks in a separate thread
 */

const { dbPath, olderThanDays, trimLogsOlderThanDays, libraryRoots } = workerData;

try {
  const db = new Database(dbPath);

  // Optimize connection for maintenance
  db.pragma('busy_timeout = 10000'); // Be patient during maintenance
  db.pragma('journal_mode = WAL');
  const statsBefore =
    (db.pragma('page_count', { simple: true }) as number) * (db.pragma('page_size', { simple: true }) as number);

  // 1. Find run IDs to delete (so main thread can clean up log files)
  const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const runsToDelete = db.prepare('SELECT id FROM runs WHERE start_time < ?').all(cutoffTime) as Array<{ id: string }>;
  const deletedRunIds = runsToDelete.map((r) => r.id);

  if (deletedRunIds.length > 0) {
    // Quality Fix: We want to delete old file_results BUT keep the ones that represent
    // the "current state" of the library (latest per file_path).
    const deleteFiles = db.prepare(`
      DELETE FROM file_results 
      WHERE run_id IN (SELECT id FROM runs WHERE start_time < ?)
      AND id NOT IN (SELECT MAX(id) FROM file_results GROUP BY file_path)
    `);
    const deleteRuns = db.prepare('DELETE FROM runs WHERE start_time < ?');

    db.transaction(() => {
      deleteFiles.run(cutoffTime);
      deleteRuns.run(cutoffTime);
    })();
  }

  // 2. Prune Ghost Entries (Files removed from disk)
  if (libraryRoots && Array.isArray(libraryRoots)) {
    const allFiles = db.prepare('SELECT DISTINCT file_path FROM file_results').all() as Array<{ file_path: string }>;
    const toDelete: string[] = [];

    for (const row of allFiles) {
      // Only prune files that are within our configured library roots
      const isInLibrary = libraryRoots.some((root) => row.file_path.startsWith(root));
      if (isInLibrary && !fs.existsSync(row.file_path)) {
        toDelete.push(row.file_path);
      }
    }

    if (toDelete.length > 0) {
      const pruneStmt = db.prepare('DELETE FROM file_results WHERE file_path = ?');
      const pruneFailures = db.prepare('DELETE FROM engine_failure_tracking WHERE file_path = ?');

      db.transaction(() => {
        for (const filePath of toDelete) {
          pruneStmt.run(filePath);
          pruneFailures.run(filePath);
        }
      })();
    }
  }

  // 3. Trim logs
  const trimCutoff = Date.now() - trimLogsOlderThanDays * 24 * 60 * 60 * 1000;
  db.prepare(
    `
    UPDATE runs 
    SET logs = SUBSTR(logs, 1, 1000) || '\n... (log trimmed)' 
    WHERE start_time < ? AND LENGTH(logs) > 1000
  `,
  ).run(trimCutoff);

  // 3. VACUUM (The heaviest part)
  db.exec('VACUUM');

  const statsAfter =
    (db.pragma('page_count', { simple: true }) as number) * (db.pragma('page_size', { simple: true }) as number);

  db.close();

  // Send results back to main thread
  parentPort?.postMessage({
    success: true,
    deletedRunIds,
    reclaimedBytes: statsBefore - statsAfter,
  });
} catch (error) {
  parentPort?.postMessage({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  });
}
