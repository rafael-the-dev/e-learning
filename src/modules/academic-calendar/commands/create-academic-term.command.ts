import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  createAcademicTerm,
  findAcademicTermByCode,
  findAcademicTermByOrder,
  findOverlappingTermInYear,
} from "@/modules/academic-calendar/repositories/academic-term.repository";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import {
  createAcademicTermSchema,
  type CreateAcademicTermSchema,
} from "@/modules/academic-calendar/schemas/academic-term.schema";
import type { AcademicTerm } from "@/modules/academic-calendar/types";

export class CreateAcademicTermCommand extends BaseCommand<
  CreateAcademicTermSchema,
  AcademicTerm
> {
  async validate(): Promise<void> {
    const result = createAcademicTermSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    // Validate academicYearId belongs to this organization
    const year = await findAcademicYearByIdInOrganization(
      this.input.academicYearId,
      this.context.organizationId
    );
    if (!year) throw new NotFoundError("Ano Letivo", this.input.academicYearId);

    // Term must be within academic year date range
    const start = new Date(this.input.startDate);
    const end = new Date(this.input.endDate);
    if (start < new Date(year.startDate) || end > new Date(year.endDate)) {
      throw new ValidationError("Dados inválidos", {
        startDate: ["As datas do período devem estar dentro do intervalo do ano letivo"],
      });
    }

    // Unique code per academic year
    const dupCode = await findAcademicTermByCode(this.input.academicYearId, this.input.code);
    if (dupCode) {
      throw new ValidationError("Dados inválidos", {
        code: ["Já existe um período com este código neste ano letivo"],
      });
    }

    // Unique order per academic year
    const dupOrder = await findAcademicTermByOrder(this.input.academicYearId, this.input.order);
    if (dupOrder) {
      throw new ValidationError("Dados inválidos", {
        order: ["Já existe um período com esta ordem neste ano letivo"],
      });
    }

    // No overlapping dates
    const overlap = await findOverlappingTermInYear(
      this.input.academicYearId,
      start,
      end
    );
    if (overlap) {
      throw new ValidationError("Dados inválidos", {
        startDate: [`As datas sobrepõem-se com o período "${overlap.name}"`],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_TERMS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AcademicTerm> {
    const term = await createAcademicTerm({
      organizationId: this.context.organizationId,
      academicYearId: this.input.academicYearId,
      name: this.input.name,
      code: this.input.code,
      startDate: new Date(this.input.startDate),
      endDate: new Date(this.input.endDate),
      order: this.input.order,
      status: this.input.status ?? "DRAFT",
    });

    await auditService.log(this.context, {
      entity: "AcademicTerm",
      entityId: term.id,
      action: "academic_term.created",
      newValues: { name: term.name, code: term.code, order: term.order, status: term.status },
    });

    return term;
  }
}
