import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { assertTeacherCanAccessClassGroup, resolveAssignedTeacherId } from "@/server/auth/teacher-access";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import { createAssessment } from "@/modules/assessments/repositories/assessment.repository";
import { findAssessmentPolicyById } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findComponentById } from "@/modules/assessments/repositories/assessment-component.repository";
import { findAssessmentPeriodById } from "@/modules/assessments/repositories/assessment-period.repository";
import {
  createAssessmentSchema,
  type CreateAssessmentSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { Assessment } from "@/modules/assessments/types";

export class CreateAssessmentCommand extends BaseCommand<CreateAssessmentSchema, Assessment> {
  async validate(): Promise<void> {
    const result = createAssessmentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const { organizationId } = this.context;
    const db = await getDb();

    const policy = await findAssessmentPolicyById(this.input.assessmentPolicyId, organizationId);
    if (!policy) throw new NotFoundError("Política de avaliação", this.input.assessmentPolicyId);
    if (policy.status !== "ACTIVE") {
      throw new ValidationError("Dados inválidos", {
        assessmentPolicyId: ["A política de avaliação não está ativa"],
      });
    }

    const component = await findComponentById(this.input.assessmentComponentId, organizationId);
    if (!component) throw new NotFoundError("Componente de avaliação", this.input.assessmentComponentId);
    if (component.assessmentPolicyId !== this.input.assessmentPolicyId) {
      throw new ValidationError("Dados inválidos", {
        assessmentComponentId: ["O componente não pertence à política selecionada"],
      });
    }

    const period = await findAssessmentPeriodById(this.input.assessmentPeriodId, organizationId);
    if (!period) throw new NotFoundError("Período de avaliação", this.input.assessmentPeriodId);

    const classGroup = await db.classGroup.findFirst({
      where: { id: this.input.classGroupId, organizationId, deletedAt: null },
    });
    if (!classGroup) throw new NotFoundError("Turma", this.input.classGroupId);

    const levelSubject = await db.levelSubject.findFirst({
      where: { id: this.input.levelSubjectId, organizationId, deletedAt: null },
    });
    if (!levelSubject) throw new NotFoundError("Configuração de disciplina", this.input.levelSubjectId);
    if (levelSubject.subjectId !== this.input.subjectId) {
      throw new ValidationError("Dados inválidos", {
        subjectId: ["A disciplina não corresponde à configuração selecionada"],
      });
    }
    if (levelSubject.courseLevelId !== this.input.courseLevelId) {
      throw new ValidationError("Dados inválidos", {
        levelSubjectId: ["A configuração de disciplina não pertence ao nível selecionado"],
      });
    }

    if (this.input.teacherId) {
      const teacher = await db.teacher.findFirst({
        where: { id: this.input.teacherId, organizationId, deletedAt: null },
      });
      if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENTS_CREATE)) {
      throw new AuthorizationError();
    }
    // Create-time scope: a teacher-scoped user may only create assessments for a
    // class group they teach (the resolved teacherId, never client input). No-op
    // for admins/secretaries. See docs/teacher-access-scope.md.
    await assertTeacherCanAccessClassGroup(this.context as AuthContext, this.input.classGroupId);
  }

  async execute(): Promise<Assessment> {
    // For a teacher-scoped user the assigned teacher is forced to themselves; a
    // client-supplied teacherId is ignored. Admins/secretaries keep their choice.
    const teacherId = await resolveAssignedTeacherId(this.context as AuthContext, this.input.teacherId);

    const assessment = await createAssessment({
      organizationId: this.context.organizationId,
      assessmentPolicyId: this.input.assessmentPolicyId,
      assessmentComponentId: this.input.assessmentComponentId,
      assessmentPeriodId: this.input.assessmentPeriodId,
      academicYearId: this.input.academicYearId,
      academicTermId: this.input.academicTermId ?? null,
      classGroupId: this.input.classGroupId,
      courseId: this.input.courseId,
      courseLevelId: this.input.courseLevelId,
      levelSubjectId: this.input.levelSubjectId,
      subjectId: this.input.subjectId,
      teacherId,
      title: this.input.title,
      description: this.input.description ?? null,
      assessmentDate: new Date(this.input.assessmentDate),
      maxScore: this.input.maxScore,
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Assessment",
      entityId: assessment.id,
      action: "assessment.created",
      newValues: {
        title: assessment.title,
        classGroupId: assessment.classGroupId,
        levelSubjectId: assessment.levelSubjectId,
        assessmentDate: assessment.assessmentDate,
        maxScore: assessment.maxScore,
      },
    });

    return assessment;
  }
}
