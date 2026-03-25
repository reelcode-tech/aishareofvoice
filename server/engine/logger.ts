// Structured JSON logging for Workers
// v3 spec §12: structured logging, request tracing, metrics
// Each log entry includes request ID, timestamp, and structured data

let _requestId = "";

/**
 * Set the current request ID (called from middleware).
 */
export function setRequestId(id: string) {
  _requestId = id;
}

/**
 * Generate a short unique request ID.
 */
export function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  msg: string;
  requestId?: string;
  [key: string]: any;
}

function log(level: LogLevel, msg: string, data?: Record<string, any>) {
  const entry: LogEntry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...((_requestId) ? { requestId: _requestId } : {}),
    ...data,
  };
  
  // Use console methods that Workers runtime captures
  const line = JSON.stringify(entry);
  switch (level) {
    case "error": console.error(line); break;
    case "warn": console.warn(line); break;
    case "debug": console.debug(line); break;
    default: console.log(line); break;
  }
}

export const logger = {
  info: (msg: string, data?: Record<string, any>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, any>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, any>) => log("error", msg, data),
  debug: (msg: string, data?: Record<string, any>) => log("debug", msg, data),
  
  /**
   * Log an audit lifecycle event with timing.
   */
  audit: (event: string, data: {
    brand?: string;
    tier?: string;
    engines?: number;
    queries?: number;
    durationMs?: number;
    score?: number;
    grade?: string;
    [key: string]: any;
  }) => log("info", `[Audit] ${event}`, { ...data, component: "audit" }),
  
  /**
   * Log a provider API call with latency.
   */
  provider: (event: string, data: {
    provider: string;
    model?: string;
    durationMs?: number;
    cached?: boolean;
    error?: string;
    [key: string]: any;
  }) => log("info", `[Provider] ${event}`, { ...data, component: "provider" }),
  
  /**
   * Log a cache operation.
   */
  cache: (event: string, data: {
    hit?: boolean;
    engine?: string;
    tier?: string;
    [key: string]: any;
  }) => log("debug", `[Cache] ${event}`, { ...data, component: "cache" }),
};
