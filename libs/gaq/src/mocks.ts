import winston = require('winston');
import { GaqLogger } from './lib/interfaces/common.interfaces';

export const getTestLogger = (): GaqLogger => {
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
