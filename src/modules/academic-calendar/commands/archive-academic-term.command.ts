import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findAcademicTermByIdInOrganization,
  archiveAcademicTerm,
  softDeleteAcademicTerm,
} from "@/modules/academic-calendar/repositories/academic-term.repository";
import type {
  ArchiveAcademicTermSchema,
  DeleteAcademicTermSchema,
} from "@/modules/academic-calendar/schemas/academic-term.schema";

export class ArchiveAcademicTermCommand extends BaseCommand<
  ArchiveAcademicTermSchema,
  void
> {
  async validate(): Promise<void> {
    const term = await findAcademicTermByIdInOrganization(
      this.input.academicTermId,
      this.context.organizationId
    );
    if (!term) throw new NotFoundError("Período Letivo", this.input.academicTermId);
    if (term.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        academicTermId: ["Este período já está arquivado"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_TERMS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await archiveAcademicTerm(this.input.academicTermId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "AcademicTerm",
      entityId: this.input.academicTermId,
      action: "academic_term.archived",
      newValues: { status: "ARCHIVED" },
    });
  }
}

export class SoftDeleteAcademicTermCommand extends BaseCommand<
  DeleteAcademicTermSchema,
  void
> {
  async validate(): Promise<void> {
    const term = await findAcademicTermByIdInOrganization(
      this.input.academicTermId,
      this.context.organizationId
    );
    if (!term) throw new NotFoundError("Período Letivo", this.input.academicTermId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_TERMS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteAcademicTerm(this.input.academicTermId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "AcademicTerm",
      entityId: this.input.academicTermId,
      action: "academic_term.deleted",
      newValues: { deleted: true },
    });
  }
}
