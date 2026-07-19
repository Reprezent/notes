import * as FileSystem from 'expo-file-system';
import { fileAsyncTransport, logger } from 'react-native-logs';

const defaultConfig = {
  severity: __DEV__ ? 'debug' : 'warn',
  transport: fileAsyncTransport,
  transportOptions: {
    FS: FileSystem,
    fileName: 'notes-{date-today}.log',
    fileNameDateType: 'iso' as const,
  },
  dateFormat: 'time',
  printLevel: true,
  printDate: true,
  enabled: true,
};

export const log = logger.createLogger(defaultConfig);

const getLogFile = () => {
  const date = new Date().toISOString().slice(0, 10);
  return new FileSystem.File(FileSystem.Paths.document, `notes-${date}.log`);
};

export const readCurrentLog = async () => {
  const file = getLogFile();

  try {
    return file.exists ? await file.text() : 'No log entries have been recorded yet.';
  } catch {
    return 'Unable to read the current log file.';
  }
};

export const clearCurrentLog = async () => {
  const file = getLogFile();
  if (file.exists) {
    file.delete();
  }
};

type GlobalErrorUtils = {
  getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

export const installCrashLogger = () => {
  const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: GlobalErrorUtils })
    .ErrorUtils;
  if (!errorUtils) {
    return;
  }

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    log.error(`Unhandled ${isFatal ? 'fatal ' : ''}JavaScript error`, {
      message: error.message,
      stack: error.stack,
    });
    previousHandler(error, isFatal);
  });
};

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

export const vectorizationLog = {
  debug: (msg: string, ...args: any[]) => log.debug(`[VECTORIZE] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) => log.info(`[VECTORIZE] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => log.warn(`[VECTORIZE] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => log.error(`[VECTORIZE] ${msg}`, ...args),
};

export const uiLog = {
  debug: (msg: string, ...args: any[]) => log.debug(`[UI] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) => log.info(`[UI] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => log.warn(`[UI] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => log.error(`[UI] ${msg}`, ...args),
};
