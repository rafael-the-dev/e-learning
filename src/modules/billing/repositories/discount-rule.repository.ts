import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { DiscountRule } from "@/modules/billing/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// DISCOUNT RULE REPOSITORY — all queries scoped to organizationId
// =============================================================================

export interface ListDiscountRulesParams extends PaginationParams {
  search?: string;
  status?: string;
  discountType?: string;
}

const discountRuleSelect = {
  id: true,
  organizationId: true,
  code: true,
  name: true,
  description: true,
  discountType: true,
  value: true,
  appliesTo: true,
  startDate: true,
  endDate: true,
  stackable: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
} as const;

type DiscountRuleRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  value: DecimalLike;
  appliesTo: string;
  startDate: Date | null;
  endDate: Date | null;
  stackable: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
};

function mapToDiscountRule(row: DiscountRuleRow): DiscountRule {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    description: row.description,
    discountType: row.discountType as DiscountRule["discountType"],
    value: row.value.toNumber(),
    appliesTo: row.appliesTo as DiscountRule["appliesTo"],
    startDate: row.startDate,
    endDate: row.endDate,
    stackable: row.stackable,
    status: row.status as DiscountRule["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export async function findDiscountRulesByOrganization(
  organizationId: string,
  params: ListDiscountRulesParams
): Promise<PaginatedResult<DiscountRule>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.status && { status: params.status }),
    ...(params.discountType && { discountType: params.discountType }),
    ...(params.search && {
      OR: [
        { code: { contains: params.search } },
        { name: { contains: params.search } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    db.discountRule.findMany({ where, select: discountRuleSelect, skip, take, orderBy: { name: "asc" } }),
    db.discountRule.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToDiscountRule), total, params);
}

export async function findDiscountRuleById(
  id: string,
  organizationId: string
): Promise<DiscountRule | null> {
  const db = await getDb();
  const row = await db.discountRule.findFirst({ where: { id, organizationId, deletedAt: null }, select: discountRuleSelect });
  return row ? mapToDiscountRule(row) : null;
}

export async function findActiveDiscountRules(organizationId: string): Promise<DiscountRule[]> {
  const db = await getDb();
  const now = new Date();
  const rows = await db.discountRule.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      deletedAt: null,
      OR: [
        { startDate: null, endDate: null },
        { startDate: { lte: now }, endDate: { gte: now } },
        { startDate: null, endDate: { gte: now } },
        { startDate: { lte: now }, endDate: null },
      ],
    },
    select: discountRuleSelect,
    orderBy: { name: "asc" },
  });
  return rows.map(mapToDiscountRule);
}

export async function discountCodeExistsInOrg(
  code: string,
  organizationId: string,
  excludeId?: string
): Promise<boolean> {
  const db = await getDb();
  const count = await db.discountRule.count({
    where: { code, organizationId, deletedAt: null, ...(excludeId && { NOT: { id: excludeId } }) },
  });
  return count > 0;
}

export async function createDiscountRule(data: {
  organizationId: string;
  code: string;
  name: string;
  description?: string | null;
  discountType: string;
  value: number;
  appliesTo: string;
  startDate?: Date | null;
  endDate?: Date | null;
  stackable: boolean;
  createdBy?: string | null;
}): Promise<DiscountRule> {
  const db = await getDb();
  const row = await db.discountRule.create({ data, select: discountRuleSelect });
  return mapToDiscountRule(row);
}

export async function updateDiscountRule(
  id: string,
  organizationId: string,
  data: Partial<{
    code: string;
    name: string;
    description: string | null;
    discountType: string;
    value: number;
    appliesTo: string;
    startDate: Date | null;
    endDate: Date | null;
    stackable: boolean;
    updatedBy: string | null;
  }>
): Promise<DiscountRule> {
  const db = await getDb();
  const row = await db.discountRule.update({
    where: { id, organizationId },
    data: { ...data, updatedAt: new Date() },
    select: discountRuleSelect,
  });
  return mapToDiscountRule(row);
}

export async function archiveDiscountRule(
  id: string,
  organizationId: string,
  updatedBy?: string | null
): Promise<DiscountRule> {
  const db = await getDb();
  const row = await db.discountRule.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED", deletedAt: new Date(), updatedBy: updatedBy ?? null, updatedAt: new Date() },
    select: discountRuleSelect,
  });
  return mapToDiscountRule(row);
}

export async function createAppliedDiscount(data: {
  organizationId: string;
  invoiceId: string;
  discountRuleId: string;
  amount: number;
  description?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.appliedDiscount.create({ data });
}

export async function countDiscountRulesByStatus(organizationId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.discountRule.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row._count._all;
  return result;
}
