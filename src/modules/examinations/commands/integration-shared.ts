import type { PrismaClientOrTx } from "@/server/db";
import type { ServiceContext } from "@/shared/types/common";
import {
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import type { ExamEventRecord } from "@/modules/examinations/types/repository";
import { ExamEventType, ExamResultCode } from "@/modules/examinations/constants";
import type { OfficialExamResultIntegrationDto } from "@/modules/examinations/services/examination-grade-integration.source";

// =============================================================================
// EXAMINATION ENGINE — GRADE/PROGRESSION INTEGRATION SHARED (Phase 11; pure)
// -----------------------------------------------------------------------------
// Pure helpers + injected PORTS + DTOs for the official published-result integration
// boundary (E-13). Everything here is side-effect-free: the pure functions never do IO
// and never throw; the ports are INTERFACES the command depends on so production wires
// the real (isolated) Grade/Progression adapters and tests inject fakes. This module
// NEVER imports the Grade / Progression / Transcript / Certificate engines, never writes
// their tables, and carries NO final-grade / pass-fail / weighting logic — a SCORED exam
// score maps 1:1 to the grade + its already-resolved normalized percentage; a non-scored
// outcome is UNSUPPORTED, never a silent 0. Idempotency/staleness is derived purely from
// the append-only ExamEvent metadata ledger (no ledger table).
// =============================================================================

// ─── Ports (dependency-injection seams) ──────────────────────────────────────

/** Resolves the exam result to a Grade Engine assessment component + subject. Since
 *  Phase 11B the production default resolves the session's explicit
 *  `ExamGradeComponentBinding` (returning `null` only when the session is unbound →
 *  EXAM_RESULT_INTEGRATION_UNSUPPORTED, never a heuristic); tests may inject a fake. */
export interface ExamGradeComponentResolverPort {
  resolve(
    dto: OfficialExamResultIntegrationDto,
    client?: PrismaClientOrTx
  ): Promise<{ assessmentComponentId: string; subjectId: string } | null>;
}

export interface ExamGradeApplyInput {
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  levelSubjectId: string;
  subjectId: string;
  assessmentComponentId: string;
  grade: number;
  maxGrade: number;
  normalizedGrade: number;
  actorId: string;
  reason: string;
  officialVersion: string;
}

export interface ExamGradeApplyResult {
  gradeRecordId: string;
  action: "CREATED" | "UPDATED" | "UNCHANGED";
  progressionStatus: string | null;
}

/** Writes the grade through the canonical Grade Engine path (single grade writer).
 *  The Examination Engine NEVER touches the grade tables — it calls this port. */
export interface ExamGradeWritePort {
  apply(
    input: ExamGradeApplyInput,
    context: ServiceContext,
    client: PrismaClientOrTx
  ): Promise<ExamGradeApplyResult>;
}

export interface ExamProgressionConfirmInput {
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
}

export interface ExamProgressionConfirmResult {
  recalculated: boolean;
  status: string | null;
}

/** Confirms the subject-progression outcome (the canonical grade mutation already
 *  cascades progression — this CONFIRMS the resulting status, it does not re-run it,
 *  to avoid a double cascade). The Progression Engine remains the single owner. */
export interface ExamProgressionConfirmPort {
  confirm(
    input: ExamProgressionConfirmInput,
    context: ServiceContext,
    client: PrismaClientOrTx
  ): Promise<ExamProgressionConfirmResult>;
}

/** Optional ports bundle a command constructor accepts (defaults to production). */
export interface IntegrationPorts {
  resolver?: ExamGradeComponentResolverPort;
  gradePort?: ExamGradeWritePort;
  progressionPort?: ExamProgressionConfirmPort;
}

// ─── Pure outcome → grade mapping ─────────────────────────────────────────────

export type ExamOutcomeGradeMapping =
  | { supported: true; grade: number; maxGrade: number; normalizedGrade: number }
  | { supported: false; reason: "NON_SCORED_OUTCOME" };

/**
 * Map an official exam outcome to a grade (pure). ONLY a SCORED result with a non-null
 * score AND a non-null resolved normalizedScore is integratable — grade = score,
 * maxGrade = maxScore, normalizedGrade = the ALREADY-resolved normalized percentage
 * (never recomputed here). ABSENT / EXCUSED / DISQUALIFIED (or a SCORED result missing
 * its numbers) is NON_SCORED_OUTCOME — NEVER converted to a grade of 0. This is not a
 * final grade and carries no pass/fail meaning.
 */
export function mapExamOutcomeToGrade(dto: OfficialExamResultIntegrationDto): ExamOutcomeGradeMapping {
  if (dto.resultCode === ExamResultCode.SCORED && dto.score != null && dto.normalizedScore != null) {
    return {
      supported: true,
      grade: dto.score,
      maxGrade: dto.maxScore,
      normalizedGrade: dto.normalizedScore,
    };
  }
  return { supported: false, reason: "NON_SCORED_OUTCOME" };
}

// ─── Pure ledger helpers (over the append-only ExamEvent stream) ──────────────

const INTEGRATION_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  ExamEventType.EXAM_RESULT_INTEGRATED,
  ExamEventType.EXAM_RESULT_INTEGRATION_RECONCILED,
]);

