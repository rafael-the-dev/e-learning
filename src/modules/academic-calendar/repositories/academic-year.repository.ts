import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { AcademicYear } from "@/modules/academic-calendar/types";

// =============================================================================
// ACADEMIC YEAR REPOSITORY
// All queries scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListAcademicYearsParams extends PaginationParams {
  search?: string;
  status?: string;
}

const yearSelect = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  startDate: true,
  endDate: true,
  status: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: { select: { terms: true } },
} as const;

function mapToYear(row: {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  status: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  _count: { terms: number };
}): AcademicYear {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    termsCount: row._count.terms,
  };
}

export async function findAcademicYearsByOrganization(
  organizationId: string,
  params: ListAcademicYearsParams
): Promise<PaginatedResult<AcademicYear>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
  };

  const [rows, total] = await Promise.all([
    db.academicYear.findMany({
      where,
      select: yearSelect,
      skip,
      take,
      orderBy: [{ startDate: "desc" }, { name: "asc" }],
    }),
    db.academicYear.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToYear), total, params);
}

export async function findAllAcademicYearsByOrganization(
  organizationId: string
): Promise<AcademicYear[]> {
  const db = await getDb();
  const rows = await db.academicYear.findMany({
    where: { organizationId, deletedAt: null },
    select: yearSelect,
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
  });
  return rows.map(mapToYear);
}

export async function findAcademicYearByIdInOrganization(
  id: string,
  organizationId: string
): Promise<AcademicYear | null> {
  const db = await getDb();
  const row = await db.academicYear.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: yearSelect,
  });
  return row ? mapToYear(row) : null;
}

export async function findAcademicYearByCode(
  organizationId: string,
  code: string,
  excludeId?: string
): Promise<AcademicYear | null> {
  const db = await getDb();
  const row = await db.academicYear.findFirst({
    where: {
      organizationId,
      code,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: yearSelect,
  });
  return row ? mapToYear(row) : null;
}

export async function findDefaultAcademicYear(
  organizationId: string
): Promise<AcademicYear | null> {
  const db = await getDb();
  const row = await db.academicYear.findFirst({
    where: { organizationId, isDefault: true, deletedAt: null },
    select: yearSelect,
  });
  return row ? mapToYear(row) : null;
}

export async function createAcademicYear(data: {
  organizationId: string;
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  status?: string;
  isDefault?: boolean;
}): Promise<AcademicYear> {
  const db = await getDb();
  const row = await db.academicYear.create({
    data: {
      organizationId: data.organizationId,
      name: data.name,
      code: data.code,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status ?? "DRAFT",
      isDefault: data.isDefault ?? false,
    },
    select: yearSelect,
  });
  return mapToYear(row);
}

export async function updateAcademicYear(
  id: string,
  organizationId: string,
  data: {
    name?: string;
    code?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
  }
): Promise<AcademicYear> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.academicYear.update({
    where: { id, organizationId },
    data: updateData,
    select: yearSelect,
  });
  return mapToYear(row);
}

// Clears isDefault on all years in the org, then sets it on the target.
export async function setDefaultAcademicYear(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.academicYear.updateMany({
    where: { organizationId, deletedAt: null },
    data: { isDefault: false },
  });
  await db.academicYear.update({
    where: { id, organizationId },
    data: { isDefault: true },
  });
}

export async function archiveAcademicYear(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.academicYear.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED", isDefault: false },
  });
}

export async function softDeleteAcademicYear(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.academicYear.update({
    where: { id, organizationId },
    data: { deletedAt: new Date(), isDefault: false },
  });
}

export async function countActiveTermsForYear(
  academicYearId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.academicTerm.count({
    where: { academicYearId, organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
  });
}
