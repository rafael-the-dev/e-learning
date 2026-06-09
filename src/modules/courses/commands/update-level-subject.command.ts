import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findLevelSubjectById,
  updateLevelSubject,
  isOrderTakenInLevel,
} from "@/modules/courses/repositories/level-subject.repository";
import {
  updateLevelSubjectSchema,
  type UpdateLevelSubjectSchema,
} from "@/modules/courses/schemas/level-subject.schema";
import type { LevelSubject } from "@/modules/courses/types";

interface UpdateLevelSubjectInput extends UpdateLevelSubjectSchema {
  levelSubjectId: string;
}

export class UpdateLevelSubjectCommand extends BaseCommand<UpdateLevelSubjectInput, LevelSubject> {
  private _existing: LevelSubject | null = null;

  async validate(): Promise<void> {
    const result = updateLevelSubjectSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this._existing = await findLevelSubjectById(
      this.input.levelSubjectId,
      this.context.organizationId
    );
    if (!this._existing) throw new NotFoundError("Associação", this.input.levelSubjectId);

    if (this.input.order !== undefined) {
      const orderTaken = await isOrderTakenInLevel(
        this._existing.courseLevelId,
        this.input.order,
        this.input.levelSubjectId
      );
      if (orderTaken) {
        throw new ValidationError("Dados inválidos", {
          order: ["Esta posição já está ocupada neste nível"],
        });
      }
    }

    // Merged cross-field check: combine incoming patch with stored values.
    // The schema superRefine only validates when workloadHours is in the patch,
    // so we must re-run the constraint here with the effective persisted values.
    const effectiveWorkload =
      this.input.workloadHours !== undefined
        ? this.input.workloadHours
        : this._existing.workloadHours;
    const effectiveTheory =
      this.input.theoryHours !== undefined
        ? this.input.theoryHours
        : this._existing.theoryHours;
    const effectivePractical =
      this.input.practicalHours !== undefined
        ? this.input.practicalHours
        : this._existing.practicalHours;
    if (
      effectiveWorkload != null &&
      (effectiveTheory ?? 0) + (effectivePractical ?? 0) > effectiveWorkload
    ) {
      throw new ValidationError("Dados inválidos", {
        theoryHours: [
          "A soma das horas teóricas e práticas não pode exceder a carga horária total",
        ],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.LEVEL_SUBJECTS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<LevelSubject> {
    const levelSubject = await updateLevelSubject(
      this.input.levelSubjectId,
      this.context.organizationId,
      {
        order: this.input.order,
        workloadHours: this.input.workloadHours,
        theoryHours: this.input.theoryHours,
        practicalHours: this.input.practicalHours,
        minimumPassingGrade: this.input.minimumPassingGrade,
        minimumAttendancePercentage: this.input.minimumAttendancePercentage,
        maxAbsences: this.input.maxAbsences,
        isRequired: this.input.isRequired,
        allowRetakeExam: this.input.allowRetakeExam,
        allowCompensation: this.input.allowCompensation,
        certificateRequired: this.input.certificateRequired,
        status: this.input.status,
      }
    );

    await auditService.log(this.context, {
      entity: "LevelSubject",
      entityId: levelSubject.id,
      action: "level_subject.updated",
      oldValues: this._existing
        ? {
            status: this._existing.status,
            order: this._existing.order,
            workloadHours: this._existing.workloadHours,
            minimumPassingGrade: this._existing.minimumPassingGrade,
            minimumAttendancePercentage: this._existing.minimumAttendancePercentage,
            isRequired: this._existing.isRequired,
            certificateRequired: this._existing.certificateRequired,
          }
        : null,
      newValues: {
        status: levelSubject.status,
        order: levelSubject.order,
        workloadHours: levelSubject.workloadHours,
        minimumPassingGrade: levelSubject.minimumPassingGrade,
        minimumAttendancePercentage: levelSubject.minimumAttendancePercentage,
        isRequired: levelSubject.isRequired,
        certificateRequired: levelSubject.certificateRequired,
      },
    });

    return levelSubject;
  }
}
