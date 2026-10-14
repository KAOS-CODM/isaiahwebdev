/**
 * Small in-memory fixed-window rate limiter.
 *
 * Used to slow down login brute-force attempts. State lives in this process
 * only: it resets on restart and is not shared across instances. That is an
 * accepted limitation for a single-administrator Phase A deployment and is
 * documented in the completion report.
 */

'use strict';

/**
 * Create a rate limiter.
 * @param {{ max: number, windowMs: number, now?: () => number }} options
 * @returns {{
 *   check(key: string): { allowed: boolean, remaining: number, retryAfterMs: number },
 *   record(key: string): void,
 *   reset(key: string): void,
 *   resetAll(): void,
 * }}
 */
function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  /** @type {Map<string, number[]>} */
  const hits = new Map();

  function prune(key, timestamp) {
    const list = hits.get(key);
    if (!list) return [];
    const cutoff = timestamp - windowMs;
    const kept = list.filter((t) => t > cutoff);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
    return kept;
  }

  return {
    check(key) {
      const timestamp = now();
      const list = prune(key, timestamp);
      const allowed = list.length < max;
      const retryAfterMs = allowed ? 0 : Math.max(0, list[0] + windowMs - timestamp);
      return { allowed, remaining: Math.max(0, max - list.length), retryAfterMs };
    },

    record(key) {
      const timestamp = now();
      const list = prune(key, timestamp);
      list.push(timestamp);
      hits.set(key, list);
    },

    reset(key) {
      hits.delete(key);
    },

    resetAll() {
      hits.clear();
    },
  };
}

/** Login attempts allowed per window, per client address. */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const loginRateLimiter = createRateLimiter({ max: LOGIN_MAX_ATTEMPTS, windowMs: LOGIN_WINDOW_MS });

/** First-admin setup attempts allowed per window, per client address. */
const SETUP_MAX_ATTEMPTS = 5;
const SETUP_WINDOW_MS = 60 * 60 * 1000;

const setupRateLimiter = createRateLimiter({ max: SETUP_MAX_ATTEMPTS, windowMs: SETUP_WINDOW_MS });

/** Reset login limiter state (exported for tests). */
function resetLoginRateLimit() {
  loginRateLimiter.resetAll();
}

/** Reset setup limiter state (exported for tests). */
function resetSetupRateLimit() {
  setupRateLimiter.resetAll();
}

module.exports = {
  createRateLimiter,
  loginRateLimiter,
  resetLoginRateLimit,
  setupRateLimiter,
  resetSetupRateLimit,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  SETUP_MAX_ATTEMPTS,
  SETUP_WINDOW_MS,
};
