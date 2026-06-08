import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import {
  createEnrollment,
  createEnrollmentStatusHistory,
  studentHasActiveEnrollmentInCourse,
  getLastEnrollmentNumber,
} from "@/modules/enrollments/repositories/enrollment.repository";
import {
  createEnrollmentSchema,
  type CreateEnrollmentSchema,
} from "@/modules/enrollments/schemas/enrollment.schema";
import { GenerateInvoiceFromEnrollmentCommand } from "@/modules/billing/commands/generate-invoice-from-enrollment.command";
import { findDefaultBillingPolicy } from "@/modules/billing/repositories/billing-policy.repository";
import type { Enrollment } from "@/modules/enrollments/types";

export class CreateEnrollmentCommand extends BaseCommand<CreateEnrollmentSchema, Enrollment> {
  async validate(): Promise<void> {
    const result = createEnrollmentSchema.safeParse(this.input);
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

    // Validate branch belongs to organization
    const branch = await db.branch.findFirst({
      where: { id: this.input.branchId, organizationId: this.context.organizationId, deletedAt: null },
    });
    if (!branch) throw new NotFoundError("Filial", this.input.branchId);

    // Validate student belongs to organization and is not SUSPENDED/DROPPED
    const student = await db.student.findFirst({
      where: { id: this.input.studentId, organizationId: this.context.organizationId, deletedAt: null },
    });
    if (!student) throw new NotFoundError("Aluno", this.input.studentId);
    if (student.status === "SUSPENDED" || student.status === "DROPPED") {
      throw new BusinessRuleError(
        "Não é possível matricular um aluno suspenso ou expulso."
      );
    }

    // Validate course belongs to organization and is ACTIVE
    const course = await db.course.findFirst({
      where: { id: this.input.courseId, organizationId: this.context.organizationId, deletedAt: null },
    });
    if (!course) throw new NotFoundError("Curso", this.input.courseId);
    if (course.status !== "ACTIVE") {
      throw new BusinessRuleError("O curso selecionado não está ativo.");
    }

    // Validate courseLevel belongs to course and is ACTIVE
    if (this.input.courseLevelId) {
      const level = await db.courseLevel.findFirst({
        where: {
          id: this.input.courseLevelId,
          courseId: this.input.courseId,
        },
      });
      if (!level) {
        throw new ValidationError("Dados inválidos", {
          courseLevelId: ["O nível não pertence ao curso selecionado"],
        });
      }
      if (level.status !== "ACTIVE") {
        throw new BusinessRuleError("O nível selecionado não está ativo.");
      }
    }

    // Validate classGroup belongs to organization, matches course, is ACTIVE, has capacity
    if (this.input.classGroupId) {
      const group = await db.classGroup.findFirst({
        where: {
          id: this.input.classGroupId,
          organizationId: this.context.organizationId,
          courseId: this.input.courseId,
          deletedAt: null,
        },
      });
      if (!group) {
        throw new ValidationError("Dados inválidos", {
          classGroupId: ["A turma não pertence ao curso selecionado"],
        });
      }
      if (group.status !== "ACTIVE" && group.status !== "FORMING") {
        throw new BusinessRuleError("A turma selecionada não está ativa.");
      }
      if (this.input.courseLevelId && group.courseLevelId && group.courseLevelId !== this.input.courseLevelId) {
        throw new ValidationError("Dados inválidos", {
          classGroupId: ["O nível da turma não coincide com o nível selecionado"],
        });
      }
      if (group.currentCount >= group.capacity) {
        throw new BusinessRuleError(
          `A turma atingiu a capacidade máxima (${group.capacity} alunos).`
        );
      }
    }

    // Prevent duplicate ACTIVE enrollment in same course
    const hasActive = await studentHasActiveEnrollmentInCourse(
      this.input.studentId,
      this.input.courseId,
      this.context.organizationId
    );
    if (hasActive) {
      throw new BusinessRuleError(
        "O aluno já tem uma matrícula ativa neste curso."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.ENROLLMENTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Enrollment> {
    const lastNum = await getLastEnrollmentNumber(this.context.organizationId);
    const enrollmentNumber = String(lastNum + 1).padStart(6, "0");

    const enrollment = await createEnrollment({
      organizationId: this.context.organizationId,
      branchId: this.input.branchId,
      studentId: this.input.studentId,
      courseId: this.input.courseId,
      courseLevelId: this.input.courseLevelId ?? null,
      classGroupId: this.input.classGroupId ?? null,
      enrollmentNumber,
      enrollmentDate: new Date(this.input.enrollmentDate),
      startDate: this.input.startDate ? new Date(this.input.startDate) : null,
      expectedEndDate: this.input.expectedEndDate ? new Date(this.input.expectedEndDate) : null,
      status: "DRAFT",
      notes: this.input.notes ?? null,
      createdBy: this.context.userId,
    });

    await createEnrollmentStatusHistory({
      enrollmentId: enrollment.id,
      fromStatus: null,
      toStatus: "DRAFT",
      changedBy: this.context.userId,
    });

    // Increment classGroup.currentCount if assigned
    if (this.input.classGroupId) {
      const db = await getDb();
      await db.classGroup.update({
        where: { id: this.input.classGroupId },
        data: { currentCount: { increment: 1 } },
      });
    }

    await auditService.log(this.context, {
      entity: "Enrollment",
      entityId: enrollment.id,
      action: "enrollment.created",
      newValues: {
        enrollmentNumber,
        studentId: enrollment.studentId,
        courseId: enrollment.courseId,
        status: enrollment.status,
        organizationId: this.context.organizationId,
      },
    });

    // Auto-generate invoice from active billing policy (best-effort — does not fail enrollment creation)
    const policy = await findDefaultBillingPolicy(this.context.organizationId);
    if (policy && policy.autoGenerateInvoiceOnEnrollment) {
      try {
        const genCmd = new GenerateInvoiceFromEnrollmentCommand(
          { enrollmentId: enrollment.id, billingPolicyId: policy.id },
          this.context
        );
        await genCmd.run();
      } catch {
        // Invoice generation failure must not roll back the enrollment.
        // The admin can generate manually from the enrollment detail page.
      }
    }

    return enrollment;
  }
}
