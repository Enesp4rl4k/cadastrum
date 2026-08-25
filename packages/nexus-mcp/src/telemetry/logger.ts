/**
 * Structured Logger for NexusMCP Gateway
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static level = LogLevel.INFO;

  static setLevel(lvl: LogLevel): void {
    this.level = lvl;
  }

  static debug(msg: string, meta?: any): void {
    if (this.level <= LogLevel.DEBUG) {
      console.error(`[DEBUG] [NexusMCP] ${msg}`, meta ? JSON.stringify(meta) : '');
    }
  }

  static info(msg: string, meta?: any): void {
    if (this.level <= LogLevel.INFO) {
      console.error(`[INFO] [NexusMCP] ${msg}`, meta ? JSON.stringify(meta) : '');
    }
  }

  static warn(msg: string, meta?: any): void {
    if (this.level <= LogLevel.WARN) {
      console.error(`[WARN] [NexusMCP] ${msg}`, meta ? JSON.stringify(meta) : '');
    }
  }

  static error(msg: string, meta?: any): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR] [NexusMCP] ${msg}`, meta ? JSON.stringify(meta) : '');
    }
  }
}
