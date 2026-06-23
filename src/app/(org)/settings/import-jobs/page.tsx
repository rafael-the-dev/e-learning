import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  listImportJobs,
  getImportJobKPIs,
} from "@/modules/import-jobs/repositories/import-job.repository";
import { findUsersByOrganization } from "@/modules/users/repositories/user.repository";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { IMPORT_JOB_TYPES, IMPORT_JOB_STATUSES } from "@/modules/import-jobs/types";
import type { ImportJobType, ImportJobStatus } from "@/modules/import-jobs/types";
import { ImportJobsClient } from "./_components/import-jobs-client";

export const metadata = { title: "Histórico de Importações" };

function asValidType(value: string | undefined): ImportJobType | undefined {
  return value && (IMPORT_JOB_TYPES as readonly string[]).includes(value)
    ? (value as ImportJobType)
    : undefined;
}

function asValidStatus(value: string | undefined): ImportJobStatus | undefined {
  return value && (IMPORT_JOB_STATUSES as readonly string[]).includes(value)
    ? (value as ImportJobStatus)
    : undefined;
}

export default async function ImportJobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    type?: string;
    status?: string;
    uploadedById?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.IMPORT_JOBS_VIEW);

  const { page, search, type, status, uploadedById, dateFrom, dateTo } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const filters = {
    search,
    type: asValidType(type),
    status: asValidStatus(status),
    uploadedById,
    dateFrom,
    dateTo,
  };

  const [result, kpis, orgUsers] = await Promise.all([
    listImportJobs(context.organizationId, filters, pagination),
    getImportJobKPIs(context.organizationId),
    findUsersByOrganization(context.organizationId, { page: 1, pageSize: 200 }),
  ]);

  return (
    <ImportJobsClient
      result={result}
      kpis={kpis}
      users={orgUsers.data.map((u) => ({ id: u.id, name: u.name }))}
      search={search}
      type={filters.type}
      status={filters.status}
      uploadedById={uploadedById}
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  );
}
