import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { AcademicTerm } from "@/modules/academic-calendar/types";

// =============================================================================
// ACADEMIC TERM REPOSITORY
// All queries scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListAcademicTermsParams extends PaginationParams {
  academicYearId?: string;
  search?: string;
  status?: string;
}

const termSelect = {
  id: true,
  organizationId: true,
  academicYearId: true,
  name: true,
  code: true,
  startDate: true,
  endDate: true,
  order: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  academicYear: { select: { name: true, code: true } },
} as const;

function mapToTerm(row: {
  id: string;
  organizationId: string;
  academicYearId: string;
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  order: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  academicYear: { name: string; code: string } | null;
}): AcademicTerm {
  return {
    id: row.id,
    organizationId: row.organizationId,
    academicYearId: row.academicYearId,
    name: row.name,
    code: row.code,
    startDate: row.startDate,
    endDate: row.endDate,
    order: row.order,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    yearName: row.academicYear?.name,
    yearCode: row.academicYear?.code,
  };
}

export async function findAcademicTermsByOrganization(
  organizationId: string,
  params: ListAcademicTermsParams
): Promise<PaginatedResult<AcademicTerm>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.academicYearId && { academicYearId: params.academicYearId }),
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
  };

  const [rows, total] = await Promise.all([
    db.academicTerm.findMany({
      where,
      select: termSelect,
      skip,
      take,
      orderBy: [{ academicYearId: "asc" }, { order: "asc" }],
    }),
    db.academicTerm.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToTerm), total, params);
}

export async function findAcademicTermsByYear(
  academicYearId: string,
  organizationId: string
): Promise<AcademicTerm[]> {
  const db = await getDb();
  const rows = await db.academicTerm.findMany({
    where: { academicYearId, organizationId, deletedAt: null },
    select: termSelect,
    orderBy: { order: "asc" },
  });
  return rows.map(mapToTerm);
}

export async function findAcademicTermByIdInOrganization(
  id: string,
  organizationId: string
): Promise<AcademicTerm | null> {
  const db = await getDb();
  const row = await db.academicTerm.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: termSelect,
  });
  return row ? mapToTerm(row) : null;
}

export async function findAcademicTermByCode(
  academicYearId: string,
  code: string,
  excludeId?: string
): Promise<AcademicTerm | null> {
  const db = await getDb();
  const row = await db.academicTerm.findFirst({
    where: {
      academicYearId,
      code,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: termSelect,
  });
  return row ? mapToTerm(row) : null;
}

export async function findAcademicTermByOrder(
  academicYearId: string,
  order: number,
  excludeId?: string
): Promise<AcademicTerm | null> {
  const db = await getDb();
  const row = await db.academicTerm.findFirst({
    where: {
      academicYearId,
      order,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: termSelect,
  });
  return row ? mapToTerm(row) : null;
}

// Checks whether a term's date range overlaps with other terms in the same academic year.
export async function findOverlappingTermInYear(
  academicYearId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string
): Promise<AcademicTerm | null> {
  const db = await getDb();
  const row = await db.academicTerm.findFirst({
    where: {
      academicYearId,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: termSelect,
  });
  return row ? mapToTerm(row) : null;
}

export async function createAcademicTerm(data: {
  organizationId: string;
  academicYearId: string;
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  order: number;
  status?: string;
}): Promise<AcademicTerm> {
  const db = await getDb();
  const row = await db.academicTerm.create({
    data: {
      organizationId: data.organizationId,
      academicYearId: data.academicYearId,
      name: data.name,
      code: data.code,
      startDate: data.startDate,
      endDate: data.endDate,
      order: data.order,
      status: data.status ?? "DRAFT",
    },
    select: termSelect,
  });
  return mapToTerm(row);
}

export async function updateAcademicTerm(
  id: string,
  organizationId: string,
  data: {
    name?: string;
    code?: string;
    startDate?: Date;
    endDate?: Date;
    order?: number;
    status?: string;
  }
): Promise<AcademicTerm> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.order !== undefined) updateData.order = data.order;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.academicTerm.update({
    where: { id, organizationId },
    data: updateData,
    select: termSelect,
  });
  return mapToTerm(row);
}

export async function archiveAcademicTerm(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.academicTerm.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED" },
  });
}

export async function softDeleteAcademicTerm(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.academicTerm.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}
