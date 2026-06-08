import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { EnrollmentBillingPolicy, PolicyFee } from "@/modules/billing/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// BILLING POLICY REPOSITORY — all queries scoped to organizationId
// =============================================================================

export interface ListBillingPoliciesParams extends PaginationParams {
  search?: string;
  status?: string;
}

const policyFeeSelect = {
  id: true,
  organizationId: true,
  policyId: true,
  feeDefinitionId: true,
  amountType: true,
  fixedAmount: true,
  percentage: true,
  isRequired: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  feeDefinition: {
    select: {
      name: true,
      code: true,
      feeType: true,
      defaultAmount: true,
    },
  },
} as const;

const policySelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  autoGenerateInvoiceOnEnrollment: true,
  invoiceMode: true,
  activationRule: true,
  installmentsRequired: true,
  defaultNumberOfInstallments: true,
  minimumFirstPaymentAmount: true,
  allowWalletCreditOnEnrollment: true,
  status: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  updatedBy: true,
  policyFees: { select: policyFeeSelect, orderBy: { priority: "asc" as const } },
} as const;

type PolicyFeeRow = {
  id: string;
  organizationId: string;
  policyId: string;
  feeDefinitionId: string;
  amountType: string;
  fixedAmount: DecimalLike | null;
  percentage: DecimalLike | null;
  isRequired: boolean;
  priority: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  feeDefinition: {
    name: string;
    code: string;
    feeType: string;
    defaultAmount: DecimalLike;
  };
};

type PolicyRow = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  autoGenerateInvoiceOnEnrollment: boolean;
  invoiceMode: string;
  activationRule: string;
  installmentsRequired: boolean;
  defaultNumberOfInstallments: number | null;
  minimumFirstPaymentAmount: DecimalLike | null;
  allowWalletCreditOnEnrollment: boolean;
  status: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  policyFees: PolicyFeeRow[];
};

function mapPolicyFee(row: PolicyFeeRow): PolicyFee {
  return {
    id: row.id,
    organizationId: row.organizationId,
    policyId: row.policyId,
    feeDefinitionId: row.feeDefinitionId,
    amountType: row.amountType as PolicyFee["amountType"],
    fixedAmount: row.fixedAmount ? row.fixedAmount.toNumber() : null,
    percentage: row.percentage ? row.percentage.toNumber() : null,
    isRequired: row.isRequired,
    priority: row.priority,
    status: row.status as PolicyFee["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    feeDefinitionName: row.feeDefinition.name,
    feeDefinitionCode: row.feeDefinition.code,
    feeDefinitionType: row.feeDefinition.feeType as PolicyFee["feeDefinitionType"],
    feeDefinitionDefaultAmount: row.feeDefinition.defaultAmount.toNumber(),
  };
}

function mapToPolicy(row: PolicyRow): EnrollmentBillingPolicy {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    autoGenerateInvoiceOnEnrollment: row.autoGenerateInvoiceOnEnrollment,
    invoiceMode: row.invoiceMode as EnrollmentBillingPolicy["invoiceMode"],
    activationRule: row.activationRule as EnrollmentBillingPolicy["activationRule"],
    installmentsRequired: row.installmentsRequired,
    defaultNumberOfInstallments: row.defaultNumberOfInstallments,
    minimumFirstPaymentAmount: row.minimumFirstPaymentAmount ? row.minimumFirstPaymentAmount.toNumber() : null,
    allowWalletCreditOnEnrollment: row.allowWalletCreditOnEnrollment,
    status: row.status as EnrollmentBillingPolicy["status"],
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    policyFees: row.policyFees.map(mapPolicyFee),
  };
}

