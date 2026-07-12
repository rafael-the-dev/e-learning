import {
  AuthorizationError,
  BusinessRuleError,
  ConcurrencyError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";

// =============================================================================
// BulkOperationRunner (portal layer) — the ONE sequential runner behind every
// bulk endpoint (Sprint UX 2.1). It does NOT know any domain rule: each caller
// supplies the items, a ref extractor, and a `run(item)` that builds + executes
// an EXISTING command. The runner loops, captures a typed per-item result, keeps
// going (unless stopOnFailure), and returns a uniform summary for toast / progress
// / audit / future export. No new commands, no duplicated per-endpoint loops.
// =============================================================================

export type BulkItemStatus = "succeeded" | "skipped" | "failed";

export interface BulkItemResult<R = unknown> {
  /** Stable identifier of the item (e.g. examCandidateId / examResultId). */
  ref: string;
  status: BulkItemStatus;
  /** Typed code for skips/failures (domain code, or a sanitised category). */
  code?: string;
  message?: string;
  /** The command's result on success. */
  data?: R;
}

export interface BulkSummary<R = unknown> {
  total: number;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  durationMs: number;
  results: BulkItemResult<R>[];
}

export interface RunBulkOptions<TItem, R> {
  items: TItem[];
  /** Stable ref for the UI to reconcile a row with its outcome. */
  ref: (item: TItem) => string;
  /** Build + execute the existing command for one item. */
  run: (item: TItem) => Promise<R>;
  /** Domain codes that count as SKIPPED (not FAILED) — e.g. already-in-state. */
  skipCodes?: string[];
  /** Stop after the first hard failure (default false: best-effort, partial success). */
  stopOnFailure?: boolean;
  /** Injected clock (tests). Defaults to Date.now. */
  now?: () => number;
}

/** Map an error to a stable {status, code, message}. Domain skip-codes become
 *  SKIPPED; every other typed error is FAILED with its category; anything
 *  unexpected is sanitised so no internal detail leaks to the client. */
function classify(err: unknown, skipCodes: Set<string>): { status: BulkItemStatus; code: string; message: string } {
  if (err instanceof BusinessRuleError) {
    const code = err.message;
    return { status: skipCodes.has(code) ? "skipped" : "failed", code, message: code };
  }
  if (err instanceof NotFoundError) return { status: "failed", code: "NOT_FOUND", message: err.message };
  if (err instanceof ValidationError) return { status: "failed", code: "VALIDATION_ERROR", message: err.message };
  if (err instanceof AuthorizationError) return { status: "failed", code: "FORBIDDEN", message: err.message };
  if (err instanceof ConcurrencyError) return { status: "failed", code: "CONFLICT", message: err.message };
  return { status: "failed", code: "INTERNAL_ERROR", message: "Erro interno ao processar o item." };
}

export async function runBulk<TItem, R>({
  items,
  ref,
  run,
  skipCodes = [],
  stopOnFailure = false,
  now = () => Date.now(),
}: RunBulkOptions<TItem, R>): Promise<BulkSummary<R>> {
  const startedAt = now();
  const skip = new Set(skipCodes);
  const results: BulkItemResult<R>[] = [];
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  let stopped = false;

  for (const item of items) {
    if (stopped) {
      results.push({ ref: ref(item), status: "skipped", code: "SKIPPED", message: "Ignorado após uma falha anterior." });
      skipped += 1;
      continue;
    }
    try {
      const data = await run(item);
      results.push({ ref: ref(item), status: "succeeded", data });
      succeeded += 1;
    } catch (err) {
      const c = classify(err, skip);
      results.push({ ref: ref(item), status: c.status, code: c.code, message: c.message });
      if (c.status === "skipped") skipped += 1;
      else {
        failed += 1;
        if (stopOnFailure) stopped = true;
      }
    }
  }

  return {
    total: items.length,
    processed: succeeded + skipped + failed,
    succeeded,
    skipped,
    failed,
    durationMs: now() - startedAt,
    results,
  };
}
