import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  assertExamWriteCapability,
  enforceExamSessionWriteScope,
  ATTENDANCE_WRITE_ROLES,
} from "./execution-scope-shared";
import {
  ExamCandidateStatus,
  ExamEventAggregateType,
  ExamEventType,
  ExamSessionStatus,
} from "@/modules/examinations/constants";
import {
  bulkMarkExamAttendanceSchema,
  correctExamCandidateAttendanceSchema,
  markExamCandidateAttendanceSchema,
  type BulkMarkExamAttendanceInput,
  type CorrectExamCandidateAttendanceInput,
  type MarkExamCandidateAttendanceInput,
} from "@/modules/examinations/schemas/attendance.schema";
import { findExamCandidateById } from "@/modules/examinations/repositories/exam-candidate.repository";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import {
  createExamAttendance,
  findAttendanceByCandidateId,
  updateExamAttendanceConditionally,
} from "@/modules/examinations/repositories/exam-attendance.repository";
import { recordExamTransition } from "./scheduling-shared";

// =============================================================================
// EXAMINATION ENGINE — EXAM ATTENDANCE COMMANDS (Phase 6)
// -----------------------------------------------------------------------------
// Records exam-day attendance for a REGISTERED candidate. This is an Examination
// Engine fact ONLY — COMPLETELY SEPARATE from the class Attendance Engine (E-10):
// it never writes class attendance, never creates a result / grade / pass-fail,
// never mutates ExamCandidate.status (a DISQUALIFIED *attendance* row is not a
// DISQUALIFIED *candidate*), and never touches progression / transcript /
// certificate. Every mutation follows the BaseCommand pattern (validate →
// authorize → execute in ONE db.$transaction) and writes ExamEvent + audit INSIDE
// the tx via `recordExamTransition` — there is NO domain-event bus / Outbox.
//
// • Mark (perm exams.markAttendance): first record for a candidate; session must
//   be LOCKED or IN_PROGRESS; a duplicate is rejected (ATTENDANCE_ALREADY_MARKED,
//   backed by the @unique examCandidateId — the find-guard AND a P2002 both map to
//   it). It never overwrites.
// • Correct (perm exams.correctAttendance): explicit correction of an existing
//   row; session LOCKED / IN_PROGRESS / COMPLETED; mandatory reason; a CONDITIONAL
//   updateMany pins the previously-read status and asserts count === 1 (race-safe).
// • Bulk mark (perm exams.markAttendance, authorized ONCE up-front): a SELF-CONTAINED
//   sequential runner that re-uses the single Mark command once per item, each in
//   its OWN transaction; per-item errors are captured (never thrown), unknown errors
//   sanitised. It does NOT share a tx and does NOT re-implement the mark rules.
//
// Teacher assignment-scoped marking is DEFERRED (§4): Phase 6 restricts attendance
// to holders of exams.markAttendance / exams.correctAttendance (admin / secretary).
// No teacherId is ever trusted from input.
// =============================================================================

const ATTENDANCE = ExamEventAggregateType.EXAM_ATTENDANCE;
const ENTITY = "ExamAttendance";
const CANDIDATE_ENTITY = "ExamCandidate";
const SESSION_ENTITY = "ExamSession";

/** Sessions in which attendance may be first recorded. */
const MARK_OPEN_STATUSES: string[] = [ExamSessionStatus.LOCKED, ExamSessionStatus.IN_PROGRESS];
/** Sessions in which a recorded attendance may still be corrected (adds COMPLETED). */
const CORRECTION_OPEN_STATUSES: string[] = [
  ExamSessionStatus.LOCKED,
  ExamSessionStatus.IN_PROGRESS,
  ExamSessionStatus.COMPLETED,
];

/** True for a Prisma unique-constraint violation (the @unique examCandidateId). */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

// ─── Mark ────────────────────────────────────────────────────────────────────

/** DTO returned by `MarkExamCandidateAttendanceCommand`. */
export interface MarkExamAttendanceResult {
  attendanceId: string;
  examCandidateId: string;
  examSessionId: string;
  status: string;
  checkedInAt: Date | null;
  markedAt: Date;
}

export class MarkExamCandidateAttendanceCommand extends BaseCommand<
  MarkExamCandidateAttendanceInput,
  MarkExamAttendanceResult
