import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { assertTeacherCanAccessEnrollment } from "@/server/auth/teacher-access";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import {
  upsertStudentAssessmentResult,
  findResultByEnrollmentAndComponent,
} from "@/modules/grades/repositories/student-assessment-result.repository";
import { findComponentById } from "@/modules/assessments/repositories/assessment-component.repository";
import { findAssessmentPolicyById } from "@/modules/assessments/repositories/assessment-policy.repository";
import { gradeCalculationService } from "@/modules/grades/services/grade-calculation.service";
import { gradeMutationService } from "@/modules/grades/services/grade-mutation.service";
import {
  createStudentAssessmentResultSchema,
  type CreateStudentAssessmentResultSchema,
} from "@/modules/grades/schemas/grade.schema";
import { GRADE_CHANGE_SOURCE, type StudentAssessmentResult } from "@/modules/grades/types";

export class CreateStudentAssessmentResultCommand extends BaseCommand<
  CreateStudentAssessmentResultSchema,
  StudentAssessmentResult
> {
  async validate(): Promise<void> {
    const result = createStudentAssessmentResultSchema.safeParse(this.input);
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
    const { organizationId } = this.context;

    const enrollment = await db.enrollment.findFirst({
      where: { id: this.input.enrollmentId, organizationId, deletedAt: null },
    });
    if (!enrollment) throw new NotFoundError("Matrícula", this.input.enrollmentId);
    if (enrollment.studentId !== this.input.studentId) {
      throw new ValidationError("Dados inválidos", {
        studentId: ["O aluno não corresponde à matrícula"],
      });
    }

    const component = await findComponentById(this.input.assessmentComponentId, organizationId);
    if (!component) throw new NotFoundError("Componente", this.input.assessmentComponentId);
    if (component.status === "ARCHIVED") {
      throw new BusinessRuleError("Não é possível lançar nota para um componente arquivado");
    }

    if (this.input.grade > component.maxGrade) {
      throw new ValidationError("Dados inválidos", {
        grade: [`A nota (${this.input.grade}) excede o máximo do componente (${component.maxGrade})`],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.GRADES_CREATE)) {
      throw new AuthorizationError();
    }
    // Defense-in-depth against write IDOR: a teacher-scoped user may only grade an
    // enrollment in a class group they teach. No-op for admins/secretaries.
    await assertTeacherCanAccessEnrollment(this.context as AuthContext, this.input.enrollmentId);
  }

  async execute(): Promise<StudentAssessmentResult> {
    const db = await getDb();
    const { organizationId } = this.context;

    const component = await findComponentById(this.input.assessmentComponentId, organizationId);
    const maxGrade = component!.maxGrade;
    const normalizedGrade = gradeCalculationService.normalizeGrade(this.input.grade, maxGrade);

    const policy = await findAssessmentPolicyById(
      component!.assessmentPolicyId,
      organizationId
    );

    const levelSubjectId = policy?.levelSubjectId ?? "";

    // Resolve subjectId from LevelSubject
    const levelSubject = levelSubjectId
      ? await db.levelSubject.findFirst({
          where: { id: levelSubjectId },
          select: { subjectId: true },
        })
      : null;

    // Capture prior state: upsert may update an existing canonical row.
    const existing = await findResultByEnrollmentAndComponent(
      this.input.enrollmentId,
      this.input.assessmentComponentId,
      organizationId
    );

    const gradeResult = await upsertStudentAssessmentResult({
      organizationId,
      enrollmentId: this.input.enrollmentId,
      studentId: this.input.studentId,
      levelSubjectId,
      subjectId: levelSubject?.subjectId ?? "",
      assessmentComponentId: this.input.assessmentComponentId,
      sourceType: "CONTINUOUS",
      grade: this.input.grade,
      maxGrade,
      normalizedGrade,
      notes: this.input.notes ?? null,
      status: "GRADED",
      gradedBy: this.context.userId,
      gradedAt: new Date(),
    });

    await auditService.log(this.context, {
      entity: "StudentAssessmentResult",
      entityId: gradeResult.id,
      action: "grade.created",
      newValues: {
        studentId: gradeResult.studentId,
        grade: gradeResult.grade,
        normalizedGrade: gradeResult.normalizedGrade,
        componentId: gradeResult.assessmentComponentId,
        sourceType: gradeResult.sourceType,
      },
    });

    // Record the mutation and cascade subject -> level -> course progress.
    await gradeMutationService.handleGradeMutation(this.context as AuthContext, {
      result: gradeResult,
      previous: existing
        ? { grade: existing.grade, normalizedGrade: existing.normalizedGrade, status: existing.status }
        : null,
      source: existing ? GRADE_CHANGE_SOURCE.UPDATE : GRADE_CHANGE_SOURCE.CREATE,
      reason: existing ? "Atualização de nota contínua" : "Lançamento inicial de nota",
    });

    return gradeResult;
  }
}
