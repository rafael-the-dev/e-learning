import { getDb } from "@/server/db";
import {
  BaseCommand,
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findImportJobById,
  updateImportJob,
} from "@/modules/import-jobs/repositories/import-job.repository";
import {
  parseImportDate,
  VALID_GENDERS,
  VALID_DOCUMENT_TYPES,
  VALID_TEACHER_STATUSES,
} from "@/modules/teachers/import/services/row-validator.service";
import type {
  ImportReport,
  ImportRowExecutionResult,
  ImportRowResult,
  TeacherImportRow,
} from "@/modules/teachers/import/types";
import type { ImportJob } from "@/modules/import-jobs/types";

const CHUNK_SIZE = 100;

export interface ExecuteTeachersImportInput {
  jobId: string;
}

function mapRowToTeacherCreateInput(
  row: TeacherImportRow,
  organizationId: string,
  createdBy: string
) {
  const gender = row.gender?.trim().toUpperCase() ?? "";
  const documentType = row.documentType?.trim().toUpperCase() ?? "";
  const documentNumber = row.documentNumber?.trim() ?? "";
  const status = row.status?.trim().toUpperCase() ?? "";

  return {
    organizationId,
    firstName: row.firstName.trim(),
    lastName: (row.lastName ?? "").trim(),
    email: row.email?.trim() || null,
    phone: row.phone?.trim() || null,
    dateOfBirth: row.birthDate ? parseImportDate(row.birthDate) : null,
    gender: VALID_GENDERS.has(gender) ? gender : null,
    address: row.address?.trim() || null,
    idType: documentType ? (VALID_DOCUMENT_TYPES.has(documentType) ? documentType : "OTHER") : null,
    idNumber: documentNumber || null,
    specialization: row.specialization?.trim() || null,
    hireDate: row.hireDate ? parseImportDate(row.hireDate) : null,
    status: VALID_TEACHER_STATUSES.has(status) ? status : "ACTIVE",
    createdBy,
    updatedBy: createdBy,
  };
}

export class ExecuteTeachersImportCommand extends BaseCommand<
  ExecuteTeachersImportInput,
  ImportReport
> {
  private job!: ImportJob;

  async validate(): Promise<void> {
    const job = await findImportJobById(this.input.jobId, this.context.organizationId);
    if (!job) throw new NotFoundError("ImportJob", this.input.jobId);
    if (job.status !== "VALIDATED") {
      throw new BusinessRuleError(
        "Este pedido de importação já foi processado ou ainda não foi validado"
      );
    }
    this.job = job;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TEACHERS_IMPORT)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ImportReport> {
    const startedAt = new Date();

    try {
      await updateImportJob(this.job.id, this.context.organizationId, {
        status: "PROCESSING",
        startedAt,
      });
      await auditService.log(this.context, {
        entity: "ImportJob",
        entityId: this.job.id,
        action: "import.job.processing",
        newValues: {
          jobId: this.job.id,
          organizationId: this.context.organizationId,
          totalRows: this.job.totalRows,
          actorUserId: this.context.userId,
        },
      });

      const stagedRows = (this.job.rowsData ?? []) as ImportRowResult[];
      const results: ImportRowExecutionResult[] = [];
      const importable = stagedRows.filter((row) => row.state !== "ERROR");

      for (const row of stagedRows) {
        if (row.state === "ERROR") {
          results.push({
            rowNumber: row.rowNumber,
            data: row.data,
            outcome: "SKIPPED",
            messages: row.messages,
            issues: row.issues,
          });
        }
      }

      const db = await getDb();
      for (let i = 0; i < importable.length; i += CHUNK_SIZE) {
        const chunk = importable.slice(i, i + CHUNK_SIZE);
        try {
          await db.$transaction(async (tx) => {
            await tx.teacher.createMany({
              data: chunk.map((row) =>
                mapRowToTeacherCreateInput(
                  row.data,
                  this.context.organizationId,
                  this.context.userId
                )
              ),
            });
          });
          for (const row of chunk) {
            results.push({
              rowNumber: row.rowNumber,
              data: row.data,
              outcome: "IMPORTED",
              messages: row.messages,
              issues: row.issues,
            });
          }
        } catch (chunkErr) {
          const reason = chunkErr instanceof Error ? chunkErr.message : "Erro desconhecido";
          for (const row of chunk) {
            results.push({
              rowNumber: row.rowNumber,
              data: row.data,
              outcome: "FAILED",
              messages: [...row.messages, `Falha ao importar: ${reason}`],
              issues: [
                ...row.issues,
                { field: "_execution", message: `Falha ao importar: ${reason}`, severity: "ERROR" },
              ],
            });
          }
        }
      }

      results.sort((a, b) => a.rowNumber - b.rowNumber);

      const successRows = results.filter((r) => r.outcome === "IMPORTED").length;
      const skippedCount = results.filter((r) => r.outcome === "SKIPPED").length;
      const failedCount = results.filter((r) => r.outcome === "FAILED").length;
      const completedAt = new Date();

      const durationMs = completedAt.getTime() - startedAt.getTime();

      await updateImportJob(this.job.id, this.context.organizationId, {
        status: "COMPLETED",
        successRows,
        failedRows: skippedCount + failedCount,
        resultData: results,
        executionSummary: { successRows, failedRows: skippedCount + failedCount, durationMs },
        completedAt,
      });

      await auditService.log(this.context, {
        entity: "ImportJob",
        entityId: this.job.id,
        action: "import.job.completed",
        newValues: {
          jobId: this.job.id,
          organizationId: this.context.organizationId,
          totalRows: this.job.totalRows,
          successRows,
          failedRows: skippedCount + failedCount,
          actorUserId: this.context.userId,
        },
      });

      return {
        jobId: this.job.id,
        status: "COMPLETED",
        totalRows: this.job.totalRows,
        importedCount: successRows,
        skippedCount,
        failedCount,
        startedAt,
        completedAt,
        durationMs,
        rows: results,
      };
    } catch (err) {
      const completedAt = new Date();
      try {
        await updateImportJob(this.job.id, this.context.organizationId, {
          status: "FAILED",
          completedAt,
        });
      } catch {
        // best-effort — surface the original error below regardless
      }
      await auditService.log(this.context, {
        entity: "ImportJob",
        entityId: this.job.id,
        action: "import.job.failed",
        newValues: {
          jobId: this.job.id,
          organizationId: this.context.organizationId,
          totalRows: this.job.totalRows,
          actorUserId: this.context.userId,
          reason: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }
}
