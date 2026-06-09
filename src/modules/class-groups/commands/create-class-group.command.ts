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
import {
  createClassGroup,
  findClassGroupByCode,
} from "@/modules/class-groups/repositories/class-group.repository";
import { findCourseByIdInOrganization } from "@/modules/courses/repositories/course.repository";
import { findLevelByIdInOrganization } from "@/modules/courses/repositories/level.repository";
import { findBranchById } from "@/modules/organizations/repositories/branch.repository";
import { findByIdInOrganization as findTeacherByIdInOrganization } from "@/modules/teachers/repositories/teacher.repository";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import { findAcademicTermByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-term.repository";
import {
  createClassGroupSchema,
  type CreateClassGroupSchema,
} from "@/modules/class-groups/schemas/class-group.schema";
import type { ClassGroup } from "@/modules/class-groups/types";

export class CreateClassGroupCommand extends BaseCommand<CreateClassGroupSchema, ClassGroup> {
  async validate(): Promise<void> {
    const result = createClassGroupSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    if (this.input.code) {
      const duplicate = await findClassGroupByCode(
        this.context.organizationId,
        this.input.code
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          code: ["Já existe uma turma com este código nesta organização"],
        });
      }
    }

    const course = await findCourseByIdInOrganization(
      this.input.courseId,
      this.context.organizationId
    );
    if (!course) throw new NotFoundError("Curso", this.input.courseId);

    if (this.input.courseLevelId) {
      const level = await findLevelByIdInOrganization(
        this.input.courseLevelId,
        this.context.organizationId
      );
      if (!level) throw new NotFoundError("Nível", this.input.courseLevelId);
      if (level.courseId !== this.input.courseId) {
        throw new ValidationError("Dados inválidos", {
          courseLevelId: ["O nível não pertence ao curso selecionado"],
        });
      }
    }

    if (this.input.branchId) {
      const branch = await findBranchById(
        this.context.organizationId,
        this.input.branchId
      );
      if (!branch) throw new NotFoundError("Filial", this.input.branchId);
    }

    if (this.input.teacherId) {
      const teacher = await findTeacherByIdInOrganization(
        this.input.teacherId,
        this.context.organizationId
      );
      if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
    }

    // Validate academicYearId belongs to org and is ACTIVE
    const academicYear = await findAcademicYearByIdInOrganization(
      this.input.academicYearId,
      this.context.organizationId
    );
    if (!academicYear) throw new NotFoundError("Ano Letivo", this.input.academicYearId);
    if (academicYear.status !== "ACTIVE") {
      throw new BusinessRuleError("O ano letivo selecionado não está ativo.");
    }

    // Validate academicTermId belongs to org and to the selected year and is ACTIVE
    if (this.input.academicTermId) {
      const term = await findAcademicTermByIdInOrganization(
        this.input.academicTermId,
        this.context.organizationId
      );
      if (!term) throw new NotFoundError("Período Letivo", this.input.academicTermId);
      if (term.academicYearId !== this.input.academicYearId) {
        throw new ValidationError("Dados inválidos", {
          academicTermId: ["O período não pertence ao ano letivo selecionado"],
        });
      }
      if (term.status !== "ACTIVE") {
        throw new BusinessRuleError("O período letivo selecionado não está ativo.");
      }
    }

    if (this.input.startDate && this.input.endDate) {
      if (new Date(this.input.startDate) >= new Date(this.input.endDate)) {
        throw new ValidationError("Dados inválidos", {
          endDate: ["A data de fim deve ser posterior à data de início"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.CLASS_GROUPS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassGroup> {
    const group = await createClassGroup({
      organizationId: this.context.organizationId,
      name: this.input.name,
      code: this.input.code ?? null,
      courseId: this.input.courseId,
      courseLevelId: this.input.courseLevelId ?? null,
      branchId: this.input.branchId ?? null,
      teacherId: this.input.teacherId ?? null,
      academicYearId: this.input.academicYearId,
      academicTermId: this.input.academicTermId ?? null,
      capacity: this.input.capacity ?? 30,
      startDate: this.input.startDate ? new Date(this.input.startDate) : null,
      endDate: this.input.endDate ? new Date(this.input.endDate) : null,
      status: this.input.status ?? "FORMING",
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "ClassGroup",
      entityId: group.id,
      action: "class_group.created",
      newValues: {
        name: group.name,
        code: group.code,
        courseId: group.courseId,
        status: group.status,
        organizationId: this.context.organizationId,
      },
    });

    return group;
  }
}
