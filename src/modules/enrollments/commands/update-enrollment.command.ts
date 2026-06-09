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
  findEnrollmentByIdInOrganization,
  updateEnrollment,
  countActiveEnrollmentsByClassGroup,
} from "@/modules/enrollments/repositories/enrollment.repository";
import {
  updateEnrollmentSchema,
  type UpdateEnrollmentSchema,
} from "@/modules/enrollments/schemas/enrollment.schema";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import { findAcademicTermByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-term.repository";
import type { Enrollment } from "@/modules/enrollments/types";

interface UpdateEnrollmentInput extends UpdateEnrollmentSchema {
  enrollmentId: string;
}

export class UpdateEnrollmentCommand extends BaseCommand<UpdateEnrollmentInput, Enrollment> {
  private _existing: Enrollment | null = null;

  async validate(): Promise<void> {
    const { enrollmentId, ...rest } = this.input;
    const result = updateEnrollmentSchema.safeParse(rest);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findEnrollmentByIdInOrganization(
      enrollmentId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Matrícula", enrollmentId);
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new BusinessRuleError(
        "Não é possível editar uma matrícula concluída ou cancelada."
      );
    }
    this._existing = existing;

    const db = await getDb();

    if (this.input.branchId) {
      const branch = await db.branch.findFirst({
        where: {
          id: this.input.branchId,
          organizationId: this.context.organizationId,
          deletedAt: null,
        },
      });
      if (!branch) throw new NotFoundError("Filial", this.input.branchId);
    }

    if (this.input.courseLevelId) {
      const level = await db.courseLevel.findFirst({
        where: {
          id: this.input.courseLevelId,
          courseId: existing.courseId,
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

    // Validate academicYearId if changing
    const resolvedYearId = this.input.academicYearId ?? existing.academicYearId;
    if (this.input.academicYearId) {
      const year = await findAcademicYearByIdInOrganization(
        this.input.academicYearId,
        this.context.organizationId
      );
      if (!year) throw new NotFoundError("Ano Letivo", this.input.academicYearId);
      if (year.status !== "ACTIVE") {
        throw new BusinessRuleError("O ano letivo selecionado não está ativo.");
      }
    }

    // Validate academicTermId if changing
    if (this.input.academicTermId) {
      const term = await findAcademicTermByIdInOrganization(
        this.input.academicTermId,
        this.context.organizationId
      );
      if (!term) throw new NotFoundError("Período Letivo", this.input.academicTermId);
      if (term.academicYearId !== resolvedYearId) {
        throw new ValidationError("Dados inválidos", {
          academicTermId: ["O período não pertence ao ano letivo selecionado"],
        });
      }
      if (term.status !== "ACTIVE") {
        throw new BusinessRuleError("O período letivo selecionado não está ativo.");
      }
    }

    if (this.input.classGroupId) {
      const group = await db.classGroup.findFirst({
        where: {
          id: this.input.classGroupId,
          organizationId: this.context.organizationId,
          courseId: existing.courseId,
          deletedAt: null,
        },
      });
      if (!group) {
        throw new ValidationError("Dados inválidos", {
          classGroupId: ["A turma não pertence ao curso desta matrícula"],
        });
      }
      if (group.status !== "ACTIVE" && group.status !== "FORMING") {
        throw new BusinessRuleError("A turma selecionada não está ativa.");
      }
      if (group.academicYearId !== resolvedYearId) {
        throw new ValidationError("Dados inválidos", {
          classGroupId: ["A turma não pertence ao ano letivo selecionado"],
        });
      }

      // Only check capacity if assigning a different group
      if (this.input.classGroupId !== existing.classGroupId) {
        const activeCount = await countActiveEnrollmentsByClassGroup(
          this.input.classGroupId,
          this.context.organizationId
        );
        if (activeCount >= group.capacity) {
          throw new BusinessRuleError(
            `A turma atingiu a capacidade máxima (${group.capacity} alunos).`
          );
        }
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.ENROLLMENTS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Enrollment> {
    const db = await getDb();
    const prev = this._existing!;

    // Adjust classGroup counts if group changed
    const newGroupId = this.input.classGroupId !== undefined
      ? this.input.classGroupId
      : prev.classGroupId;

    if (newGroupId !== prev.classGroupId) {
      if (prev.classGroupId) {
        await db.classGroup.update({
          where: { id: prev.classGroupId },
          data: { currentCount: { decrement: 1 } },
        });
      }
      if (newGroupId) {
        await db.classGroup.update({
          where: { id: newGroupId },
          data: { currentCount: { increment: 1 } },
        });
      }
    }

    const enrollment = await updateEnrollment(
      this.input.enrollmentId,
      this.context.organizationId,
      {
        branchId: this.input.branchId,
        courseLevelId: this.input.courseLevelId,
        classGroupId: this.input.classGroupId,
        academicYearId: this.input.academicYearId,
        academicTermId: this.input.academicTermId,
        startDate: this.input.startDate ? new Date(this.input.startDate) : (this.input.startDate === null ? null : undefined),
        expectedEndDate: this.input.expectedEndDate ? new Date(this.input.expectedEndDate) : (this.input.expectedEndDate === null ? null : undefined),
        notes: this.input.notes,
        updatedBy: this.context.userId,
      }
    );

    await auditService.log(this.context, {
      entity: "Enrollment",
      entityId: enrollment.id,
      action: "enrollment.updated",
      oldValues: {
        branchId: prev.branchId,
        courseLevelId: prev.courseLevelId,
        classGroupId: prev.classGroupId,
        academicYearId: prev.academicYearId,
        academicTermId: prev.academicTermId,
        startDate: prev.startDate,
        expectedEndDate: prev.expectedEndDate,
        notes: prev.notes,
      },
      newValues: {
        branchId: enrollment.branchId,
        courseLevelId: enrollment.courseLevelId,
        classGroupId: enrollment.classGroupId,
        academicYearId: enrollment.academicYearId,
        academicTermId: enrollment.academicTermId,
        startDate: enrollment.startDate,
        expectedEndDate: enrollment.expectedEndDate,
        notes: enrollment.notes,
      },
    });

    return enrollment;
  }
}
