import { ProcessingEngine } from './processingEngine.js';
import { StateManager } from './stateManager.js';
import { ProcessingCoordinator } from './coordinator.js';
import { SubsyncarrPlusPlusServer } from './server.js';
import { schedule } from 'node-cron';
import { existsSync, renameSync } from 'fs';
import { appConfig } from './config/appConfig.js';
import logger from './services/logger.js';

async function main() {
  const oldDefaultDbPath = '/app/data/subsyncarr-plus.db';
  const newDefaultDbPath = appConfig.dbPath;
  const dbPath = appConfig.dbPath;

  // Migration: If user didn't specify a DB_PATH and we find the old one, rename it
  if (!appConfig.get('DB_PATH') && existsSync(oldDefaultDbPath) && !existsSync(newDefaultDbPath)) {
    logger.info({ oldDefaultDbPath, newDefaultDbPath }, '📦 Migrating legacy database');
    try {
      renameSync(oldDefaultDbPath, newDefaultDbPath);
      // Also migrate the logs directory if it exists
      const oldLogsDir = '/app/data/logs';
      if (existsSync(oldLogsDir)) {
        logger.info('📦 Migrating legacy logs directory...');
      }
    } catch (err) {
      logger.error({ err }, '❌ Database migration failed');
    }
  }

  const port = appConfig.webPort;
  const host = appConfig.webHost;

  logger.info('Initializing Subsyncarr++ Server...');

  const stateManager = new StateManager(dbPath);
  const engine = new ProcessingEngine();
  const coordinator = new ProcessingCoordinator(engine, stateManager);
  const server = new SubsyncarrPlusPlusServer(coordinator, stateManager);

  // Start HTTP server
  server.start(port, host);

  // Setup cron scheduler for automatic runs
  const cronSchedule = appConfig.cronSchedule;

  if (cronSchedule !== 'disabled') {
    schedule(cronSchedule, async () => {
      logger.info({ cronSchedule }, 'Starting scheduled run');
      try {
        await coordinator.startRun();
      } catch (error) {
        logger.error({ error }, 'Scheduled run failed');
      }
    });

    logger.info({ cronSchedule }, 'Scheduled runs configured');
  } else {
    logger.info('Automatic scheduling disabled');
  }

  // Log memory usage periodically
  setInterval(
    () => {
      const usage = process.memoryUsage();
      logger.info(
        {
          rss: `${(usage.rss / 1024 / 1024).toFixed(1)}MB`,
          heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(1)}MB`,
          heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(1)}MB`,
        },
        'Memory usage',
      );
    },
    5 * 60 * 1000,
  ); // Every 5 minutes

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    try {
      // 1. Stop processing and wait for active sync engines to be killed/cleaned up
      await coordinator.shutdown();
      // 2. Close servers and database
      server.close();
      stateManager.close();
      logger.info('Graceful shutdown successful');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});
