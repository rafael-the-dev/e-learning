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
} from "@/modules/examinations/constants";
import {
  cancelExamPeriodSchema,
  completeExamPeriodSchema,
  createExamPeriodSchema,
  lockExamPeriodSchema,
  openExamPeriodSchema,
  type CancelExamPeriodInput,
  type CompleteExamPeriodInput,
  type CreateExamPeriodCommandInput,
  type LockExamPeriodInput,
  type OpenExamPeriodInput,
} from "@/modules/examinations/schemas/scheduling.schema";
import {
  createExamPeriod,
  findExamPeriodById,
  markExamPeriodCancelled,
  markExamPeriodCompleted,
  markExamPeriodLocked,
  markExamPeriodOpen,
} from "@/modules/examinations/repositories/exam-period.repository";
import {
  recordExamTransition,
  type PeriodCommandResult,
} from "./scheduling-shared";

// =============================================================================
// EXAM PERIOD LIFECYCLE COMMANDS (Phase 4)
// -----------------------------------------------------------------------------
// Create (DRAFT) + the DRAFT→OPEN→LOCKED→COMPLETED and *→CANCELLED transitions.
// Every command authorizes `exams.schedule`, runs in ONE db.$transaction, and —
// for a transition — performs a race-safe conditional write asserting
// `count === 1` (a wrong/terminal/concurrently-moved state ⇒ count 0 ⇒
// BusinessRuleError → the tx rolls back, discarding the event + audit). The
// append-only ExamEvent and the audit row are written INSIDE the tx. There is NO
// domain-event bus (deferred to Phase 14). Terminal-state vocabulary (§4) is
// enforced purely by the conditional writes, not by an ad-hoc status branch.
// =============================================================================

const PERIOD = ExamEventAggregateType.EXAM_PERIOD;
const ENTITY = "ExamPeriod";

async function authorizeSchedule(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_SCHEDULE)) {
    throw new AuthorizationError();
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export class CreateExamPeriodCommand extends BaseCommand<
  CreateExamPeriodCommandInput,
  PeriodCommandResult
> {
  async validate(): Promise<void> {
    const parsed = createExamPeriodSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<PeriodCommandResult> {
    const { organizationId, userId } = this.context;
    const input = createExamPeriodSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const period = await createExamPeriod(
        {
          organizationId,
          name: input.name,
          academicYear: input.academicYear,
          term: input.term ?? null,
          branchId: input.branchId ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: ExamPeriodStatus.DRAFT,
          createdById: userId,
        },
        tx
      );

      // A create is not a state transition (§13 events are transition-based, and
      // no `created` event type exists), so only an audit row is written here.
      await auditService.log(
        this.context,
        {
          entity: ENTITY,
          entityId: period.id,
          action: "exam_period.created",
          oldValues: null,
          newValues: {
            status: period.status,
            name: period.name,
            academicYear: period.academicYear,
            startsAt: period.startsAt,
            endsAt: period.endsAt,
          },
        },
        tx
      );

      return { periodId: period.id, status: period.status };
    });
  }
}

// ─── Open ──────────────────────────────────────────────────────────────────

export class OpenExamPeriodCommand extends BaseCommand<OpenExamPeriodInput, PeriodCommandResult> {
  async validate(): Promise<void> {
    const parsed = openExamPeriodSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<PeriodCommandResult> {
    const { organizationId } = this.context;
    const { periodId } = openExamPeriodSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const period = await findExamPeriodById({ id: periodId, organizationId }, tx);
      if (!period) throw new NotFoundError(ENTITY, periodId);

      const marked = await markExamPeriodOpen({ organizationId, id: periodId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only a DRAFT period can be opened (current status: ${period.status}).`
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: PERIOD,
        aggregateId: periodId,
        eventType: ExamEventType.EXAM_PERIOD_OPENED,
        entity: ENTITY,
        previousStatus: period.status,
        newStatus: ExamPeriodStatus.OPEN,
      });

      return { periodId, status: ExamPeriodStatus.OPEN };
    });
  }
}

// ─── Lock ──────────────────────────────────────────────────────────────────

export class LockExamPeriodCommand extends BaseCommand<LockExamPeriodInput, PeriodCommandResult> {
  async validate(): Promise<void> {
    const parsed = lockExamPeriodSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<PeriodCommandResult> {
    const { organizationId, userId } = this.context;
    const { periodId } = lockExamPeriodSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const period = await findExamPeriodById({ id: periodId, organizationId }, tx);
      if (!period) throw new NotFoundError(ENTITY, periodId);

      const marked = await markExamPeriodLocked({ organizationId, id: periodId, lockedById: userId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only an OPEN period can be locked (current status: ${period.status}).`
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: PERIOD,
        aggregateId: periodId,
        eventType: ExamEventType.EXAM_PERIOD_LOCKED,
        entity: ENTITY,
        previousStatus: period.status,
        newStatus: ExamPeriodStatus.LOCKED,
      });

      return { periodId, status: ExamPeriodStatus.LOCKED };
    });
  }
}

// ─── Complete ────────────────────────────────────────────────────────────────

export class CompleteExamPeriodCommand extends BaseCommand<
  CompleteExamPeriodInput,
  PeriodCommandResult
> {
  async validate(): Promise<void> {
    const parsed = completeExamPeriodSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<PeriodCommandResult> {
    const { organizationId, userId } = this.context;
    const { periodId } = completeExamPeriodSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const period = await findExamPeriodById({ id: periodId, organizationId }, tx);
      if (!period) throw new NotFoundError(ENTITY, periodId);

      const marked = await markExamPeriodCompleted(
        { organizationId, id: periodId, completedById: userId },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only a LOCKED period can be completed (current status: ${period.status}).`
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: PERIOD,
        aggregateId: periodId,
        eventType: ExamEventType.EXAM_PERIOD_COMPLETED,
        entity: ENTITY,
        previousStatus: period.status,
        newStatus: ExamPeriodStatus.COMPLETED,
      });

      return { periodId, status: ExamPeriodStatus.COMPLETED };
    });
  }
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

export class CancelExamPeriodCommand extends BaseCommand<
  CancelExamPeriodInput,
  PeriodCommandResult
> {
  async validate(): Promise<void> {
    const parsed = cancelExamPeriodSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<PeriodCommandResult> {
    const { organizationId, userId } = this.context;
    const { periodId, reason } = cancelExamPeriodSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const period = await findExamPeriodById({ id: periodId, organizationId }, tx);
      if (!period) throw new NotFoundError(ENTITY, periodId);

      const marked = await markExamPeriodCancelled(
        { organizationId, id: periodId, cancelledById: userId },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only a DRAFT | OPEN | LOCKED period can be cancelled (current status: ${period.status}).`
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: PERIOD,
        aggregateId: periodId,
        eventType: ExamEventType.EXAM_PERIOD_CANCELLED,
        entity: ENTITY,
        previousStatus: period.status,
        newStatus: ExamPeriodStatus.CANCELLED,
        reason,
      });

      return { periodId, status: ExamPeriodStatus.CANCELLED };
    });
  }
}
