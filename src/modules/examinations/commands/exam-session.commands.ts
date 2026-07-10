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
  ExamPeriodStatus,
  ExamSessionStatus,
} from "@/modules/examinations/constants";
import {
  cancelExamSessionSchema,
  completeExamSessionSchema,
  createExamSessionSchema,
  lockExamSessionSchema,
  scheduleExamSessionSchema,
  startExamSessionSchema,
  type CancelExamSessionInput,
  type CompleteExamSessionInput,
  type CreateExamSessionCommandInput,
  type LockExamSessionInput,
  type ScheduleExamSessionInput,
  type StartExamSessionInput,
} from "@/modules/examinations/schemas/scheduling.schema";
import { findExamPeriodById } from "@/modules/examinations/repositories/exam-period.repository";
import { findExamRoomById } from "@/modules/examinations/repositories/exam-room.repository";
import {
  createExamSession,
  findExamSessionById,
  listSessionsByRoomInTimeRange,
  markSessionCancelled,
  markSessionCompleted,
  markSessionLocked,
  markSessionScheduled,
  markSessionStarted,
} from "@/modules/examinations/repositories/exam-session.repository";
import {
  recordExamTransition,
  type SessionCommandResult,
} from "./scheduling-shared";

// =============================================================================
// EXAM SESSION LIFECYCLE COMMANDS (Phase 4)
// -----------------------------------------------------------------------------
// Create (DRAFT) + DRAFT→SCHEDULED→LOCKED→IN_PROGRESS→COMPLETED and *→CANCELLED.
// All authorize `exams.schedule` and run in ONE db.$transaction. Transitions are
// race-safe conditional writes asserting `count === 1`; ExamEvent + audit are
// written INSIDE the tx (rollback discards both). NO domain-event bus (Phase 14).
//
// CreateExamSessionCommand enforces the scheduling constraints (E-3a / E-9) as
// COMMAND-LEVEL reads: period schedulable + session window inside the period +
// referenced LevelSubject exists + (when a room is chosen) capacity ≤ room and no
// overlapping session in that room. The room-overlap check is a read followed by
// a create, so a NARROW read-race window exists (two concurrent creates could
// both pass); the design accepts this in v1 — the DB filtered-unique indexes and
// a later maintenance pass are the backstop, per ADR-013 §6/E-3a.
// =============================================================================

const SESSION = ExamEventAggregateType.EXAM_SESSION;
const ENTITY = "ExamSession";

async function authorizeSchedule(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_SCHEDULE)) {
    throw new AuthorizationError();
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export class CreateExamSessionCommand extends BaseCommand<
  CreateExamSessionCommandInput,
  SessionCommandResult
> {
  async validate(): Promise<void> {
    const parsed = createExamSessionSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<SessionCommandResult> {
    const { organizationId, userId } = this.context;
    const input = createExamSessionSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const period = await findExamPeriodById({ id: input.periodId, organizationId }, tx);
      if (!period) throw new NotFoundError("ExamPeriod", input.periodId);

      if (period.status !== ExamPeriodStatus.OPEN && period.status !== ExamPeriodStatus.LOCKED) {
        throw new BusinessRuleError("EXAM_PERIOD_NOT_SCHEDULABLE", { periodStatus: period.status });
      }

      if (input.startsAt < period.startsAt || input.endsAt > period.endsAt) {
        throw new BusinessRuleError("SESSION_OUTSIDE_PERIOD");
      }

      // LevelSubject existence check (Academic Core FK): a light validation read,
      // NOT a cross-engine fact consumption — the eligibility ACL owns facts.
      const levelSubject = await tx.levelSubject.findFirst({
        where: { id: input.levelSubjectId, organizationId },
        select: { id: true },
      });
      if (!levelSubject) throw new NotFoundError("LevelSubject", input.levelSubjectId);

      if (input.roomId) {
        const room = await findExamRoomById({ id: input.roomId, organizationId }, tx);
        if (!room) throw new NotFoundError("ExamRoom", input.roomId);

        if (input.capacity > room.capacity) {
          throw new BusinessRuleError("SESSION_OVER_ROOM_CAPACITY", {
            requested: input.capacity,
            roomCapacity: room.capacity,
          });
        }

        const overlapping = await listSessionsByRoomInTimeRange(
          { organizationId, roomId: input.roomId, startsAt: input.startsAt, endsAt: input.endsAt },
          tx
        );
        if (overlapping.length > 0) {
          throw new BusinessRuleError("ROOM_TIME_CONFLICT", { conflictCount: overlapping.length });
        }
      }

      const title = input.title ?? period.name;

      const session = await createExamSession(
        {
          organizationId,
          periodId: input.periodId,
          levelSubjectId: input.levelSubjectId,
          courseId: input.courseId ?? null,
          courseLevelId: input.courseLevelId ?? null,
          branchId: input.branchId ?? null,
          roomId: input.roomId ?? null,
          title,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          capacity: input.capacity,
          instructions: input.instructions ?? null,
          status: ExamSessionStatus.DRAFT,
          createdById: userId,
        },
        tx
      );

      // A create is not a state transition (§13), so only an audit row is written.
      await auditService.log(
        this.context,
        {
          entity: ENTITY,
          entityId: session.id,
          action: "exam_session.created",
          oldValues: null,
          newValues: {
            status: session.status,
            periodId: session.periodId,
            levelSubjectId: session.levelSubjectId,
            roomId: session.roomId,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            capacity: session.capacity,
          },
        },
        tx
      );

      return { sessionId: session.id, status: session.status };
    });
  }
}

