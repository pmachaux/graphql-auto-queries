import * as winston from 'winston';
import { GaqLogger } from './interfaces/common.interfaces';

const createDefaultLogger = (): GaqLogger => {
  return winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level}: ${message}`;
      })
    ),
    transports: [new winston.transports.Console()],
  });
};

let logger!: GaqLogger;

export const setLogger = (gaqLogger?: GaqLogger) => {
  logger = gaqLogger ?? createDefaultLogger();
};

export const getLogger = (): GaqLogger => {
  if (!logger) {
    logger = createDefaultLogger();
    logger.warn('Logger not set, using default logger');
  }
  return logger;
};
