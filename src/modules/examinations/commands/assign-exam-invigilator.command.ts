import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  ExamEventAggregateType,
  ExamEventType,
  ExamSessionStatus,
} from "@/modules/examinations/constants";
import {
  assignExamInvigilatorSchema,
  type AssignExamInvigilatorInput,
} from "@/modules/examinations/schemas/scheduling.schema";
import { findExamSessionById, listSessionsByInvigilatorInTimeRange } from "@/modules/examinations/repositories/exam-session.repository";
import {
  createInvigilatorAssignment,
  findAssignmentBySessionTeacher,
  findAssignmentBySessionUser,
} from "@/modules/examinations/repositories/exam-invigilator-assignment.repository";
import { createExamEvent } from "@/modules/examinations/repositories/exam-event.repository";
import type { InvigilatorAssignmentResult } from "./scheduling-shared";

// =============================================================================
// ASSIGN EXAM INVIGILATOR COMMAND (Phase 4)
// -----------------------------------------------------------------------------
// Staffs a teacher OR a user (exactly one — enforced by the schema) onto an
// assignable session in a role. Authorizes `exams.schedule`; runs in ONE
// db.$transaction. The session must be pre-sitting (DRAFT | SCHEDULED | LOCKED);
// duplicates (same session + teacher/user) and time-overlap with the invigilator's
// other live sessions are COMMAND-LEVEL blocks (E-3a) — the filtered-unique
// indexes are the ultimate race-safe backstop for duplicates. The overlap check
// is a read followed by a create, so a NARROW read-race window exists (documented
// in ADR-013 §6). Writes an append-only ExamEvent (`exam_invigilator.assigned`,
// aggregate EXAM_INVIGILATOR_ASSIGNMENT) + an audit row inside the tx. No bus.
// =============================================================================

const ASSIGNABLE_STATUSES: string[] = [
  ExamSessionStatus.DRAFT,
  ExamSessionStatus.SCHEDULED,
  ExamSessionStatus.LOCKED,
];

export class AssignExamInvigilatorCommand extends BaseCommand<
  AssignExamInvigilatorInput,
  InvigilatorAssignmentResult
> {
  async validate(): Promise<void> {
    const parsed = assignExamInvigilatorSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.EXAMS_SCHEDULE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<InvigilatorAssignmentResult> {
    const { organizationId, userId } = this.context;
    const input = assignExamInvigilatorSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const session = await findExamSessionById({ id: input.examSessionId, organizationId }, tx);
      if (!session) throw new NotFoundError("ExamSession", input.examSessionId);

      if (!ASSIGNABLE_STATUSES.includes(session.status)) {
        throw new BusinessRuleError("SESSION_NOT_ASSIGNABLE", { sessionStatus: session.status });
      }

      // Duplicate guard (command-level; filtered-unique index is the backstop).
      const duplicate = input.teacherId
        ? await findAssignmentBySessionTeacher(
            { organizationId, examSessionId: input.examSessionId, teacherId: input.teacherId },
            tx
          )
        : await findAssignmentBySessionUser(
            { organizationId, examSessionId: input.examSessionId, userId: input.userId as string },
            tx
          );
      if (duplicate) {
        throw new BusinessRuleError("INVIGILATOR_ALREADY_ASSIGNED");
      }

      // Time-overlap with the invigilator's other live sessions (exclude self).
      const overlapping = (
        await listSessionsByInvigilatorInTimeRange(
          {
            organizationId,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            teacherId: input.teacherId,
            userId: input.userId,
          },
          tx
        )
      ).filter((s) => s.id !== input.examSessionId);
      if (overlapping.length > 0) {
        throw new BusinessRuleError("INVIGILATOR_TIME_CONFLICT", { conflictCount: overlapping.length });
      }

      const assignment = await createInvigilatorAssignment(
        {
          organizationId,
          examSessionId: input.examSessionId,
          teacherId: input.teacherId ?? null,
          userId: input.userId ?? null,
          role: input.role,
          assignedAt: now,
          assignedById: userId,
        },
        tx
      );

      await createExamEvent(
        {
          organizationId,
          aggregateType: ExamEventAggregateType.EXAM_INVIGILATOR_ASSIGNMENT,
          aggregateId: assignment.id,
          eventType: ExamEventType.EXAM_INVIGILATOR_ASSIGNED,
          actorId: userId,
          metadata: JSON.stringify({
            examSessionId: assignment.examSessionId,
            teacherId: assignment.teacherId,
            userId: assignment.userId,
            role: assignment.role,
          }),
        },
        tx
      );

      await auditService.log(
        this.context,
        {
          entity: "ExamInvigilatorAssignment",
          entityId: assignment.id,
          action: ExamEventType.EXAM_INVIGILATOR_ASSIGNED,
          oldValues: null,
          newValues: {
            examSessionId: assignment.examSessionId,
            teacherId: assignment.teacherId,
            userId: assignment.userId,
            role: assignment.role,
          },
        },
        tx
      );

      return {
        assignmentId: assignment.id,
        examSessionId: assignment.examSessionId,
        role: assignment.role,
      };
    });
  }
}