// ─── Schedule ────────────────────────────────────────────────────────────────

export class ScheduleExamSessionCommand extends BaseCommand<
  ScheduleExamSessionInput,
  SessionCommandResult
> {
  async validate(): Promise<void> {
    const parsed = scheduleExamSessionSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<SessionCommandResult> {
    const { organizationId } = this.context;
    const { sessionId } = scheduleExamSessionSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const session = await findExamSessionById({ id: sessionId, organizationId }, tx);
      if (!session) throw new NotFoundError(ENTITY, sessionId);

      const marked = await markSessionScheduled({ organizationId, id: sessionId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only a DRAFT session can be scheduled (current status: ${session.status}).`
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: SESSION,
        aggregateId: sessionId,
        eventType: ExamEventType.EXAM_SESSION_SCHEDULED,
        entity: ENTITY,
        previousStatus: session.status,
        newStatus: ExamSessionStatus.SCHEDULED,
      });

      return { sessionId, status: ExamSessionStatus.SCHEDULED };
    });
  }
}

// ─── Lock ──────────────────────────────────────────────────────────────────

export class LockExamSessionCommand extends BaseCommand<LockExamSessionInput, SessionCommandResult> {
  async validate(): Promise<void> {
    const parsed = lockExamSessionSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<SessionCommandResult> {
    const { organizationId, userId } = this.context;
    const { sessionId } = lockExamSessionSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const session = await findExamSessionById({ id: sessionId, organizationId }, tx);
      if (!session) throw new NotFoundError(ENTITY, sessionId);

      const marked = await markSessionLocked({ organizationId, id: sessionId, lockedById: userId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only a SCHEDULED session can be locked (current status: ${session.status}).`
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: SESSION,
        aggregateId: sessionId,
        eventType: ExamEventType.EXAM_SESSION_LOCKED,
        entity: ENTITY,
        previousStatus: session.status,
        newStatus: ExamSessionStatus.LOCKED,
      });

      return { sessionId, status: ExamSessionStatus.LOCKED };
    });
  }
}

// ─── Start ──────────────────────────────────────────────────────────────────

export class StartExamSessionCommand extends BaseCommand<StartExamSessionInput, SessionCommandResult> {
  async validate(): Promise<void> {
    const parsed = startExamSessionSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<SessionCommandResult> {
    const { organizationId } = this.context;
    const { sessionId } = startExamSessionSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const session = await findExamSessionById({ id: sessionId, organizationId }, tx);
      if (!session) throw new NotFoundError(ENTITY, sessionId);

      const marked = await markSessionStarted({ organizationId, id: sessionId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only a LOCKED session can be started (current status: ${session.status}).`
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: SESSION,
        aggregateId: sessionId,
        eventType: ExamEventType.EXAM_SESSION_STARTED,
        entity: ENTITY,
        previousStatus: session.status,
        newStatus: ExamSessionStatus.IN_PROGRESS,
      });

      return { sessionId, status: ExamSessionStatus.IN_PROGRESS };
    });
  }
}

// ─── Complete ────────────────────────────────────────────────────────────────

export class CompleteExamSessionCommand extends BaseCommand<
  CompleteExamSessionInput,
  SessionCommandResult
> {
  async validate(): Promise<void> {
    const parsed = completeExamSessionSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<SessionCommandResult> {
    const { organizationId, userId } = this.context;
    const { sessionId } = completeExamSessionSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const session = await findExamSessionById({ id: sessionId, organizationId }, tx);
      if (!session) throw new NotFoundError(ENTITY, sessionId);

      const marked = await markSessionCompleted({ organizationId, id: sessionId, completedById: userId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only an IN_PROGRESS session can be completed (current status: ${session.status}).`
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: SESSION,
        aggregateId: sessionId,
        eventType: ExamEventType.EXAM_SESSION_COMPLETED,
        entity: ENTITY,
        previousStatus: session.status,
        newStatus: ExamSessionStatus.COMPLETED,
      });

      return { sessionId, status: ExamSessionStatus.COMPLETED };
    });
  }
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

export class CancelExamSessionCommand extends BaseCommand<
  CancelExamSessionInput,
  SessionCommandResult
> {
  async validate(): Promise<void> {
    const parsed = cancelExamSessionSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<SessionCommandResult> {
    const { organizationId, userId } = this.context;
    const { sessionId, reason } = cancelExamSessionSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const session = await findExamSessionById({ id: sessionId, organizationId }, tx);
      if (!session) throw new NotFoundError(ENTITY, sessionId);

      const marked = await markSessionCancelled({ organizationId, id: sessionId, cancelledById: userId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only a DRAFT | SCHEDULED | LOCKED session can be cancelled (current status: ${session.status}).`
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: SESSION,
        aggregateId: sessionId,
        eventType: ExamEventType.EXAM_SESSION_CANCELLED,
        entity: ENTITY,
        previousStatus: session.status,
        newStatus: ExamSessionStatus.CANCELLED,
        reason,
      });

      return { sessionId, status: ExamSessionStatus.CANCELLED };
    });
  }
}