> {
  async validate(): Promise<void> {
    const parsed = markExamCandidateAttendanceSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await assertExamWriteCapability(this.context, PERMISSIONS.EXAMS_MARK_ATTENDANCE);
  }

  async execute(): Promise<MarkExamAttendanceResult> {
    const { organizationId, userId } = this.context;
    const input = markExamCandidateAttendanceSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Candidate (org-scoped) — a missing / cross-tenant candidate is NotFound.
      const candidate = await findExamCandidateById(
        { organizationId, id: input.examCandidateId },
        tx
      );
      if (!candidate) throw new NotFoundError(CANDIDATE_ENTITY, input.examCandidateId);

      // 2. Only a REGISTERED candidate receives attendance.
      if (candidate.status !== ExamCandidateStatus.REGISTERED) {
        throw new BusinessRuleError("CANDIDATE_NOT_REGISTERED", {
          candidateStatus: candidate.status,
        });
      }

      // 3. Session-state gate (LOCKED | IN_PROGRESS).
      const session = await findExamSessionById(
        { organizationId, id: candidate.examSessionId },
        tx
      );
      if (!session) throw new NotFoundError(SESSION_ENTITY, candidate.examSessionId);
      if (!MARK_OPEN_STATUSES.includes(session.status)) {
        throw new BusinessRuleError("SESSION_NOT_OPEN_FOR_ATTENDANCE", {
          sessionStatus: session.status,
        });
      }

      // 3b. Assignment-scoped write gate (ADR-017) — in-tx on the RESOLVED session.
      //     Admin (exams.markAttendance) is unchanged; a teacher must hold
      //     exams.executeAssignedSessions AND an active assignment on this session in
      //     an attendance-authorizing role (CHIEF | INVIGILATOR | MARKER).
      await enforceExamSessionWriteScope(this.context, tx, {
        examSessionId: session.id,
        adminPermission: PERMISSIONS.EXAMS_MARK_ATTENDANCE,
        allowedRoles: ATTENDANCE_WRITE_ROLES,
      });

      // 4. One row per candidate — a duplicate is rejected, never overwritten.
      const existing = await findAttendanceByCandidateId(
        { organizationId, examCandidateId: input.examCandidateId },
        tx
      );
      if (existing) {
        throw new BusinessRuleError("ATTENDANCE_ALREADY_MARKED", { attendanceId: existing.id });
      }

      // 5. Persist. A racing insert (P2002 on the @unique) maps to the same rule.
      const markedAt = new Date();
      let attendance;
      try {
        attendance = await createExamAttendance(
          {
            organizationId,
            examCandidateId: input.examCandidateId,
            status: input.status,
            checkedInAt: input.checkedInAt ?? null,
            markedAt,
            markedById: userId,
            remarks: input.remarks ?? null,
          },
          tx
        );
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new BusinessRuleError("ATTENDANCE_ALREADY_MARKED");
        }
        throw err;
      }

      // 6. ExamEvent + audit inside the tx (no bus). NO candidate/result mutation.
      await recordExamTransition(this.context, tx, {
        aggregateType: ATTENDANCE,
        aggregateId: attendance.id,
        eventType: ExamEventType.EXAM_ATTENDANCE_MARKED,
        entity: ENTITY,
        previousStatus: "",
        newStatus: input.status,
        reason: input.reason ?? null,
        extraNew: {
          attendanceId: attendance.id,
          candidateId: candidate.id,
          sessionId: session.id,
          studentId: candidate.studentId,
          newStatus: input.status,
          checkedInAt: input.checkedInAt ?? null,
          remarks: input.remarks ?? null,
          markedAt,
          markedById: userId,
          markedBy: userId,
        },
      });

      return {
        attendanceId: attendance.id,
        examCandidateId: input.examCandidateId,
        examSessionId: session.id,
        status: input.status,
        checkedInAt: attendance.checkedInAt,
        markedAt,
      };
    });
  }
}

// ─── Correct ───────────────────────────────────────────────────────────────────

/** DTO returned by `CorrectExamCandidateAttendanceCommand`. */
export interface CorrectExamAttendanceResult {
  attendanceId: string;
  examCandidateId: string;
  previousStatus: string;
  status: string;
  markedAt: Date;
}

export class CorrectExamCandidateAttendanceCommand extends BaseCommand<
  CorrectExamCandidateAttendanceInput,
  CorrectExamAttendanceResult
