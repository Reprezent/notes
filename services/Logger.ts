import { logger } from 'react-native-logs';

const defaultConfig = {
  severity: __DEV__ ? 'debug' : 'warn',
  // Remove transport config that's causing issues
  dateFormat: 'time',
  printLevel: true,
  printDate: true,
  enabled: true
};

export const log = logger.createLogger(defaultConfig);

// Simplified approach - use the main logger with prefixes
export const dbLog = {
  debug: (msg: string, ...args: any[]) => log.debug(`[DB] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) => log.info(`[DB] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => log.warn(`[DB] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => log.error(`[DB] ${msg}`, ...args),
};

export const drawingLog = {
  debug: (msg: string, ...args: any[]) => log.debug(`[DRAWING] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) => log.info(`[DRAWING] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => log.warn(`[DRAWING] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => log.error(`[DRAWING] ${msg}`, ...args),
};

export const uiLog = {
  debug: (msg: string, ...args: any[]) => log.debug(`[UI] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) => log.info(`[UI] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => log.warn(`[UI] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => log.error(`[UI] ${msg}`, ...args),
};