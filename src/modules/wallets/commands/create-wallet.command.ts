import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { createWalletSchema, type CreateWalletInput } from "@/modules/wallets/schemas/wallet.schema";
import { findWalletByStudentId } from "@/modules/wallets/repositories/wallet.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { StudentWallet } from "@/modules/wallets/types";
import { findWalletById } from "@/modules/wallets/repositories/wallet.repository";

export class CreateWalletCommand extends BaseCommand<CreateWalletInput, StudentWallet> {
  async validate(): Promise<void> {
    const result = createWalletSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findWalletByStudentId(this.input.studentId, this.context.organizationId);
    if (existing) throw new BusinessRuleError("Este aluno já tem uma carteira nesta organização");

    const db = await getDb();
    const student = await db.student.findFirst({
      where: { id: this.input.studentId, organizationId: this.context.organizationId },
      select: { id: true },
    });
    if (!student) throw new NotFoundError("Aluno", this.input.studentId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.WALLETS_VIEW)) throw new AuthorizationError();
  }

  async execute(): Promise<StudentWallet> {
    const db = await getDb();
    const created = await db.studentWallet.create({
      data: {
        organizationId: this.context.organizationId,
        studentId: this.input.studentId,
        status: "ACTIVE",
        createdBy: this.context.userId,
      },
      select: { id: true },
    });

    await auditService.log(this.context, {
      entity: "StudentWallet",
      entityId: created.id,
      action: "wallet.created",
      newValues: { studentId: this.input.studentId },
    });

    const wallet = await findWalletById(created.id, this.context.organizationId);
    if (!wallet) throw new BusinessRuleError("Erro ao recuperar carteira após criação");
    return wallet;
  }
}
