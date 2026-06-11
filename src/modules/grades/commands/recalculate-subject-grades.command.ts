import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import {
  recalculateSubjectGradesSchema,
  type RecalculateSubjectGradesSchema,
} from "@/modules/grades/schemas/grade.schema";
import { CalculateStudentSubjectProgressCommand } from "@/modules/grades/commands/calculate-student-subject-progress.command";

export class RecalculateSubjectGradesCommand extends BaseCommand<
  RecalculateSubjectGradesSchema,
  number
> {
  async validate(): Promise<void> {
    const result = recalculateSubjectGradesSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const db = await getDb();
    const levelSubject = await db.levelSubject.findFirst({
      where: {
        id: this.input.levelSubjectId,
        organizationId: this.context.organizationId,
        deletedAt: null,
      },
    });
    if (!levelSubject) throw new NotFoundError("Configuração de disciplina", this.input.levelSubjectId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.STUDENT_PROGRESS_CALCULATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<number> {
    const { organizationId } = this.context;
    const { levelSubjectId, classGroupId } = this.input;

    const db = await getDb();

    // Find all enrollments that have results for this levelSubject
    const resultRows = await db.studentAssessmentResult.findMany({
      where: {
        organizationId,
        levelSubjectId,
        status: { not: "CANCELLED" },
        ...(classGroupId
          ? { enrollment: { classGroupId } }
          : {}),
      },
      select: { studentId: true, enrollmentId: true },
      distinct: ["enrollmentId"],
    });

    let count = 0;
    for (const row of resultRows) {
      try {
        await new CalculateStudentSubjectProgressCommand(
          { studentId: row.studentId, enrollmentId: row.enrollmentId, levelSubjectId },
          this.context
        ).execute();
        count++;
      } catch {
        // Skip individual failures — continue processing remaining students
      }
    }

    await auditService.log(this.context, {
      entity: "LevelSubject",
      entityId: levelSubjectId,
      action: "grade.recalculated",
      newValues: { levelSubjectId, recalculatedCount: count },
    });

    return count;
  }
}