/**
 * The latest (chronologically) `officialVersion` recorded on an integration event in
 * the aggregate's event stream, or `null` when none exists. Pure: parses each event's
 * JSON `metadata`, tolerates malformed / non-integration rows, never throws. The caller
 * passes the CHRONOLOGICAL event list (as `listExamEventsByAggregate` returns), so the
 * last matching value wins.
 */
export function latestIntegratedVersion(events: ExamEventRecord[]): string | null {
  let latest: string | null = null;
  for (const e of events) {
    if (!INTEGRATION_EVENT_TYPES.has(e.eventType)) continue;
    if (!e.metadata) continue;
    try {
      const parsed = JSON.parse(e.metadata) as { officialVersion?: unknown };
      if (typeof parsed.officialVersion === "string") latest = parsed.officialVersion;
    } catch {
      // Malformed metadata is ignored — the ledger tolerates unknown rows.
    }
  }
  return latest;
}

export type ExamGradeState = "MISSING" | "CURRENT" | "STALE";

/** Compare the current official version against the last integrated one (pure). */
export function gradeStateFor(currentVersion: string, ledgerVersion: string | null): ExamGradeState {
  if (ledgerVersion === null) return "MISSING";
  return ledgerVersion === currentVersion ? "CURRENT" : "STALE";
}

// ─── Per-item error sanitiser (pure classification; never throws) ─────────────

/** Map an error to a stable `{ code, message }`: domain errors keep their code +
 *  message; anything unexpected is sanitised to a generic INTERNAL_ERROR. */
export function toIntegrationItemError(err: unknown): { code: string; message: string } {
  if (err instanceof BusinessRuleError) return { code: err.message, message: err.message };
  if (err instanceof NotFoundError) return { code: "NOT_FOUND", message: err.message };
  if (err instanceof ValidationError) return { code: "VALIDATION_ERROR", message: err.message };
  if (err instanceof AuthorizationError) return { code: "FORBIDDEN", message: err.message };
  return { code: "INTERNAL_ERROR", message: "Erro interno ao integrar o resultado do exame." };
}

// ─── Command DTOs ─────────────────────────────────────────────────────────────

/** DTO returned by `IntegratePublishedExamResultCommand`. */
export interface IntegrateExamResultResult {
  examResultId: string;
  officialVersion: string;
  currentRevisionId: string | null;
  gradeRecordId: string | null;
  gradeAction: "CREATED" | "UPDATED" | "UNCHANGED";
  progressionRecalculated: boolean;
  progressionStatus: string | null;
  integratedAt: Date;
}

export type ReconcileGradeState = "MISSING" | "CURRENT" | "STALE" | "UNSUPPORTED";
export type ReconcileProgressionState = "NOT_RUN" | "CURRENT" | "REQUIRES_RECALCULATION";

/** DTO returned by `ReconcileExamResultIntegrationCommand`. */
export interface ReconcileIntegrationResult {
  examResultId: string;
  officialVersion: string;
  gradeState: ReconcileGradeState;
  progressionState: ReconcileProgressionState;
  wouldChange: boolean;
  changed: boolean;
  errors: string[];
}

/** Derive the reconciliation progression-state from the grade-state verdict (pure). */
export function reconcileProgressionState(
  gradeState: ReconcileGradeState,
  wouldChange: boolean
): ReconcileProgressionState {
  if (wouldChange) return "REQUIRES_RECALCULATION";
  if (gradeState === "CURRENT") return "CURRENT";
  return "NOT_RUN";
}

/** Per-item outcome in a session-level integration run. */
export interface IntegrateExamSessionResultsItem {
  examResultId: string;
  ok: boolean;
  code?: string;
  message?: string;
  gradeAction?: "CREATED" | "UPDATED" | "UNCHANGED";
}

/** DTO returned by `IntegrateExamSessionResultsCommand`. Invariant:
 *  `total === succeeded + failed + skipped`. */
export interface IntegrateExamSessionResultsResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: IntegrateExamSessionResultsItem[];
}
