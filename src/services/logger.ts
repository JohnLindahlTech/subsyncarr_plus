import pino from 'pino';
import { appConfig } from '../config/appConfig.js';

const logger = pino({
  level: appConfig.isTest ? 'silent' : process.env.LOG_LEVEL || 'info',
  base: {
    pid: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: appConfig.isTest
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: false,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
});

export default logger;
