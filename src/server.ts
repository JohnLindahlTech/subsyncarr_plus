import { ProcessingCoordinator } from './coordinator.js';
import { StateManager } from './stateManager.js';
import { join } from 'path';
import { getScanConfig } from './config.js';
import cronstrue from 'cronstrue';
import * as parser from 'cron-parser';
import { checkDependency, validatePartialPath } from './helpers.js';
import { FileResult } from './database.js';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { appConfig } from './config/appConfig.js';
import logger from './services/logger.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface HealthStatus {
  timestamp: number;
  dependencies: Array<{
    name: string;
    found: boolean;
    version?: string;
    error?: string;
  }>;
  allOk: boolean;
}

export class SubsyncarrPlusPlusServer {
  private app = express();
  private httpServer = createServer(this.app);
  private wss = new WebSocketServer({ server: this.httpServer, path: '/ws' });
  private clients: Set<WebSocket> = new Set();
  private healthStatus: HealthStatus | null = null;

  constructor(
    private coordinator: ProcessingCoordinator,
    private stateManager: StateManager,
  ) {
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.performHealthCheck();
  }

  private async performHealthCheck() {
    logger.info('Performing system health check...');
    const engines = appConfig.includeEngines;

    const dependencies = [
      { cmd: 'ffmpeg', args: ['-version'] },
      { cmd: 'ffprobe', args: ['-version'] },
      ...engines.map((engine) => ({ cmd: engine, args: ['--version'] })),
    ];

    const results = await Promise.all(dependencies.map((dep) => checkDependency(dep.cmd, dep.args)));

    this.healthStatus = {
      timestamp: Date.now(),
      dependencies: results,
      allOk: results.every((r) => r.found),
    };

    logger.info({ allOk: this.healthStatus.allOk }, 'Health check complete');
    this.broadcast({ type: 'health:updated', data: this.healthStatus });
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(join(__dirname, '../public')));

