import winston from 'winston';
import { env } from './env';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston about the colors
winston.addColors(colors);

// Define which log level to use based on environment
const level = () => {
  const envLevel = env.LOG_LEVEL || 'info';
  return envLevel;
};

// Define different log formats
const formats = {
  // For development
  dev: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`,
    ),
  ),

  // For production
  prod: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
};

// Define which transports to use
const transports = [
  // Console transport
  new winston.transports.Console({
    format: env.NODE_ENV === 'development' ? formats.dev : formats.prod,
  }),
];

// Create the logger
export const logger = winston.createLogger({
  level: level(),
  levels,
  format: formats.prod,
  transports,
});

// Export a child logger with context
export const createLogger = (context: string) => {
  return logger.child({ context });
};