export async function findBillingPoliciesByOrganization(
  organizationId: string,
  params: ListBillingPoliciesParams
): Promise<PaginatedResult<EnrollmentBillingPolicy>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.status && { status: params.status }),
    ...(params.search && {
      OR: [{ name: { contains: params.search } }],
    }),
  };

  const [rows, total] = await Promise.all([
    db.enrollmentBillingPolicy.findMany({ where, select: policySelect, skip, take, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    db.enrollmentBillingPolicy.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToPolicy), total, params);
}

export async function findBillingPolicyById(
  id: string,
  organizationId: string
): Promise<EnrollmentBillingPolicy | null> {
  const db = await getDb();
  const row = await db.enrollmentBillingPolicy.findFirst({ where: { id, organizationId, deletedAt: null }, select: policySelect });
  return row ? mapToPolicy(row) : null;
}

export async function findDefaultBillingPolicy(
  organizationId: string
): Promise<EnrollmentBillingPolicy | null> {
  const db = await getDb();
  const row = await db.enrollmentBillingPolicy.findFirst({
    where: { organizationId, isDefault: true, status: "ACTIVE", deletedAt: null },
    select: policySelect,
  });
  return row ? mapToPolicy(row) : null;
}

export async function policyNameExistsInOrg(
  name: string,
  organizationId: string,
  excludeId?: string
): Promise<boolean> {
  const db = await getDb();
  const count = await db.enrollmentBillingPolicy.count({
    where: { name, organizationId, deletedAt: null, ...(excludeId && { NOT: { id: excludeId } }) },
  });
  return count > 0;
}

export async function createBillingPolicy(data: {
  organizationId: string;
  name: string;
  description?: string | null;
  autoGenerateInvoiceOnEnrollment: boolean;
  invoiceMode: string;
  activationRule: string;
  installmentsRequired: boolean;
  defaultNumberOfInstallments?: number | null;
  minimumFirstPaymentAmount?: number | null;
  allowWalletCreditOnEnrollment: boolean;
  isDefault: boolean;
  createdBy?: string | null;
}): Promise<EnrollmentBillingPolicy> {
  const db = await getDb();
  if (data.isDefault) {
    const [, row] = await db.$transaction([
      db.enrollmentBillingPolicy.updateMany({
        where: { organizationId: data.organizationId, isDefault: true },
        data: { isDefault: false },
      }),
      db.enrollmentBillingPolicy.create({ data, select: policySelect }),
    ]);
    return mapToPolicy(row as PolicyRow);
  }
  const row = await db.enrollmentBillingPolicy.create({ data, select: policySelect });
  return mapToPolicy(row);
}

export async function updateBillingPolicy(
  id: string,
  organizationId: string,
  data: Partial<{
    name: string;
    description: string | null;
    autoGenerateInvoiceOnEnrollment: boolean;
    invoiceMode: string;
    activationRule: string;
    installmentsRequired: boolean;
    defaultNumberOfInstallments: number | null;
    minimumFirstPaymentAmount: number | null;
    allowWalletCreditOnEnrollment: boolean;
    status: string;
    isDefault: boolean;
    updatedBy: string | null;
  }>
): Promise<EnrollmentBillingPolicy> {
  const db = await getDb();
  if (data.isDefault) {
    const [, row] = await db.$transaction([
      db.enrollmentBillingPolicy.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      }),
      db.enrollmentBillingPolicy.update({
        where: { id, organizationId },
        data: { ...data, updatedAt: new Date() },
        select: policySelect,
      }),
    ]);
    return mapToPolicy(row as PolicyRow);
  }
  const row = await db.enrollmentBillingPolicy.update({
    where: { id, organizationId },
    data: { ...data, updatedAt: new Date() },
    select: policySelect,
  });
  return mapToPolicy(row);
}

export async function clearDefaultBillingPolicy(organizationId: string): Promise<void> {
  const db = await getDb();
  await db.enrollmentBillingPolicy.updateMany({
    where: { organizationId, isDefault: true },
    data: { isDefault: false },
  });
}

export async function archiveBillingPolicy(
  id: string,
  organizationId: string,
  updatedBy?: string | null
): Promise<EnrollmentBillingPolicy> {
  const db = await getDb();
  const row = await db.enrollmentBillingPolicy.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED", isDefault: false, deletedAt: new Date(), updatedBy: updatedBy ?? null, updatedAt: new Date() },
    select: policySelect,
  });
  return mapToPolicy(row);
}

// Policy Fees

const policyFeeSelectSimple = {
  id: true,
  organizationId: true,
  policyId: true,
  feeDefinitionId: true,
  amountType: true,
  fixedAmount: true,
  percentage: true,
  isRequired: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  feeDefinition: {
    select: { name: true, code: true, feeType: true, defaultAmount: true },
  },
} as const;

export async function addPolicyFee(data: {
  organizationId: string;
  policyId: string;
  feeDefinitionId: string;
  amountType: string;
  fixedAmount?: number | null;
  percentage?: number | null;
  isRequired: boolean;
  priority: number;
}): Promise<PolicyFee> {
  const db = await getDb();
  const row = await db.policyFee.create({ data, select: policyFeeSelectSimple });
  return mapPolicyFee(row as PolicyFeeRow);
}

export async function updatePolicyFee(
  id: string,
  organizationId: string,
  data: Partial<{
    amountType: string;
    fixedAmount: number | null;
    percentage: number | null;
    isRequired: boolean;
    priority: number;
    status: string;
  }>
): Promise<PolicyFee> {
  const db = await getDb();
  const row = await db.policyFee.update({
    where: { id, organizationId },
    data: { ...data, updatedAt: new Date() },
    select: policyFeeSelectSimple,
  });
  return mapPolicyFee(row as PolicyFeeRow);
}

export async function removePolicyFee(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.policyFee.delete({ where: { id, organizationId } });
}

export async function policyFeeExists(policyId: string, feeDefinitionId: string, organizationId: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.policyFee.count({ where: { policyId, feeDefinitionId, organizationId } });
  return count > 0;
}

export async function countBillingPoliciesByStatus(organizationId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.enrollmentBillingPolicy.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row._count._all;
  return result;
}
