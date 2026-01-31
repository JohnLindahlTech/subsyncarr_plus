import pino from 'pino';
import { appConfig } from '../config/appConfig';

const logger = pino({
  level: appConfig.isTest ? 'silent' : process.env.LOG_LEVEL || 'info',
  base: {
    pid: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