> {
  async validate(): Promise<void> {
    const parsed = correctExamCandidateAttendanceSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await assertExamWriteCapability(this.context, PERMISSIONS.EXAMS_CORRECT_ATTENDANCE);
  }

  async execute(): Promise<CorrectExamAttendanceResult> {
    const { organizationId, userId } = this.context;
    const input = correctExamCandidateAttendanceSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Existing attendance (org-scoped) — missing ⇒ ATTENDANCE_NOT_FOUND.
      const attendance = await findAttendanceByCandidateId(
        { organizationId, examCandidateId: input.examCandidateId },
        tx
      );
      if (!attendance) throw new NotFoundError(ENTITY, input.examCandidateId);

      // 2. Candidate + session (org-scoped) for the state gate.
      const candidate = await findExamCandidateById(
        { organizationId, id: input.examCandidateId },
        tx
      );
      if (!candidate) throw new NotFoundError(CANDIDATE_ENTITY, input.examCandidateId);
      const session = await findExamSessionById(
        { organizationId, id: candidate.examSessionId },
        tx
      );
      if (!session) throw new NotFoundError(SESSION_ENTITY, candidate.examSessionId);
      if (!CORRECTION_OPEN_STATUSES.includes(session.status)) {
        throw new BusinessRuleError("SESSION_NOT_OPEN_FOR_CORRECTION", {
          sessionStatus: session.status,
        });
      }

      // 2b. Assignment-scoped write gate (ADR-017) — in-tx on the RESOLVED session.
      await enforceExamSessionWriteScope(this.context, tx, {
        examSessionId: session.id,
        adminPermission: PERMISSIONS.EXAMS_CORRECT_ATTENDANCE,
        allowedRoles: ATTENDANCE_WRITE_ROLES,
      });

      // 3. Conditional write pinning the previously-read status (race-safe).
      const previousStatus = attendance.status;
      const markedAt = new Date();
      const patch = {
        status: input.status,
        markedAt,
        markedById: userId,
        ...(input.checkedInAt !== undefined ? { checkedInAt: input.checkedInAt } : {}),
        ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
      };
      const updated = await updateExamAttendanceConditionally(
        {
          organizationId,
          examCandidateId: input.examCandidateId,
          expectedStatus: previousStatus,
          patch,
        },
        tx
      );
      if (updated.count !== 1) {
        throw new BusinessRuleError("ATTENDANCE_CORRECTION_CONFLICT", {
          expectedStatus: previousStatus,
        });
      }

      // 4. ExamEvent + audit inside the tx — provenance (previous status) preserved.
      await recordExamTransition(this.context, tx, {
        aggregateType: ATTENDANCE,
        aggregateId: attendance.id,
        eventType: ExamEventType.EXAM_ATTENDANCE_CORRECTED,
        entity: ENTITY,
        previousStatus,
        newStatus: input.status,
        reason: input.reason,
        extraOld: { checkedInAt: attendance.checkedInAt, remarks: attendance.remarks },
        extraNew: {
          attendanceId: attendance.id,
          candidateId: candidate.id,
          sessionId: session.id,
          studentId: candidate.studentId,
          previousStatus,
          newStatus: input.status,
          checkedInAt: input.checkedInAt ?? attendance.checkedInAt,
          remarks: input.remarks ?? attendance.remarks,
          markedAt,
          markedById: userId,
          markedBy: userId,
        },
      });

      return {
        attendanceId: attendance.id,
        examCandidateId: input.examCandidateId,
        previousStatus,
        status: input.status,
        markedAt,
      };
    });
  }
}

// ─── Bulk mark ───────────────────────────────────────────────────────────────

/** Per-item outcome in a bulk-mark run. */
export interface BulkMarkAttendanceItemResult {
  examCandidateId: string;
  ok: boolean;
  code?: string;
  message?: string;
}

/** DTO returned by `BulkMarkExamAttendanceCommand`. Invariant:
 *  `total === succeeded + failed + skipped`. */
export interface BulkMarkExamAttendanceResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: BulkMarkAttendanceItemResult[];
}

/** Map an error into a stable {code,message}: domain errors keep their code +
 *  message; anything unexpected is sanitised to a generic INTERNAL_ERROR. */
function toItemError(err: unknown): { code: string; message: string } {
  if (err instanceof BusinessRuleError) return { code: err.message, message: err.message };
  if (err instanceof NotFoundError) return { code: "NOT_FOUND", message: err.message };
  if (err instanceof ValidationError) return { code: "VALIDATION_ERROR", message: err.message };
  if (err instanceof AuthorizationError) return { code: "FORBIDDEN", message: err.message };
  return { code: "INTERNAL_ERROR", message: "Erro interno ao registar a presença." };
}

export class BulkMarkExamAttendanceCommand extends BaseCommand<
  BulkMarkExamAttendanceInput,
  BulkMarkExamAttendanceResult
> {
  async validate(): Promise<void> {
    const parsed = bulkMarkExamAttendanceSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    // Coarse capability up-front; each delegated single Mark command re-checks the
    // authoritative in-tx assignment gate PER ITEM against that item's own session —
    // so a mixed-session batch can never produce an unauthorized write (ADR-017).
    await assertExamWriteCapability(this.context, PERMISSIONS.EXAMS_MARK_ATTENDANCE);
  }

  async execute(): Promise<BulkMarkExamAttendanceResult> {
    const input = bulkMarkExamAttendanceSchema.parse(this.input);
    const items: BulkMarkAttendanceItemResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let stop = false;

    for (const item of input.items) {
      if (stop) {
        items.push({
          examCandidateId: item.examCandidateId,
          ok: false,
          code: "SKIPPED",
          message: "Ignorado após uma falha anterior (stopOnFailure).",
        });
        skipped += 1;
        continue;
      }

      try {
        // Re-use the single command; it opens its OWN transaction (no shared tx).
        await new MarkExamCandidateAttendanceCommand(
          {
            examCandidateId: item.examCandidateId,
            status: item.status,
            checkedInAt: item.checkedInAt,
            remarks: item.remarks,
            reason: item.reason,
          },
          this.context
        ).run();
        items.push({ examCandidateId: item.examCandidateId, ok: true });
        succeeded += 1;
      } catch (err) {
        const { code, message } = toItemError(err);
        items.push({ examCandidateId: item.examCandidateId, ok: false, code, message });
        failed += 1;
        if (input.stopOnFailure) stop = true;
      }
    }

    return { total: input.items.length, succeeded, failed, skipped, items };
  }
}
