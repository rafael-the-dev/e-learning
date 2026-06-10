import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { AssessmentPeriod, ListAssessmentPeriodsParams } from "@/modules/assessments/types";

const periodSelect = {
  id: true,
  organizationId: true,
  academicYearId: true,
  academicTermId: true,
  name: true,
  code: true,
  startDate: true,
  endDate: true,
  order: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  academicYear: { select: { id: true, name: true } },
  academicTerm: { select: { id: true, name: true } },
} as const;

function mapToPeriod(row: any): AssessmentPeriod {
  return {
    id: row.id,
    organizationId: row.organizationId,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId,
    name: row.name,
    code: row.code,
    startDate: row.startDate,
    endDate: row.endDate,
    order: row.order,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    academicYearName: row.academicYear?.name ?? null,
    academicTermName: row.academicTerm?.name ?? null,
  };
}

export async function findAssessmentPeriodsByOrganization(
  organizationId: string,
  params: ListAssessmentPeriodsParams
): Promise<PaginatedResult<AssessmentPeriod>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where: any = { organizationId, deletedAt: null };
  if (params.status) where.status = params.status;
  if (params.academicYearId) where.academicYearId = params.academicYearId;
  if (params.academicTermId) where.academicTermId = params.academicTermId;
  if (params.search) where.name = { contains: params.search };

  const [rows, total] = await Promise.all([
    db.assessmentPeriod.findMany({
      where,
      select: periodSelect,
      skip,
      take,
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    }),
    db.assessmentPeriod.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToPeriod), total, params);
}

export async function findAssessmentPeriodById(
  id: string,
  organizationId: string
): Promise<AssessmentPeriod | null> {
  const db = await getDb();
  const row = await db.assessmentPeriod.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: periodSelect,
  });
  return row ? mapToPeriod(row) : null;
}

export async function findAssessmentPeriodByCode(
  code: string,
  organizationId: string
): Promise<AssessmentPeriod | null> {
  const db = await getDb();
  const row = await db.assessmentPeriod.findFirst({
    where: { code, organizationId, deletedAt: null },
    select: periodSelect,
  });
  return row ? mapToPeriod(row) : null;
}

export async function createAssessmentPeriod(data: {
  organizationId: string;
  academicYearId: string;
  academicTermId?: string | null;
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  order: number;
}): Promise<AssessmentPeriod> {
  const db = await getDb();
  const row = await db.assessmentPeriod.create({
    data: {
      organizationId: data.organizationId,
      academicYearId: data.academicYearId,
      academicTermId: data.academicTermId ?? null,
      name: data.name,
      code: data.code,
      startDate: data.startDate,
      endDate: data.endDate,
      order: data.order,
      status: "ACTIVE",
    },
    select: periodSelect,
  });
  return mapToPeriod(row);
}

export async function updateAssessmentPeriod(
  id: string,
  organizationId: string,
  data: Partial<{
    name: string;
    code: string;
    startDate: Date;
    endDate: Date;
    order: number;
    status: string;
  }>
): Promise<AssessmentPeriod> {
  const db = await getDb();
  const row = await db.assessmentPeriod.update({
    where: { id },
    data,
    select: periodSelect,
  });
  return mapToPeriod(row);
}
