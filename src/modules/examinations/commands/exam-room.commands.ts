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
  archiveExamRoomSchema,
  createExamRoomSchema,
  updateExamRoomSchema,
  type ArchiveExamRoomCommandInput,
  type CreateExamRoomCommandInput,
  type UpdateExamRoomCommandInput,
} from "@/modules/examinations/schemas/scheduling.schema";
import {
  archiveExamRoom,
  createExamRoom,
  findExamRoomByCode,
  findExamRoomById,
  findFutureSessionsByRoom,
  updateExamRoomMetadata,
} from "@/modules/examinations/repositories/exam-room.repository";
import type { RoomCommandResult } from "./scheduling-shared";

// =============================================================================
// EXAM ROOM COMMANDS (Phase 4)
// -----------------------------------------------------------------------------
// Local v1 venue model (D11). Create / update metadata / archive (soft delete).
// All authorize `exams.schedule` and run in ONE db.$transaction. ExamRoom has no
// lifecycle transition in the frozen event vocabulary (§13), so these commands
// write an audit row only — NO ExamEvent, NO domain-event bus. The archive guard
// (no future sessions) and the duplicate-code check are COMMAND-LEVEL reads; the
// filtered-unique index remains the ultimate race-safe authority on code
// uniqueness, and `archiveExamRoom` is a conditional write asserting count === 1.
// =============================================================================

const ENTITY = "ExamRoom";
const ROOM_ACTIVE = "ACTIVE";

async function authorizeSchedule(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_SCHEDULE)) {
    throw new AuthorizationError();
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export class CreateExamRoomCommand extends BaseCommand<CreateExamRoomCommandInput, RoomCommandResult> {
  async validate(): Promise<void> {
    const parsed = createExamRoomSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<RoomCommandResult> {
    const { organizationId } = this.context;
    const input = createExamRoomSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      if (input.code) {
        const existing = await findExamRoomByCode({ organizationId, code: input.code }, tx);
        if (existing) {
          throw new BusinessRuleError("ROOM_CODE_TAKEN");
        }
      }

      const room = await createExamRoom(
        {
          organizationId,
          name: input.name,
          code: input.code ?? null,
          capacity: input.capacity,
          branchId: input.branchId ?? null,
          description: input.description ?? null,
          status: ROOM_ACTIVE,
        },
        tx
      );

      await auditService.log(
        this.context,
        {
          entity: ENTITY,
          entityId: room.id,
          action: "exam_room.created",
          oldValues: null,
          newValues: { name: room.name, code: room.code, capacity: room.capacity, status: room.status },
        },
        tx
      );

      return { roomId: room.id, status: room.status };
    });
  }
}

// ─── Update metadata ───────────────────────────────────────────────────────

export class UpdateExamRoomCommand extends BaseCommand<UpdateExamRoomCommandInput, RoomCommandResult> {
  async validate(): Promise<void> {
    const parsed = updateExamRoomSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<RoomCommandResult> {
    const { organizationId } = this.context;
    const input = updateExamRoomSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const room = await findExamRoomById({ id: input.roomId, organizationId }, tx);
      if (!room) throw new NotFoundError(ENTITY, input.roomId);

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.code !== undefined) patch.code = input.code;
      if (input.capacity !== undefined) patch.capacity = input.capacity;
      if (input.description !== undefined) patch.description = input.description;
      if (input.status !== undefined) patch.status = input.status;

      const marked = await updateExamRoomMetadata({ organizationId, id: input.roomId, patch }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError("Exam room is no longer available for update.");
      }

      await auditService.log(
        this.context,
        {
          entity: ENTITY,
          entityId: room.id,
          action: "exam_room.updated",
          oldValues: { name: room.name, code: room.code, capacity: room.capacity, description: room.description },
          newValues: { ...patch },
        },
        tx
      );

      return { roomId: room.id, status: room.status };
    });
  }
}

// ─── Archive (soft delete) ───────────────────────────────────────────────────

export class ArchiveExamRoomCommand extends BaseCommand<
  ArchiveExamRoomCommandInput,
  RoomCommandResult
> {
  async validate(): Promise<void> {
    const parsed = archiveExamRoomSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeSchedule(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<RoomCommandResult> {
    const { organizationId } = this.context;
    const { roomId } = archiveExamRoomSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const room = await findExamRoomById({ id: roomId, organizationId }, tx);
      if (!room) throw new NotFoundError(ENTITY, roomId);

      // Command-level guard: never orphan an upcoming/in-flight session's room.
      const future = await findFutureSessionsByRoom({ organizationId, roomId, after: now }, tx);
      if (future.length > 0) {
        throw new BusinessRuleError("ROOM_HAS_FUTURE_SESSIONS", { futureSessionCount: future.length });
      }

      const marked = await archiveExamRoom({ organizationId, id: roomId }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError("Exam room is no longer available to archive.");
      }

      await auditService.log(
        this.context,
        {
          entity: ENTITY,
          entityId: room.id,
          action: "exam_room.archived",
          oldValues: { deletedAt: null, status: room.status },
          newValues: { deletedAt: now, status: "INACTIVE" },
        },
        tx
      );

      return { roomId: room.id, status: "INACTIVE" };
    });
  }
}
