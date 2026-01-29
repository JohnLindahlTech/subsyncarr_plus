import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';

/**
 * maintenanceWorker.ts - Performs heavy DB tasks in a separate thread
 */

const { dbPath, olderThanDays, trimLogsOlderThanDays } = workerData;

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
    const deleteFiles = db.prepare(
      'DELETE FROM file_results WHERE run_id IN (SELECT id FROM runs WHERE start_time < ?)',
    );
    const deleteRuns = db.prepare('DELETE FROM runs WHERE start_time < ?');

    db.transaction(() => {
      deleteFiles.run(cutoffTime);
      deleteRuns.run(cutoffTime);
    })();
  }

  // 2. Trim logs
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