    // Quality Fix: Return 503 while database is being vacuumed
    this.app.use((req, res, next) => {
      // Exclude static files from maintenance block
      if (req.path.startsWith('/api/') && this.stateManager.isMaintenanceMode()) {
        res.status(503).json({
          error: 'Service Temporarily Unavailable',
          message: 'Database maintenance is in progress. Please try again in a few minutes.',
        });
        return;
      }
      next();
    });
  }

  private setupRoutes() {
    // Get configuration status
    this.app.get('/api/config', (req, res) => {
      logger.debug('GET /api/config');
      const config = getScanConfig();
      // Check if paths actually contain something other than default
      const isDefaultPath =
        config.includePaths.length === 0 ||
        (config.includePaths.length === 1 && config.includePaths[0] === '/scan_dir');

      // Get cron schedule info

      const cronSchedule = appConfig.cronSchedule;
      let scheduleDescription = '';
      let nextRun = null;

      if (cronSchedule !== 'disabled') {
        try {
          scheduleDescription = cronstrue.toString(cronSchedule);
          // @ts-expect-error - cron-parser ESM types are tricky
          const interval = (parser.default || parser).parseExpression(cronSchedule);
          nextRun = interval.next().toDate().getTime();
        } catch (error) {
          logger.error({ error, cronSchedule }, 'Error parsing cron schedule');
          scheduleDescription = cronSchedule;
        }
      }

      res.json({
        paths: config.includePaths,
        excludePaths: config.excludePaths,
        isConfigured: !isDefaultPath,
        schedule: {
          enabled: cronSchedule !== 'disabled',
          cron: cronSchedule,
          description: scheduleDescription,
          nextRun: nextRun,
        },
      });
    });

    // Get health status
    this.app.get('/api/health', (_req, res) => {
      res.json(this.healthStatus);
    });

    // Get global statistics
    this.app.get('/api/stats/global', (_req, res) => {
      res.json(this.stateManager.getGlobalStats());
    });

    // Get error groupings
    this.app.get('/api/stats/errors', (_req, res) => {
      res.json(this.stateManager.getErrorGroups());
    });

    // Get current status
    this.app.get('/api/status', (req, res) => {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const search = (req.query.search as string) || undefined;
      const agreementFilter = (req.query.filter as string) || undefined;
      const statusFilter = (req.query.status as string) || undefined;
      const sortColumn = (req.query.sortColumn as string) || 'file_path';
      const sortOrder = (req.query.sortOrder as 'ASC' | 'DESC') || 'ASC';
      const runId = (req.query.runId as string) || undefined;
      const offset = (page - 1) * limit;

      const currentRun = this.stateManager.getCurrentRun();

      // For stats/header, if no active run, try to get the latest run from history
      let statsRun = currentRun;
      if (!statsRun) {
        const history = this.stateManager.getRunHistory(1);
        if (history.length > 0) {
          statsRun = history[0];
        }
      }

      let files: FileResult[] = [];
      let totalFiles = 0;

      if (runId) {
        // Run-specific view (e.g., Live view)
        totalFiles = this.stateManager.getFileCount(runId, search, agreementFilter, statusFilter);
        files = this.stateManager.getFileResults(
          runId,
          limit,
          offset,
          search,
          agreementFilter,
          statusFilter,
          sortColumn,
          sortOrder,
        );
      } else {
        // Global library view
        totalFiles = this.stateManager.getGlobalFileCount(search, agreementFilter, statusFilter);
        files = this.stateManager.getGlobalFileResults(
          limit,
          offset,
          search,
          agreementFilter,
          statusFilter,
          sortColumn,
          sortOrder,
        );
      }

      res.json({
        currentRun: statsRun, // Return latest run for progress bars even in global view
        files,
        pagination: {
          page,
          limit,
          total: totalFiles,
          totalPages: Math.ceil(totalFiles / limit),
        },
        isRunning: this.coordinator.isRunning(),
        activeExtractions: this.stateManager.getActiveExtractions(),
      });
    });

    // Get run history
    this.app.get('/api/history', (req, res) => {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      res.json(this.stateManager.getRunHistory(limit));
    });

    // Get specific run details
    this.app.get('/api/runs/:id', (req, res) => {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const search = (req.query.search as string) || undefined;
      const filter = (req.query.filter as string) || undefined;
      const offset = (page - 1) * limit;

      const currentRun = this.stateManager.getCurrentRun();
      const requestedId = req.params.id;

      if (currentRun && currentRun.id === requestedId) {
        const totalFiles = this.stateManager.getFileCount(currentRun.id, search, filter);
        return res.json({
          run: currentRun,
          files: this.stateManager.getFileResults(currentRun.id, limit, offset, search, filter),
          pagination: {
            page,
            limit,
            total: totalFiles,
            totalPages: Math.ceil(totalFiles / limit),
          },
        });
      }

      const history = this.stateManager.getRunHistory(1000);
      const run = history.find((r) => r.id === requestedId);

      if (!run) {
        return res.status(404).json({ error: 'Run not found' });
      }

      const totalFiles = this.stateManager.getFileCount(run.id, search, filter);
      res.json({
        run,
        files: this.stateManager.getFileResults(run.id, limit, offset, search, filter),
        pagination: {
          page,
          limit,
          total: totalFiles,
          totalPages: Math.ceil(totalFiles / limit),
        },
      });
    });

    // Get logs for a specific run
    this.app.get('/api/runs/:id/logs', (req, res) => {
      const requestedId = req.params.id;
      const currentRun = this.stateManager.getCurrentRun();
      const history = this.stateManager.getRunHistory(1000);
      const run = currentRun?.id === requestedId ? currentRun : history.find((r) => r.id === requestedId);

      if (!run) {
        return res.status(404).json({ error: 'Run not found' });
      }

      const logs = this.stateManager.getRunLogs(requestedId);
      res.json({ logs });
    });

    // Start a new run
    this.app.post('/api/run/start', async (req, res) => {
      const { paths, force } = req.body;
      try {
        if (this.coordinator.isRunning()) {
          return res.status(409).json({ error: 'A run is already in progress' });
        }

        const libraryRoots = appConfig.getScanConfig().includePaths;
        let validatedPaths: string[] | undefined;

        if (paths && Array.isArray(paths)) {
          try {
            logger.info({ paths }, 'Validating partial scan paths');
            validatedPaths = paths.map((p) => validatePartialPath(p, libraryRoots));
            logger.info('Paths validated successfully.');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error({ err }, '🛡️ Security Validation Failed');
            return res.status(403).json({
              error: 'Security Validation Failed',
              message: msg,
            });
          }
        }

        const config = {
          includePaths: validatedPaths || libraryRoots,
          excludePaths: [],
          enableContextAwareMatching: true,
          forceRerun: !!force,
        };

        const runId = await this.coordinator.startRun(config);
        res.json({ runId });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Dry Run
    this.app.post('/api/run/dry-run', async (req, res) => {
      try {
        const results = await this.coordinator.dryRun();
        res.json(results);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Stop current run
    this.app.post('/api/run/stop', (_req, res) => {
      try {
        this.coordinator.stopRun();
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Skip a file
    this.app.post('/api/file/skip', (req, res) => {
      const { filePath } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: 'filePath required' });
      }
      this.coordinator.skipFile(filePath);
      res.json({ success: true });
    });

    // Clear completed files
    this.app.post('/api/files/clear', (req, res) => {
      this.stateManager.clearCompletedFiles();
      const currentRun = this.stateManager.getCurrentRun();
      this.broadcast({
        type: 'files:cleared',
        data: {
          currentRun,
          files: currentRun
            ? this.stateManager.getFileResults(currentRun.id).filter((f) => f.status === 'processing')
            : [],
        },
      });
      res.json({ success: true });
    });

    // Get skip status statistics
    this.app.get('/api/skip-status', (_req, res) => {
      res.json(this.stateManager.getFailureStats());
    });

    // Get skip status for specific file
    this.app.get('/api/skip-status/:filePath(.*)', (req, res) => {
      const filePath = decodeURIComponent(req.params.filePath);
      const skippedEngines = this.stateManager.getSkippedEngines(filePath);
      res.json({ filePath, skippedEngines });
    });

    // Reset skip status for a file
    this.app.post('/api/skip-status/reset', (req, res) => {
      const { filePath, engine } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: 'filePath required' });
      }
      this.stateManager.resetSkipStatus(filePath, engine);
      res.json({ success: true });
    });

    // Reset all skip statuses
    this.app.post('/api/skip-status/reset-all', (_req, res) => {
      this.stateManager.resetAllSkipStatuses();
      res.json({ success: true });
    });

    // Verify a file manually
    this.app.post('/api/file/verify', (req, res) => {
      const { runId, filePath } = req.body;
      if (!runId || !filePath) {
        return res.status(400).json({ error: 'runId and filePath required' });
      }
      this.stateManager.manuallyVerifyFile(runId, filePath);
      res.json({ success: true });
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      logger.info({ totalClients: this.clients.size + 1 }, 'WebSocket client connected');
      this.clients.add(ws);

      const currentRun = this.stateManager.getCurrentRun();
      const files = currentRun ? this.stateManager.getFileResults(currentRun.id, 50, 0) : [];
      const totalFiles = currentRun ? this.stateManager.getFileCount(currentRun.id) : 0;

      ws.send(
        JSON.stringify({
          type: 'state',
          data: {
            currentRun,
            files,
            pagination: {
              page: 1,
              limit: 50,
              total: totalFiles,
              totalPages: Math.ceil(totalFiles / 50),
            },
            isRunning: this.coordinator.isRunning(),
            health: this.healthStatus,
            activeExtractions: this.stateManager.getActiveExtractions(),
          },
        }),
      );

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info({ totalClients: this.clients.size }, 'WebSocket client disconnected');
      });
    });

    this.stateManager.on('extraction:started', (videoPath) => {
      this.broadcast({ type: 'extraction:started', data: videoPath });
    });

    this.stateManager.on('extraction:stopped', (videoPath) => {
      this.broadcast({ type: 'extraction:stopped', data: videoPath });
    });

    this.stateManager.on('maintenance:started', () => {
      this.broadcast({ type: 'maintenance:started' });
    });

    this.stateManager.on('maintenance:finished', () => {
      this.broadcast({ type: 'maintenance:finished' });
    });

    this.stateManager.on('run:started', (run) => {
      this.broadcast({ type: 'run:started', data: run });
    });

    this.stateManager.on('run:updated', (run) => {
      this.broadcast({ type: 'run:updated', data: run });
    });

    this.stateManager.on('run:progress', (data) => {
      this.broadcast({ type: 'run:progress', data });
    });

    this.stateManager.on('run:completed', (run) => {
      this.broadcast({ type: 'run:completed', data: run });
    });

    this.stateManager.on('run:cancelled', (run) => {
      this.broadcast({ type: 'run:cancelled', data: run });
    });

    this.stateManager.on('state:full_update', (data) => {
      this.broadcast({ type: 'state', data });
    });
  }

  private broadcast(message: unknown) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  start(port: number = 3000, host: string = '127.0.0.1') {
    this.httpServer.listen(port, host, () => {
      logger.info({ port, host }, 'Subsyncarr Plus Plus UI available');
    });
  }

  close() {
    this.httpServer.close();
    this.wss.close();
  }
}
