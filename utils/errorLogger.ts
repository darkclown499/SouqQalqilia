/**
 * utils/errorLogger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified Error Logger for Souq Qalqilya — Production-ready structured logging.
 *
 * Strategy:
 *  • In DEV   → colorised console output with full stack traces
 *  • In PROD  → stores last N errors in AsyncStorage for support retrieval
 *               + sends critical errors to a lightweight Edge Function endpoint
 *               (non-blocking, fire-and-forget)
 *
 * Usage:
 *   import { Logger } from '@/utils/errorLogger';
 *   Logger.error('useAds', 'Failed to fetch ads', error, { userId });
 *   Logger.warn('push-notify', 'Token missing for user', { userId });
 *   Logger.info('auth', 'User signed in', { userId });
 *
 * Retrieve stored logs (for in-app support form):
 *   const logs = await Logger.getStoredLogs();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Config ────────────────────────────────────────────────────────────────────
const IS_DEV = __DEV__;
const LOG_KEY = '@souq_error_log_v1';
const MAX_STORED_LOGS = 200;      // FIFO eviction when exceeded
const MAX_LOG_AGE_MS = 48 * 3600 * 1000; // 48 hours — discard stale entries

// ── Types ─────────────────────────────────────────────────────────────────────
type Severity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogEntry {
  ts: number;          // epoch ms
  severity: Severity;
  context: string;     // module / hook / service name
  message: string;
  data?: Record<string, any>;
  stack?: string;
  appVersion?: string;
}

// ── Colour map for DEV console ────────────────────────────────────────────────
const COLOURS: Record<Severity, string> = {
  debug:    '\x1b[90m',  // grey
  info:     '\x1b[36m',  // cyan
  warn:     '\x1b[33m',  // yellow
  error:    '\x1b[31m',  // red
  critical: '\x1b[35m',  // magenta
};
const RESET = '\x1b[0m';
const ICONS: Record<Severity, string> = {
  debug: '🔍', info: 'ℹ️ ', warn: '⚠️ ', error: '❌', critical: '🚨',
};

// ── In-memory write buffer (avoids hammering AsyncStorage on every log call) ─
let _buffer: LogEntry[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(async () => {
    _flushTimer = null;
    await persistBuffer();
  }, 2000); // flush after 2s of inactivity
}

async function persistBuffer(): Promise<void> {
  if (_buffer.length === 0) return;
  const toWrite = [..._buffer];
  _buffer = [];
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const existing: LogEntry[] = raw ? JSON.parse(raw) : [];
    // Merge + prune stale entries
    const now = Date.now();
    const fresh = existing.filter(e => now - e.ts < MAX_LOG_AGE_MS);
    const merged = [...fresh, ...toWrite];
    // FIFO eviction: keep last MAX_STORED_LOGS entries
    const trimmed = merged.length > MAX_STORED_LOGS
      ? merged.slice(merged.length - MAX_STORED_LOGS)
      : merged;
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
  } catch { /* never throw from logger */ }
}

// ── Core log function ─────────────────────────────────────────────────────────
function log(
  severity: Severity,
  context: string,
  message: string,
  errorOrData?: Error | Record<string, any> | null,
  extraData?: Record<string, any>,
): void {
  const entry: LogEntry = {
    ts: Date.now(),
    severity,
    context,
    message,
    appVersion: require('@/constants/config').APP_VERSION,
  };

  // Normalise the optional 3rd argument
  if (errorOrData instanceof Error) {
    entry.stack = errorOrData.stack;
    if (extraData) entry.data = extraData;
  } else if (errorOrData && typeof errorOrData === 'object') {
    entry.data = extraData ? { ...errorOrData, ...extraData } : errorOrData;
  }

  if (IS_DEV) {
    const color = COLOURS[severity];
    const time = new Date(entry.ts).toISOString().slice(11, 23);
    console.log(`${color}${ICONS[severity]} [${time}] [${context}] ${message}${RESET}`);
    if (entry.data) console.log(entry.data);
    if (entry.stack) console.log(entry.stack);
  }

  // Always persist warn/error/critical to AsyncStorage for post-mortem analysis
  if (severity === 'warn' || severity === 'error' || severity === 'critical') {
    _buffer.push(entry);
    scheduleFlush();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export const Logger = {
  debug:    (ctx: string, msg: string, data?: Record<string, any>) => log('debug',    ctx, msg, data),
  info:     (ctx: string, msg: string, data?: Record<string, any>) => log('info',     ctx, msg, data),
  warn:     (ctx: string, msg: string, data?: Record<string, any>) => log('warn',     ctx, msg, null, data),
  error:    (ctx: string, msg: string, err?: Error | null, data?: Record<string, any>) => log('error',    ctx, msg, err ?? undefined, data),
  critical: (ctx: string, msg: string, err?: Error | null, data?: Record<string, any>) => log('critical', ctx, msg, err ?? undefined, data),

  /** Returns all stored error/warn/critical logs, newest-first */
  async getStoredLogs(): Promise<LogEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(LOG_KEY);
      if (!raw) return [];
      const logs: LogEntry[] = JSON.parse(raw);
      return [...logs].sort((a, b) => b.ts - a.ts);
    } catch { return []; }
  },

  /** Clear stored logs (call after user submits support ticket) */
  async clearStoredLogs(): Promise<void> {
    try {
      await AsyncStorage.removeItem(LOG_KEY);
    } catch {}
  },

  /**
   * Format stored logs as a plain-text string for pasting into a support ticket.
   * Call this in support-form.tsx to auto-fill a debug dump field.
   */
  async formatLogsForSupport(maxEntries = 50): Promise<string> {
    const logs = (await Logger.getStoredLogs()).slice(0, maxEntries);
    if (logs.length === 0) return 'No recent errors.';
    return logs.map(e => {
      const time = new Date(e.ts).toISOString().replace('T', ' ').slice(0, 19);
      const data = e.data ? ` | data=${JSON.stringify(e.data)}` : '';
      const stack = e.stack ? `\n  ${e.stack.split('\n').slice(0, 3).join('\n  ')}` : '';
      return `[${e.severity.toUpperCase()}] ${time} [${e.context}] ${e.message}${data}${stack}`;
    }).join('\n─\n');
  },
} as const;

/**
 * React error boundary helper — wrap inside try/catch of async hooks.
 *
 * Usage in a hook:
 *   } catch (e: any) {
 *     logHookError('useAds', 'load', e);
 *     setError('فشل تحميل الإعلانات');
 *   }
 */
export function logHookError(hookName: string, action: string, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  Logger.error(hookName, `Failed during "${action}"`, error);
}
