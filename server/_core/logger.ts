/**
 * Lightweight structured logger.
 *
 * In production, outputs JSON lines suitable for log aggregators (ELK, CloudWatch, etc.).
 * In development, outputs human-readable coloured text.
 *
 * Usage:
 *   import { logger } from "./_core/logger";
 *   logger.info("Server started", { port: 3000 });
 *   logger.warn("Rate limited", { retryAfter: 3 });
 *   logger.error("DB error", { err });
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const IS_PROD = process.env.NODE_ENV === "production";
const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) ?? (IS_PROD ? "info" : "debug");

const COLORS: Record<Level, string> = {
  debug: "\x1b[90m",   // grey
  info:  "\x1b[36m",   // cyan
  warn:  "\x1b[33m",   // yellow
  error: "\x1b[31m",   // red
};
const RESET = "\x1b[0m";

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;

  const now = new Date().toISOString();

  if (IS_PROD) {
    const entry: Record<string, unknown> = { ts: now, level, msg: message };
    if (meta) Object.assign(entry, meta);
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    const color = COLORS[level];
    const tag = `[${level.toUpperCase().padEnd(5)}]`;
    const metaStr = meta ? " " + JSON.stringify(meta) : "";
    console.log(`${color}${now} ${tag}${RESET} ${message}${metaStr}`);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log("info",  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log("warn",  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
