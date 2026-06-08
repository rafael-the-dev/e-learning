import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { FeeDefinition } from "@/modules/billing/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// FEE DEFINITION REPOSITORY — all queries scoped to organizationId
// =============================================================================

export interface ListFeeDefinitionsParams extends PaginationParams {
  search?: string;
  status?: string;
  feeType?: string;
}

const feeDefinitionSelect = {
  id: true,
  organizationId: true,
  code: true,
  name: true,
  description: true,
  feeType: true,
  defaultAmount: true,
  appliesTo: true,
  isMandatory: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
} as const;

type FeeDefinitionRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  feeType: string;
  defaultAmount: DecimalLike;
  appliesTo: string;
  isMandatory: boolean;
  priority: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
};

function mapToFeeDefinition(row: FeeDefinitionRow): FeeDefinition {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    description: row.description,
    feeType: row.feeType as FeeDefinition["feeType"],
    defaultAmount: row.defaultAmount.toNumber(),
    appliesTo: row.appliesTo as FeeDefinition["appliesTo"],
    isMandatory: row.isMandatory,
    priority: row.priority,
    status: row.status as FeeDefinition["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export async function findFeeDefinitionsByOrganization(
  organizationId: string,
  params: ListFeeDefinitionsParams
): Promise<PaginatedResult<FeeDefinition>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.status && { status: params.status }),
    ...(params.feeType && { feeType: params.feeType }),
    ...(params.search && {
      OR: [
        { code: { contains: params.search } },
        { name: { contains: params.search } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    db.feeDefinition.findMany({ where, select: feeDefinitionSelect, skip, take, orderBy: [{ priority: "asc" }, { name: "asc" }] }),
    db.feeDefinition.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToFeeDefinition), total, params);
}

export async function findFeeDefinitionById(
  id: string,
  organizationId: string
): Promise<FeeDefinition | null> {
  const db = await getDb();
  const row = await db.feeDefinition.findFirst({ where: { id, organizationId, deletedAt: null }, select: feeDefinitionSelect });
  return row ? mapToFeeDefinition(row) : null;
}

export async function findActiveFeeDefinitionsByOrganization(
  organizationId: string
): Promise<FeeDefinition[]> {
  const db = await getDb();
  const rows = await db.feeDefinition.findMany({
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    select: feeDefinitionSelect,
    orderBy: [{ priority: "asc" }, { name: "asc" }],
  });
  return rows.map(mapToFeeDefinition);
}

export async function feeCodeExistsInOrg(
  code: string,
  organizationId: string,
  excludeId?: string
): Promise<boolean> {
  const db = await getDb();
  const count = await db.feeDefinition.count({
    where: { code, organizationId, deletedAt: null, ...(excludeId && { NOT: { id: excludeId } }) },
  });
  return count > 0;
}

export async function createFeeDefinition(data: {
  organizationId: string;
  code: string;
  name: string;
  description?: string | null;
  feeType: string;
  defaultAmount: number;
  appliesTo: string;
  isMandatory: boolean;
  priority: number;
  createdBy?: string | null;
}): Promise<FeeDefinition> {
  const db = await getDb();
  const row = await db.feeDefinition.create({ data, select: feeDefinitionSelect });
  return mapToFeeDefinition(row);
}

export async function updateFeeDefinition(
  id: string,
  organizationId: string,
  data: Partial<{
    code: string;
    name: string;
    description: string | null;
    feeType: string;
    defaultAmount: number;
    appliesTo: string;
    isMandatory: boolean;
    priority: number;
    updatedBy: string | null;
  }>
): Promise<FeeDefinition> {
  const db = await getDb();
  const row = await db.feeDefinition.update({
    where: { id, organizationId },
    data: { ...data, updatedAt: new Date() },
    select: feeDefinitionSelect,
  });
  return mapToFeeDefinition(row);
}

export async function archiveFeeDefinition(
  id: string,
  organizationId: string,
  updatedBy?: string | null
): Promise<FeeDefinition> {
  const db = await getDb();
  const row = await db.feeDefinition.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED", deletedAt: new Date(), updatedBy: updatedBy ?? null, updatedAt: new Date() },
    select: feeDefinitionSelect,
  });
  return mapToFeeDefinition(row);
}

export async function countFeeDefinitionsByStatus(organizationId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.feeDefinition.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row._count._all;
  return result;
}
