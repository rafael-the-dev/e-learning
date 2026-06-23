import { BaseCommand, AuthorizationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findExistingTeacherIdNumbers,
  findExistingTeacherEmails,
} from "@/modules/teachers/repositories/teacher.repository";
import { createImportJob } from "@/modules/import-jobs/repositories/import-job.repository";
import {
  assertFileConstraints,
  parseImportFile,
} from "@/modules/teachers/import/services/file-parser.service";
import { validateRows } from "@/modules/teachers/import/services/row-validator.service";
import type { ValidationResult } from "@/modules/teachers/import/types";

export interface ValidateTeachersImportInput {
  fileName: string;
  fileSize: number;
  buffer: Buffer;
}

export class ValidateTeachersImportCommand extends BaseCommand<
  ValidateTeachersImportInput,
  ValidationResult
> {
  async validate(): Promise<void> {
    assertFileConstraints({ size: this.input.fileSize, name: this.input.fileName });
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TEACHERS_IMPORT)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ValidationResult> {
    const rows = parseImportFile(this.input.buffer, this.input.fileName);

    const docNumbers = [
      ...new Set(
        rows.map((r) => r.documentNumber?.trim() ?? "").filter((v) => v.length > 0)
      ),
    ];
    const emails = [
      ...new Set(
        rows.map((r) => r.email?.trim().toLowerCase() ?? "").filter((v) => v.length > 0)
      ),
    ];

    const [existingDocNumbers, existingEmails] = await Promise.all([
      findExistingTeacherIdNumbers(this.context.organizationId, docNumbers),
      findExistingTeacherEmails(this.context.organizationId, emails),
    ]);

    const result = validateRows(rows, existingDocNumbers, existingEmails);

    const job = await createImportJob({
      organizationId: this.context.organizationId,
      type: "TEACHERS",
      uploadedFileName: this.input.fileName,
      totalRows: result.totalRows,
      rowsData: result.rows,
      validationSummary: {
        totalRows: result.totalRows,
        validRows: result.validRows,
        warningRows: result.warningRows,
        errorRows: result.errorRows,
      },
      uploadedById: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "ImportJob",
      entityId: job.id,
      action: "import.job.created",
      newValues: {
        jobId: job.id,
        organizationId: this.context.organizationId,
        type: "TEACHERS",
        uploadedFileName: this.input.fileName,
        actorUserId: this.context.userId,
      },
    });
    await auditService.log(this.context, {
      entity: "ImportJob",
      entityId: job.id,
      action: "import.job.validated",
      newValues: {
        jobId: job.id,
        organizationId: this.context.organizationId,
        totalRows: result.totalRows,
        validRows: result.validRows,
        warningRows: result.warningRows,
        errorRows: result.errorRows,
        actorUserId: this.context.userId,
      },
    });

    return { ...result, jobId: job.id };
  }
}
