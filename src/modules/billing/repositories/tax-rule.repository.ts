import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { TaxRule } from "@/modules/billing/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// TAX RULE REPOSITORY — all queries scoped to organizationId
// =============================================================================

export interface ListTaxRulesParams extends PaginationParams {
  search?: string;
  status?: string;
}

const taxRuleSelect = {
  id: true,
  organizationId: true,
  code: true,
  name: true,
  description: true,
  rate: true,
  appliesTo: true,
  isIncludedInPrice: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
} as const;

type TaxRuleRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  rate: DecimalLike;
  appliesTo: string;
  isIncludedInPrice: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
};

function mapToTaxRule(row: TaxRuleRow): TaxRule {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    description: row.description,
    rate: row.rate.toNumber(),
    appliesTo: row.appliesTo as TaxRule["appliesTo"],
    isIncludedInPrice: row.isIncludedInPrice,
    status: row.status as TaxRule["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export async function findTaxRulesByOrganization(
  organizationId: string,
  params: ListTaxRulesParams
): Promise<PaginatedResult<TaxRule>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.status && { status: params.status }),
    ...(params.search && {
      OR: [
        { code: { contains: params.search } },
        { name: { contains: params.search } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    db.taxRule.findMany({ where, select: taxRuleSelect, skip, take, orderBy: { name: "asc" } }),
    db.taxRule.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToTaxRule), total, params);
}

export async function findTaxRuleById(
  id: string,
  organizationId: string
): Promise<TaxRule | null> {
  const db = await getDb();
  const row = await db.taxRule.findFirst({ where: { id, organizationId, deletedAt: null }, select: taxRuleSelect });
  return row ? mapToTaxRule(row) : null;
}

export async function findActiveTaxRules(organizationId: string): Promise<TaxRule[]> {
  const db = await getDb();
  const rows = await db.taxRule.findMany({
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    select: taxRuleSelect,
    orderBy: { name: "asc" },
  });
  return rows.map(mapToTaxRule);
}

export async function taxCodeExistsInOrg(
  code: string,
  organizationId: string,
  excludeId?: string
): Promise<boolean> {
  const db = await getDb();
  const count = await db.taxRule.count({
    where: { code, organizationId, deletedAt: null, ...(excludeId && { NOT: { id: excludeId } }) },
  });
  return count > 0;
}

export async function createTaxRule(data: {
  organizationId: string;
  code: string;
  name: string;
  description?: string | null;
  rate: number;
  appliesTo: string;
  isIncludedInPrice: boolean;
  createdBy?: string | null;
}): Promise<TaxRule> {
  const db = await getDb();
  const row = await db.taxRule.create({ data, select: taxRuleSelect });
  return mapToTaxRule(row);
}

export async function updateTaxRule(
  id: string,
  organizationId: string,
  data: Partial<{
    code: string;
    name: string;
    description: string | null;
    rate: number;
    appliesTo: string;
    isIncludedInPrice: boolean;
    updatedBy: string | null;
  }>
): Promise<TaxRule> {
  const db = await getDb();
  const row = await db.taxRule.update({
    where: { id, organizationId },
    data: { ...data, updatedAt: new Date() },
    select: taxRuleSelect,
  });
  return mapToTaxRule(row);
}

export async function archiveTaxRule(
  id: string,
  organizationId: string,
  updatedBy?: string | null
): Promise<TaxRule> {
  const db = await getDb();
  const row = await db.taxRule.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED", deletedAt: new Date(), updatedBy: updatedBy ?? null, updatedAt: new Date() },
    select: taxRuleSelect,
  });
  return mapToTaxRule(row);
}

export async function createAppliedTax(data: {
  organizationId: string;
  invoiceId: string;
  taxRuleId: string;
  amount: number;
  rate: number;
  description?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.appliedTax.create({ data });
}

export async function countTaxRulesByStatus(organizationId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.taxRule.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row._count._all;
  return result;
}
