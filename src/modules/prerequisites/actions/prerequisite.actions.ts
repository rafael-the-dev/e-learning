"use server";

import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  createPrerequisiteGroupSchema,
  updatePrerequisiteGroupSchema,
  createPrerequisiteItemSchema,
  grantWaiverSchema,
  createProgressionPolicySchema,
  evaluateProgressionSchema,
  reviewProgressionRequestSchema,
} from "@/modules/prerequisites/schemas/prerequisite.schema";
import {
  createPrerequisiteGroup,
  updatePrerequisiteGroup,
  archivePrerequisiteGroup,
} from "@/modules/prerequisites/repositories/prerequisite-group.repository";
import {
  createPrerequisiteItem,
  deletePrerequisiteItem,
  findAllActiveGroupsWithItems,
} from "@/modules/prerequisites/repositories/prerequisite-item.repository";
import {
  createWaiver,
  revokeWaiver,
} from "@/modules/prerequisites/repositories/prerequisite-waiver.repository";
import {
  createProgressionPolicy,
  updateProgressionPolicy,
} from "@/modules/prerequisites/repositories/level-progression-policy.repository";
import { evaluateLevelProgression, promoteStudentToNextLevel } from "@/modules/prerequisites/engines/level-progression.engine";
import { getDb } from "@/server/db";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { PROGRESSION_OUTCOME } from "@/modules/prerequisites/types";

type ActionResult<T = void> = { success: true; data?: T } | { success: false; error: string };

// ─── Prerequisite Groups ──────────────────────────────────────────────────────

export async function createPrerequisiteGroupAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.PREREQUISITES_MANAGE);
    const data = createPrerequisiteGroupSchema.parse(input);
    const group = await createPrerequisiteGroup({
      organizationId: context.organizationId,
      levelSubjectId: data.levelSubjectId,
      name: data.name ?? null,
      description: data.description ?? null,
      logicType: data.logicType,
    });
    await auditService.log(context, {
      entity: "LevelSubjectPrerequisiteGroup",
      entityId: group.id,
      action: "prerequisite_group.created",
      newValues: { levelSubjectId: data.levelSubjectId, logicType: data.logicType },
    });
    return { success: true, data: { id: group.id } };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

export async function updatePrerequisiteGroupAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requirePermission(PERMISSIONS.PREREQUISITES_MANAGE);
    const data = updatePrerequisiteGroupSchema.parse(input);
    await updatePrerequisiteGroup(data.groupId, context.organizationId, {
      name: data.name ?? undefined,
      description: data.description ?? undefined,
      logicType: data.logicType,
    });
    await auditService.log(context, {
      entity: "LevelSubjectPrerequisiteGroup",
      entityId: data.groupId,
      action: "prerequisite_group.updated",
      newValues: data,
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

export async function archivePrerequisiteGroupAction(groupId: string): Promise<ActionResult> {
  try {
    const context = await requirePermission(PERMISSIONS.PREREQUISITES_MANAGE);
    await archivePrerequisiteGroup(groupId, context.organizationId);
    await auditService.log(context, {
      entity: "LevelSubjectPrerequisiteGroup",
      entityId: groupId,
      action: "prerequisite_group.archived",
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

// ─── Prerequisite Items ───────────────────────────────────────────────────────

export async function createPrerequisiteItemAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.PREREQUISITES_MANAGE);
    const data = createPrerequisiteItemSchema.parse(input);

    // Circular dependency check: ensure prerequisiteLevelSubjectId doesn't depend on the target
    const db = await getDb();
    const group = await db.levelSubjectPrerequisiteGroup.findFirst({
      where: { id: data.prerequisiteGroupId, organizationId: context.organizationId },
      select: { levelSubjectId: true },
    });
    if (!group) return { success: false, error: "Grupo não encontrado" };
    if (group.levelSubjectId === data.prerequisiteLevelSubjectId) {
      return { success: false, error: "Uma disciplina não pode ser pré-requisito de si mesma" };
    }

    const item = await createPrerequisiteItem({
      organizationId: context.organizationId,
      ...data,
      minimumRequiredGrade: data.minimumRequiredGrade ?? null,
    });
    await auditService.log(context, {
      entity: "LevelSubjectPrerequisiteItem",
      entityId: item.id,
      action: "prerequisite_item.created",
      newValues: { prerequisiteGroupId: data.prerequisiteGroupId, requirementType: data.requirementType },
    });
    return { success: true, data: { id: item.id } };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

export async function deletePrerequisiteItemAction(itemId: string): Promise<ActionResult> {
  try {
    const context = await requirePermission(PERMISSIONS.PREREQUISITES_MANAGE);
    await deletePrerequisiteItem(itemId, context.organizationId);
    await auditService.log(context, {
      entity: "LevelSubjectPrerequisiteItem",
      entityId: itemId,
      action: "prerequisite_item.archived",
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

// ─── Waivers ──────────────────────────────────────────────────────────────────

export async function grantPrerequisiteWaiverAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.PREREQUISITES_WAIVERS_MANAGE);
    const data = grantWaiverSchema.parse(input);

    // Validate enrollment belongs to org
    const db = await getDb();
    const enrollment = await db.enrollment.findFirst({
      where: { id: data.enrollmentId, organizationId: context.organizationId, deletedAt: null },
    });
    if (!enrollment) return { success: false, error: "Matrícula não encontrada" };

    const waiver = await createWaiver({
      organizationId: context.organizationId,
      studentId: data.studentId,
      enrollmentId: data.enrollmentId,
      levelSubjectId: data.levelSubjectId,
      prerequisiteGroupId: data.prerequisiteGroupId ?? null,
      prerequisiteItemId: data.prerequisiteItemId ?? null,
      reason: data.reason,
      grantedBy: context.userId,
    });
    await auditService.log(context, {
      entity: "PrerequisiteWaiver",
      entityId: waiver.id,
      action: "prerequisite_waiver.created",
      newValues: { studentId: data.studentId, levelSubjectId: data.levelSubjectId },
    });
    return { success: true, data: { id: waiver.id } };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

export async function revokePrerequisiteWaiverAction(
  waiverId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const context = await requirePermission(PERMISSIONS.PREREQUISITES_WAIVERS_MANAGE);
    await revokeWaiver(waiverId, context.organizationId, context.userId, reason);
    await auditService.log(context, {
      entity: "PrerequisiteWaiver",
      entityId: waiverId,
      action: "prerequisite_waiver.revoked",
      newValues: { reason },
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

// ─── Level Progression Policies ───────────────────────────────────────────────

export async function createProgressionPolicyAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.LEVEL_PROGRESSION_MANAGE);
    const data = createProgressionPolicySchema.parse(input);
    if (data.fromLevelId === data.toLevelId) {
      return { success: false, error: "Nível de origem e destino não podem ser iguais" };
    }
    const policy = await createProgressionPolicy({
      organizationId: context.organizationId,
      ...data,
      minimumLevelAverage: data.minimumLevelAverage ?? null,
      maxFailedRequiredSubjects: data.maxFailedRequiredSubjects ?? null,
      maxPendingSubjects: data.maxPendingSubjects ?? null,
      requiredCredits: data.requiredCredits ?? null,
    });
    await auditService.log(context, {
      entity: "LevelProgressionPolicy",
      entityId: policy.id,
      action: "level_progression.policy_created",
      newValues: { fromLevelId: data.fromLevelId, toLevelId: data.toLevelId, progressionMode: data.progressionMode },
    });
    return { success: true, data: { id: policy.id } };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

// ─── Level Progression Evaluation ─────────────────────────────────────────────

export async function evaluateLevelProgressionAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requirePermission(PERMISSIONS.LEVEL_PROGRESSION_MANAGE);
    const data = evaluateProgressionSchema.parse(input);

    const result = await evaluateLevelProgression(
      data.enrollmentId,
      data.courseLevelId,
      context.organizationId
    );

    if (data.autoPromote && result.toLevelId &&
      (result.outcome === PROGRESSION_OUTCOME.PROMOTED || result.outcome === PROGRESSION_OUTCOME.PROMOTED_WITH_PENDING_SUBJECTS)) {
      await promoteStudentToNextLevel(data.enrollmentId, result.toLevelId, context.organizationId);
      await auditService.log(context, {
        entity: "Enrollment",
        entityId: data.enrollmentId,
        action: "level_progression.approved",
        newValues: { fromLevelId: data.courseLevelId, toLevelId: result.toLevelId, outcome: result.outcome },
      });
    }

    if (result.outcome === PROGRESSION_OUTCOME.REQUIRES_MANUAL_APPROVAL && result.toLevelId) {
      const db = await getDb();
      const enrollment = await db.enrollment.findFirst({
        where: { id: data.enrollmentId, organizationId: context.organizationId },
        select: { studentId: true, courseId: true },
      });
      if (enrollment) {
        // Guard against duplicate pending requests for the same transition.
        const existingPending = await db.levelProgressionRequest.findFirst({
          where: {
            organizationId: context.organizationId,
            enrollmentId: data.enrollmentId,
            fromLevelId: data.courseLevelId,
            toLevelId: result.toLevelId,
            decision: "PENDING",
          },
          select: { id: true },
        });
        if (!existingPending) {
          const created = await db.levelProgressionRequest.create({
            data: {
              organizationId: context.organizationId,
              enrollmentId: data.enrollmentId,
              studentId: enrollment.studentId,
              courseId: enrollment.courseId,
              fromLevelId: data.courseLevelId,
              toLevelId: result.toLevelId,
              decision: "PENDING",
              reason: result.reason,
            },
          });
          await auditService.log(context, {
            entity: "LevelProgressionRequest",
            entityId: created.id,
            action: "level_progression.evaluated",
            newValues: {
              fromLevelId: data.courseLevelId,
              toLevelId: result.toLevelId,
              outcome: result.outcome,
            },
          });
        }
      }
    }

    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

export async function reviewProgressionRequestAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requirePermission(PERMISSIONS.LEVEL_PROGRESSION_MANAGE);
    const data = reviewProgressionRequestSchema.parse(input);
    const db = await getDb();

    const request = await db.levelProgressionRequest.findFirst({
      where: { id: data.requestId, organizationId: context.organizationId, decision: "PENDING" },
    });
    if (!request) return { success: false, error: "Pedido não encontrado ou já processado" };

    await db.levelProgressionRequest.update({
      where: { id: data.requestId },
      data: {
        decision: data.decision,
        reviewNotes: data.reviewNotes ?? null,
        reviewedAt: new Date(),
        reviewedBy: context.userId,
      },
    });

    if (data.decision === "APPROVED") {
      await promoteStudentToNextLevel(request.enrollmentId, request.toLevelId, context.organizationId);
      await auditService.log(context, {
        entity: "LevelProgressionRequest",
        entityId: data.requestId,
        action: "level_progression.approved",
        newValues: { decision: data.decision, toLevelId: request.toLevelId },
      });
    } else {
      // Rejection must also be audited, with the reviewer's reason.
      await auditService.log(context, {
        entity: "LevelProgressionRequest",
        entityId: data.requestId,
        action: "level_progression.blocked",
        newValues: { decision: data.decision, reason: data.reviewNotes },
      });
    }

    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

// ─── Fetch prerequisite data for drawer ──────────────────────────────────────

export type PrerequisiteGroupWithItems = Awaited<ReturnType<typeof findAllActiveGroupsWithItems>>[number];

export type PrerequisiteDrawerData = {
  groups: PrerequisiteGroupWithItems[];
  availableLevelSubjects: { id: string; subjectName: string; courseLevelName: string; courseName: string }[];
};

export async function fetchLevelSubjectPrerequisitesAction(
  levelSubjectId: string
): Promise<ActionResult<PrerequisiteDrawerData>> {
  try {
    const context = await requirePermission(PERMISSIONS.PREREQUISITES_VIEW);
    const db = await getDb();

    const groups = await findAllActiveGroupsWithItems(levelSubjectId, context.organizationId);

    const levelSubject = await db.levelSubject.findFirst({
      where: { id: levelSubjectId, organizationId: context.organizationId, deletedAt: null },
      select: { courseLevelId: true },
    });

    const otherLevelSubjects = levelSubject
      ? await db.levelSubject.findMany({
          where: {
            organizationId: context.organizationId,
            courseLevelId: levelSubject.courseLevelId,
            id: { not: levelSubjectId },
            status: "ACTIVE",
            deletedAt: null,
          },
          select: {
            id: true,
            subject: { select: { name: true } },
            courseLevel: { select: { name: true, course: { select: { name: true } } } },
          },
        })
      : [];

    const availableLevelSubjects = otherLevelSubjects.map((ls) => ({
      id: ls.id,
      subjectName: ls.subject.name,
      courseLevelName: ls.courseLevel?.name ?? "",
      courseName: ls.courseLevel?.course.name ?? "",
    }));

    return { success: true, data: { groups, availableLevelSubjects } };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}
