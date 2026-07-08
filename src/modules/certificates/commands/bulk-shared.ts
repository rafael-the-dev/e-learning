import {
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import type {
  BulkOperationError,
  BulkOperationItemResult,
  BulkOperationResult,
  BulkProgress,
} from "@/modules/certificates/types/bulk";

// =============================================================================
// BULK ORCHESTRATION — SHARED RUNNER (Phase 13)
// -----------------------------------------------------------------------------
// The sequential engine every bulk command uses. It runs items ONE AT A TIME (no
// parallelism), each through the caller-supplied `runItem` (which wraps an existing
// single-item command in its OWN transaction). A single item's failure NEVER
// rolls back earlier successes and NEVER throws out of the run — it is captured as
// a per-item error and the run continues (or stops, leaving the rest `skipped`,
// when `stopOnFailure` is set). This module holds NO business rule.
// =============================================================================

/** Map a thrown command error to a stable per-item `{ code, message }`. Unknown
 *  errors collapse to a generic INTERNAL (never leaks stack/SQL/internal detail). */
export function mapBulkError(err: unknown): BulkOperationError {
  if (err instanceof ValidationError) return { code: "VALIDATION", message: err.message };
  if (err instanceof AuthorizationError) return { code: "FORBIDDEN", message: err.message };
  if (err instanceof NotFoundError) return { code: "NOT_FOUND", message: err.message };
  if (err instanceof BusinessRuleError) return { code: "BUSINESS_RULE", message: err.message };
  return { code: "INTERNAL", message: "Erro interno ao processar o item" };
}

export interface RunBulkParams<TInput, TResult> {
  items: TInput[];
  stopOnFailure: boolean;
  /** Runs ONE item (wrapping a single-item command in its own transaction). */
  runItem: (input: TInput, index: number) => Promise<TResult>;
  onProgress?: (progress: BulkProgress<TResult>) => void;
}

/** Run items sequentially, collecting a per-item outcome. Never throws for an item
 *  failure. When `stopOnFailure` and an item fails, the remaining items are marked
 *  `skipped` (not attempted). */
export async function runBulkSequential<TInput, TResult>(
  params: RunBulkParams<TInput, TResult>
): Promise<BulkOperationResult<TInput, TResult>> {
  const { items, stopOnFailure, runItem, onProgress } = params;
  const results: BulkOperationItemResult<TInput, TResult>[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let stopped = false;

  for (let index = 0; index < items.length; index += 1) {
    const input = items[index];

    if (stopped) {
      skipped += 1;
      results.push({ index, success: false, skipped: true, input });
      continue;
    }

    try {
      const result = await runItem(input, index);
      succeeded += 1;
      results.push({ index, success: true, skipped: false, input, result });
      onProgress?.({ processed: index + 1, total: items.length, currentIndex: index, successes: succeeded, failures: failed, currentResult: result });
    } catch (err) {
      failed += 1;
      results.push({ index, success: false, skipped: false, input, error: mapBulkError(err) });
      onProgress?.({ processed: index + 1, total: items.length, currentIndex: index, successes: succeeded, failures: failed });
      if (stopOnFailure) stopped = true;
    }
  }

  return { total: items.length, succeeded, failed, skipped, items: results };
}
