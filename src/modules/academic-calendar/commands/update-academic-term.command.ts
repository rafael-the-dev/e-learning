import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findAcademicTermByIdInOrganization,
  findAcademicTermByCode,
  findAcademicTermByOrder,
  findOverlappingTermInYear,
  updateAcademicTerm,
} from "@/modules/academic-calendar/repositories/academic-term.repository";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import {
  updateAcademicTermSchema,
  type UpdateAcademicTermSchema,
} from "@/modules/academic-calendar/schemas/academic-term.schema";
import type { AcademicTerm } from "@/modules/academic-calendar/types";

interface Input extends UpdateAcademicTermSchema {
  academicTermId: string;
}

export class UpdateAcademicTermCommand extends BaseCommand<Input, AcademicTerm> {
  async validate(): Promise<void> {
    const result = updateAcademicTermSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findAcademicTermByIdInOrganization(
      this.input.academicTermId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Período Letivo", this.input.academicTermId);

    const startDate = this.input.startDate ? new Date(this.input.startDate) : existing.startDate;
    const endDate = this.input.endDate ? new Date(this.input.endDate) : existing.endDate;

    if (startDate >= endDate) {
      throw new ValidationError("Dados inválidos", {
        endDate: ["A data de fim deve ser posterior à data de início"],
      });
    }

    // Validate term stays within academic year range
    const year = await findAcademicYearByIdInOrganization(
      existing.academicYearId,
      this.context.organizationId
    );
    if (year) {
      if (startDate < new Date(year.startDate) || endDate > new Date(year.endDate)) {
        throw new ValidationError("Dados inválidos", {
          startDate: ["As datas do período devem estar dentro do intervalo do ano letivo"],
        });
      }
    }

    if (this.input.code) {
      const dupCode = await findAcademicTermByCode(
        existing.academicYearId,
        this.input.code,
        this.input.academicTermId
      );
      if (dupCode) {
        throw new ValidationError("Dados inválidos", {
          code: ["Já existe um período com este código neste ano letivo"],
        });
      }
    }

    if (this.input.order !== undefined) {
      const dupOrder = await findAcademicTermByOrder(
        existing.academicYearId,
        this.input.order,
        this.input.academicTermId
      );
      if (dupOrder) {
        throw new ValidationError("Dados inválidos", {
          order: ["Já existe um período com esta ordem neste ano letivo"],
        });
      }
    }

    // Check date overlap with other terms
    const overlap = await findOverlappingTermInYear(
      existing.academicYearId,
      startDate,
      endDate,
      this.input.academicTermId
    );
    if (overlap) {
      throw new ValidationError("Dados inválidos", {
        startDate: [`As datas sobrepõem-se com o período "${overlap.name}"`],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_TERMS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AcademicTerm> {
    const term = await updateAcademicTerm(
      this.input.academicTermId,
      this.context.organizationId,
      {
        name: this.input.name,
        code: this.input.code,
        startDate: this.input.startDate ? new Date(this.input.startDate) : undefined,
        endDate: this.input.endDate ? new Date(this.input.endDate) : undefined,
        order: this.input.order,
        status: this.input.status,
      }
    );

    await auditService.log(this.context, {
      entity: "AcademicTerm",
      entityId: term.id,
      action: "academic_term.updated",
      newValues: { name: term.name, code: term.code, order: term.order, status: term.status },
    });

    return term;
  }
}
