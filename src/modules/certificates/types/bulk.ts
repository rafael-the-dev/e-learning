// =============================================================================
// CERTIFICATE ENGINE — BULK OPERATION CONTRACTS (Phase 13)
// -----------------------------------------------------------------------------
// The generic result/progress shapes shared by every bulk command. The bulk layer
// is an ORCHESTRATOR only: it runs the existing single-item commands sequentially,
// each in its own transaction, and never duplicates a business rule, reads Academic
// Core / the Transcript, or calls the eligibility engine (ADR-002).
// =============================================================================

/** A machine-readable per-item error (never leaks internal detail). */
export interface BulkOperationError {
  code: string;
  message: string;
}

/** The outcome of a single item within a bulk run. `skipped` is true for items not
 *  attempted because an earlier failure stopped the run (`stopOnFailure`). */
export interface BulkOperationItemResult<TInput = unknown, TResult = unknown> {
  index: number;
  success: boolean;
  skipped: boolean;
  input: TInput;
  result?: TResult;
  error?: BulkOperationError;
}

/** The aggregate result of a bulk run. `total === succeeded + failed + skipped`. */
export interface BulkOperationResult<TInput = unknown, TResult = unknown> {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: BulkOperationItemResult<TInput, TResult>[];
}

/** Progress emitted after each ATTEMPTED item (skipped items do not emit). */
export interface BulkProgress<TResult = unknown> {
  processed: number;
  total: number;
  currentIndex: number;
  successes: number;
  failures: number;
  currentResult?: TResult;
}

/** Optional orchestration hooks passed to a bulk command's constructor (NOT input):
 *  a progress callback and a test/override runner for the per-item single command. */
export interface BulkCommandDeps<TItemInput, TItemResult> {
  runItem?: (input: TItemInput) => Promise<TItemResult>;
  onProgress?: (progress: BulkProgress<TItemResult>) => void;
}
