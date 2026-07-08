// =============================================================================
// PUBLIC VERIFICATION — RATE LIMITER (Phase 7) — minimal seam
// -----------------------------------------------------------------------------
// A tiny in-memory fixed-window limiter for the unauthenticated public
// verification endpoint. It is deliberately NOT overbuilt: it exists so the route
// has a real throttle and a stable call site.
//
// PRODUCTION TODO: this counter lives in a single process's memory, so it does NOT
// coordinate across serverless instances / regions. Before relying on it as a hard
// abuse control, back it with a shared store (Redis / Upstash / an edge KV) or move
// the check into edge middleware. The `checkRateLimit` signature is the seam: swap
// the body for a distributed implementation and every caller stays unchanged.
//
// `now` is injectable for deterministic tests; callers omit it in production.
// =============================================================================

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injected clock (ms since epoch); defaults to `Date.now()`. */
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowState>();

/** Fixed-window check-and-increment for a key (e.g. an IP). Counts the current
 *  request; returns `allowed: false` once the window's `limit` is exceeded. */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, options.limit - 1), resetAt };
  }

  existing.count += 1;
  const allowed = existing.count <= options.limit;
  return {
    allowed,
    remaining: Math.max(0, options.limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/** Test seam: drop all window state. */
export function __resetRateLimiter(): void {
  buckets.clear();
}
