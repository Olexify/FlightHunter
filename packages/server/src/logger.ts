import { config } from "./config.js";

/** Structured-ish console logger. Deliberately dependency-free. */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 } as const;
export type LogLevel = keyof typeof LEVELS;

const threshold = LEVELS[config.LOG_LEVEL];

// Built from a char code so no raw control byte ever lives in this source file.
const ESC = String.fromCharCode(27);
const COLORS: Record<string, string> = {
  debug: `${ESC}[90m`,
  info: `${ESC}[36m`,
  warn: `${ESC}[33m`,
  error: `${ESC}[31m`,
};
const RESET = `${ESC}[0m`;

// Only colourise when stdout is a real terminal, so piped logs stay clean.
const useColor = process.stdout.isTTY === true;

function emit(level: Exclude<LogLevel, "silent">, msg: string, meta?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const time = new Date().toISOString().slice(11, 23);
  const tag = level.toUpperCase().padEnd(5);
  const head = useColor ? `${COLORS[level] ?? ""}${tag}${RESET}` : tag;
  const line = `${time} ${head} ${msg}`;

  if (meta === undefined) {
    (level === "error" ? console.error : console.log)(line);
    return;
  }
  let rendered: string;
  try {
    rendered = typeof meta === "string" ? meta : JSON.stringify(meta);
  } catch {
    rendered = String(meta);
  }
  (level === "error" ? console.error : console.log)(`${line} ${rendered}`);
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit("debug", msg, meta),
  info: (msg: string, meta?: unknown) => emit("info", msg, meta),
  warn: (msg: string, meta?: unknown) => emit("warn", msg, meta),
  error: (msg: string, meta?: unknown) => emit("error", msg, meta),
};
