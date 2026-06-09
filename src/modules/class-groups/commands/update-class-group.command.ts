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
  findClassGroupById,
  updateClassGroup,
  findClassGroupByCode,
} from "@/modules/class-groups/repositories/class-group.repository";
import { findCourseByIdInOrganization } from "@/modules/courses/repositories/course.repository";
import { findLevelByIdInOrganization } from "@/modules/courses/repositories/level.repository";
import { findBranchById } from "@/modules/organizations/repositories/branch.repository";
import { findByIdInOrganization as findTeacherByIdInOrganization } from "@/modules/teachers/repositories/teacher.repository";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import { findAcademicTermByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-term.repository";
import {
  updateClassGroupSchema,
  type UpdateClassGroupSchema,
} from "@/modules/class-groups/schemas/class-group.schema";
import type { ClassGroup } from "@/modules/class-groups/types";

interface UpdateClassGroupInput extends UpdateClassGroupSchema {
  classGroupId: string;
}

export class UpdateClassGroupCommand extends BaseCommand<UpdateClassGroupInput, ClassGroup> {
  private _existing: ClassGroup | null = null;

  async validate(): Promise<void> {
    const result = updateClassGroupSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findClassGroupById(
      this.input.classGroupId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Turma", this.input.classGroupId);
    this._existing = existing;

    if (this.input.code) {
      const duplicate = await findClassGroupByCode(
        this.context.organizationId,
        this.input.code,
        this.input.classGroupId
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          code: ["Já existe uma turma com este código nesta organização"],
        });
      }
    }

    const resolvedCourseId = this.input.courseId ?? existing.courseId;

    if (this.input.courseId) {
      const course = await findCourseByIdInOrganization(
        this.input.courseId,
        this.context.organizationId
      );
      if (!course) throw new NotFoundError("Curso", this.input.courseId);
    }

    if (this.input.courseLevelId) {
      const level = await findLevelByIdInOrganization(
        this.input.courseLevelId,
        this.context.organizationId
      );
      if (!level) throw new NotFoundError("Nível", this.input.courseLevelId);
      if (level.courseId !== resolvedCourseId) {
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

    const startDate = this.input.startDate !== undefined
      ? this.input.startDate
      : existing.startDate?.toISOString();
    const endDate = this.input.endDate !== undefined
      ? this.input.endDate
      : existing.endDate?.toISOString();

    if (startDate && endDate) {
      if (new Date(startDate) >= new Date(endDate)) {
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
    if (!createAbility(perms).can(PERMISSIONS.CLASS_GROUPS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassGroup> {
    const data: Parameters<typeof updateClassGroup>[2] = {};
    if (this.input.name !== undefined) data.name = this.input.name;
    if (this.input.code !== undefined) data.code = this.input.code;
    if (this.input.courseId !== undefined) data.courseId = this.input.courseId;
    if (this.input.courseLevelId !== undefined) data.courseLevelId = this.input.courseLevelId;
    if (this.input.branchId !== undefined) data.branchId = this.input.branchId;
    if (this.input.teacherId !== undefined) data.teacherId = this.input.teacherId;
    if (this.input.academicYearId !== undefined) data.academicYearId = this.input.academicYearId;
    if (this.input.academicTermId !== undefined) data.academicTermId = this.input.academicTermId;
    if (this.input.capacity !== undefined) data.capacity = this.input.capacity;
    if (this.input.startDate !== undefined)
      data.startDate = this.input.startDate ? new Date(this.input.startDate) : null;
    if (this.input.endDate !== undefined)
      data.endDate = this.input.endDate ? new Date(this.input.endDate) : null;
    if (this.input.status !== undefined) data.status = this.input.status;

    const group = await updateClassGroup(
      this.input.classGroupId,
      this.context.organizationId,
      data
    );

    await auditService.log(this.context, {
      entity: "ClassGroup",
      entityId: group.id,
      action: "class_group.updated",
      oldValues: {
        name: this._existing!.name,
        status: this._existing!.status,
        teacherId: this._existing!.teacherId,
      },
      newValues: {
        name: group.name,
        status: group.status,
        teacherId: group.teacherId,
      },
    });

    return group;
  }
}
