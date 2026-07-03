import { BaseCommand, AuthorizationError, ValidationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { scanAttendanceEnrollmentBackfill } from "@/modules/attendance/services/attendance-enrollment-backfill-report.service";
import type { BackfillRunResult } from "@/modules/attendance/types/backfill";

// =============================================================================
// BackfillAttendanceRecordEnrollmentIdCommand — Attendance Engine Phase 2
//
// Resolves and (optionally) fills legacy AttendanceRecord.enrollmentId for the
// caller's organization. RBAC-guarded entry point for an admin UI / server
// action; the CLI runner (prisma/backfill-attendance-enrollment-id.ts) calls
// the same scan service directly under an operator-trusted context.
//
// Guarantees:
//   • organization-scoped (context.organizationId only)
//   • dryRun option (no mutation)
//   • batchSize option
//   • NEVER overwrites a non-null enrollmentId (guarded update)
//   • only unambiguous matches are written; ambiguous/unresolved are reported
//   • idempotent — safe to run repeatedly
//
// Behaviour-neutral: fills enrollmentId only. Does not write
// StudentSubjectProgress.attendancePercentage or activate INCOMPLETE.
// =============================================================================

export interface BackfillEnrollmentInput {
  dryRun?: boolean;
  batchSize?: number;
  sampleSize?: number;
}

export class BackfillAttendanceRecordEnrollmentIdCommand extends BaseCommand<
  BackfillEnrollmentInput,
  BackfillRunResult
> {
  async validate(): Promise<void> {
    const { batchSize, sampleSize } = this.input;
    if (batchSize != null && (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000)) {
      throw new ValidationError("Dados inválidos", {
        batchSize: ["O tamanho do lote deve ser um inteiro entre 1 e 5000."],
      });
    }
    if (sampleSize != null && (!Number.isInteger(sampleSize) || sampleSize < 0 || sampleSize > 500)) {
      throw new ValidationError("Dados inválidos", {
        sampleSize: ["O número de amostras deve ser um inteiro entre 0 e 500."],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_RECORDS_BACKFILL_ENROLLMENT)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<BackfillRunResult> {
    const dryRun = this.input.dryRun ?? true; // default to the safe, read-only mode
    const result = await scanAttendanceEnrollmentBackfill(this.context.organizationId, {
      apply: !dryRun,
      batchSize: this.input.batchSize,
      sampleSize: this.input.sampleSize,
    });

    // Audit only a real run that actually changed rows (mirror the engine's
    // "emit only on a real state change" rule — no noise for dry runs / no-ops).
    if (!dryRun && result.updatedRecords > 0) {
      await auditService.log(this.context, {
        entity: "AttendanceRecord",
        entityId: this.context.organizationId,
        action: "attendance_record.enrollment_backfilled",
        newValues: {
          updatedRecords: result.updatedRecords,
          resolvableRecords: result.resolvableRecords,
          ambiguousRecords: result.ambiguousRecords,
          unresolvedRecords: result.unresolvedRecords,
          nullableEnrollmentRecords: result.nullableEnrollmentRecords,
        },
      });
    }

    return result;
  }
}
