import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimiter, checkRateLimit } from "../public-rate-limiter";

// =============================================================================
// public-rate-limiter — deterministic tests (Phase 7, §7/§17)
// -----------------------------------------------------------------------------
// Fixed-window limiter with an injected clock. Proves the throttle actually
// blocks past the limit and resets after the window. (In-memory seam — production
// TODO documented in the source.)
// =============================================================================

const OPTS = (now: number) => ({ limit: 3, windowMs: 1000, now });

beforeEach(() => __resetRateLimiter());

describe("checkRateLimit", () => {
  it("17. allows up to the limit, then blocks within the window", () => {
    expect(checkRateLimit("ip-1", OPTS(0)).allowed).toBe(true); // 1
    expect(checkRateLimit("ip-1", OPTS(100)).allowed).toBe(true); // 2
    const third = checkRateLimit("ip-1", OPTS(200));
    expect(third.allowed).toBe(true); // 3
    expect(third.remaining).toBe(0);
    expect(checkRateLimit("ip-1", OPTS(300)).allowed).toBe(false); // 4 → blocked
  });

  it("resets after the window elapses", () => {
    checkRateLimit("ip-2", OPTS(0));
    checkRateLimit("ip-2", OPTS(0));
    checkRateLimit("ip-2", OPTS(0));
    expect(checkRateLimit("ip-2", OPTS(500)).allowed).toBe(false);
    // Window (1000ms) has passed → fresh allowance.
    expect(checkRateLimit("ip-2", OPTS(1000)).allowed).toBe(true);
  });

  it("tracks keys independently (per-IP isolation)", () => {
    checkRateLimit("ip-a", OPTS(0));
    checkRateLimit("ip-a", OPTS(0));
    checkRateLimit("ip-a", OPTS(0));
    expect(checkRateLimit("ip-a", OPTS(0)).allowed).toBe(false);
    // A different IP is unaffected.
    expect(checkRateLimit("ip-b", OPTS(0)).allowed).toBe(true);
  });
});
