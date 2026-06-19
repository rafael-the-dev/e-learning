import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  TaxReportFilters,
  TaxReportRow,
  TaxReportKPIs,
  TaxByRulePoint,
  TaxByBranchPoint,
  TaxMonthlyPoint,
} from "../types";

// ── Numeric coercion ────────────────────────────────────────────────────────
type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" && "toNumber" in v ? v.toNumber() : (v as number);
}

// Taxable base is not stored on AppliedTax — derive it from the same
// amount = base * (rate/100) relationship used to compute the tax originally
// (see billing-calculator.service.ts). Guard rate = 0 to avoid divide-by-zero.
const TAXABLE_BASE_EXPR = `CASE WHEN at.rate <> 0 THEN CAST(at.amount AS FLOAT) / (CAST(at.rate AS FLOAT) / 100) ELSE 0 END`;

// ── Sort whitelist (table is rooted at AppliedTax) ──────────────────────────
const SORT_EXPRESSIONS: Record<string, string> = {
  issueDate: "i.issueDate",
  taxAmount: "CAST(at.amount AS FLOAT)",
  taxableBase: TAXABLE_BASE_EXPR,
  invoiceNumber: "i.invoiceNumber",
  studentName: "s.firstName",
};

function resolveOrderBy(sortBy?: string, sortDir?: string): Prisma.Sql {
  if (!sortBy || !SORT_EXPRESSIONS[sortBy]) {
    return Prisma.raw("i.issueDate DESC");
  }
  const expr = SORT_EXPRESSIONS[sortBy];
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  return Prisma.raw(`${expr} ${dir}`);
}

// ── WHERE builder — applied-tax-rooted queries (KPIs, by-rule, by-branch, trend, table) ──
type TaxWhereFilters = Pick<
  TaxReportFilters,
  | "organizationId" | "branchId" | "courseId" | "academicYearId" | "academicTermId"
  | "dateFrom" | "dateTo" | "taxRuleId" | "invoiceStatus"
>;

function buildTaxWhere(filters: Partial<TaxWhereFilters> & Pick<TaxWhereFilters, "organizationId">): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`at.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
  ];

  if (filters.invoiceStatus) {
    clauses.push(Prisma.sql`i.status = ${filters.invoiceStatus}`);
  } else {
    clauses.push(Prisma.sql`i.status <> 'CANCELLED'`);
  }

  if (filters.branchId) clauses.push(Prisma.sql`i.branchId = ${filters.branchId}`);
  if (filters.courseId) clauses.push(Prisma.sql`e.courseId = ${filters.courseId}`);
  if (filters.academicYearId) clauses.push(Prisma.sql`e.academicYearId = ${filters.academicYearId}`);
  if (filters.academicTermId) clauses.push(Prisma.sql`e.academicTermId = ${filters.academicTermId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`i.issueDate >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) clauses.push(Prisma.sql`i.issueDate <= ${new Date(filters.dateTo)}`);
  if (filters.taxRuleId) clauses.push(Prisma.sql`at.taxRuleId = ${filters.taxRuleId}`);

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

const BASE_FROM = Prisma.sql`
  FROM applied_taxes at
  JOIN invoices  i  ON i.id = at.invoiceId
  JOIN tax_rules tr ON tr.id = at.taxRuleId
  LEFT JOIN students    s ON s.id = i.studentId    AND s.deletedAt IS NULL
  LEFT JOIN branches    b ON b.id = i.branchId
  LEFT JOIN enrollments e ON e.id = i.enrollmentId AND e.deletedAt IS NULL
  LEFT JOIN courses     c ON c.id = e.courseId
`;

// ── Invoice-rooted WHERE (for Gross Invoiced / Taxed Invoices / Exempt KPIs) ──
// Distinct from the applied-tax-rooted WHERE above: this scopes to invoices
// directly so an invoice with N applied taxes is never counted N times.
function buildInvoiceWhere(filters: Partial<TaxWhereFilters> & Pick<TaxWhereFilters, "organizationId">): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
  ];

  if (filters.invoiceStatus) {
    clauses.push(Prisma.sql`i.status = ${filters.invoiceStatus}`);
  } else {
    clauses.push(Prisma.sql`i.status <> 'CANCELLED'`);
  }

  if (filters.branchId) clauses.push(Prisma.sql`i.branchId = ${filters.branchId}`);
  if (filters.courseId) clauses.push(Prisma.sql`e.courseId = ${filters.courseId}`);
  if (filters.academicYearId) clauses.push(Prisma.sql`e.academicYearId = ${filters.academicYearId}`);
  if (filters.academicTermId) clauses.push(Prisma.sql`e.academicTermId = ${filters.academicTermId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`i.issueDate >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) clauses.push(Prisma.sql`i.issueDate <= ${new Date(filters.dateTo)}`);
  if (filters.taxRuleId) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM applied_taxes at2
      WHERE at2.invoiceId = i.id AND at2.taxRuleId = ${filters.taxRuleId}
    )`);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

// ── Raw row shapes ───────────────────────────────────────────────────────────
interface RawTaxRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string | null;
  firstName: string | null;
  lastName: string | null;
  branchId: string | null;
  branchName: string | null;
  taxRuleId: string;
  taxRuleName: string;
  taxRate: number;
  taxableBase: number;
  taxAmount: number;
  invoiceTotal: number;
  issueDate: Date;
  status: string;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
export async function getTaxKPIs(
  filters: Pick<
    TaxReportFilters,
    "organizationId" | "branchId" | "courseId" | "academicYearId" | "academicTermId"
    | "dateFrom" | "dateTo" | "taxRuleId" | "invoiceStatus"
  >
): Promise<TaxReportKPIs> {
  const db = await getDb();
  const taxWhere = buildTaxWhere(filters);
  const invoiceWhere = buildInvoiceWhere(filters);

  const [[taxRow], [invoiceRow]] = await Promise.all([
    db.$queryRaw<[{ totalTaxAmount: number; taxableBase: number }]>(Prisma.sql`
      SELECT
        ISNULL(SUM(CAST(at.amount AS FLOAT)), 0) AS totalTaxAmount,
        ISNULL(SUM(${Prisma.raw(TAXABLE_BASE_EXPR)}), 0) AS taxableBase
      ${BASE_FROM}
      ${taxWhere}
    `),
    db.$queryRaw<[{ grossInvoiced: number; taxedInvoicesCount: number | bigint; exemptAmount: number }]>(Prisma.sql`
      SELECT
        ISNULL(SUM(CAST(i.totalAmount AS FLOAT)), 0) AS grossInvoiced,
        COUNT(CASE WHEN EXISTS (
          SELECT 1 FROM applied_taxes at2 WHERE at2.invoiceId = i.id
        ) THEN 1 END) AS taxedInvoicesCount,
        ISNULL(SUM(CASE WHEN NOT EXISTS (
          SELECT 1 FROM applied_taxes at2 WHERE at2.invoiceId = i.id
        ) THEN CAST(i.totalAmount AS FLOAT) ELSE 0 END), 0) AS exemptAmount
      FROM invoices i
      LEFT JOIN enrollments e ON e.id = i.enrollmentId AND e.deletedAt IS NULL
      ${invoiceWhere}
    `),
  ]);

  const totalTaxAmount = toNum(taxRow?.totalTaxAmount);
  const taxableBase = toNum(taxRow?.taxableBase);

  return {
    totalTaxAmount,
    taxableBase,
    grossInvoiced: toNum(invoiceRow?.grossInvoiced),
    taxedInvoicesCount: Number(invoiceRow?.taxedInvoicesCount ?? 0),
    averageEffectiveTaxRate: taxableBase > 0 ? (totalTaxAmount / taxableBase) * 100 : 0,
    exemptAmount: toNum(invoiceRow?.exemptAmount),
  };
}

// ── Tax by rule ──────────────────────────────────────────────────────────────
export async function getTaxByRule(
  filters: Pick<
    TaxReportFilters,
    "organizationId" | "branchId" | "courseId" | "academicYearId" | "academicTermId"
    | "dateFrom" | "dateTo" | "taxRuleId" | "invoiceStatus"
  >
): Promise<TaxByRulePoint[]> {
  const db = await getDb();
  const whereFragment = buildTaxWhere(filters);

  const rows = await db.$queryRaw<{ taxRuleId: string; taxRuleName: string; taxAmount: number; taxableBase: number; count: number | bigint }[]>(Prisma.sql`
    SELECT
      at.taxRuleId,
      tr.name AS taxRuleName,
      ISNULL(SUM(CAST(at.amount AS FLOAT)), 0) AS taxAmount,
      ISNULL(SUM(${Prisma.raw(TAXABLE_BASE_EXPR)}), 0) AS taxableBase,
      COUNT(*) AS count
    ${BASE_FROM}
    ${whereFragment}
    GROUP BY at.taxRuleId, tr.name
    ORDER BY taxAmount DESC
  `);

  return rows.map((r) => ({
    taxRuleId: r.taxRuleId,
    taxRuleName: r.taxRuleName,
    taxAmount: toNum(r.taxAmount),
    taxableBase: toNum(r.taxableBase),
    count: Number(r.count),
  }));
}

// ── Tax by branch ────────────────────────────────────────────────────────────
export async function getTaxByBranch(
  filters: Pick<
    TaxReportFilters,
    "organizationId" | "branchId" | "courseId" | "academicYearId" | "academicTermId"
    | "dateFrom" | "dateTo" | "taxRuleId" | "invoiceStatus"
  >
): Promise<TaxByBranchPoint[]> {
  const db = await getDb();
  const whereFragment = buildTaxWhere(filters);

  const rows = await db.$queryRaw<{ branchId: string | null; branchName: string | null; taxAmount: number; taxableBase: number }[]>(Prisma.sql`
    SELECT
      i.branchId,
      ISNULL(b.name, 'Sem Filial') AS branchName,
      ISNULL(SUM(CAST(at.amount AS FLOAT)), 0) AS taxAmount,
      ISNULL(SUM(${Prisma.raw(TAXABLE_BASE_EXPR)}), 0) AS taxableBase
    ${BASE_FROM}
    ${whereFragment}
    GROUP BY i.branchId, b.name
    ORDER BY taxAmount DESC
  `);

  return rows.map((r) => ({
    branchId: r.branchId,
    branchName: r.branchName ?? "Sem Filial",
    taxAmount: toNum(r.taxAmount),
    taxableBase: toNum(r.taxableBase),
  }));
}

// ── Monthly trend (Tax by Month + Effective Tax Rate Trend) ─────────────────
export async function getTaxMonthlyTrend(
  filters: Pick<
    TaxReportFilters,
    "organizationId" | "branchId" | "courseId" | "academicYearId" | "academicTermId"
    | "dateFrom" | "dateTo" | "taxRuleId" | "invoiceStatus"
  >
): Promise<TaxMonthlyPoint[]> {
  const db = await getDb();
  const whereFragment = buildTaxWhere(filters);

  const rows = await db.$queryRaw<{ month: string; taxAmount: number; taxableBase: number }[]>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), i.issueDate, 120) AS month,
      ISNULL(SUM(CAST(at.amount AS FLOAT)), 0) AS taxAmount,
      ISNULL(SUM(${Prisma.raw(TAXABLE_BASE_EXPR)}), 0) AS taxableBase
    ${BASE_FROM}
    ${whereFragment}
    GROUP BY CONVERT(VARCHAR(7), i.issueDate, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => {
    const taxAmount = toNum(r.taxAmount);
    const taxableBase = toNum(r.taxableBase);
    return {
      month: r.month,
      taxAmount,
      taxableBase,
      effectiveTaxRate: taxableBase > 0 ? (taxAmount / taxableBase) * 100 : 0,
    };
  });
}

// ── Paginated row list ───────────────────────────────────────────────────────
export async function listTaxRows(
  filters: TaxReportFilters
): Promise<{ rows: TaxReportRow[]; total: number }> {
  const db = await getDb();
  const { page, pageSize } = filters;
  const skip = (page - 1) * pageSize;
  const whereFragment = buildTaxWhere(filters);
  const orderByExpr = resolveOrderBy(filters.sortBy, filters.sortDir);

  const [rawRows, countResult] = await Promise.all([
    db.$queryRaw<RawTaxRow[]>(Prisma.sql`
      SELECT
        at.id,
        i.id AS invoiceId,
        i.invoiceNumber,
        i.studentId,
        s.firstName,
        s.lastName,
        i.branchId,
        b.name AS branchName,
        at.taxRuleId,
        tr.name AS taxRuleName,
        CAST(at.rate AS FLOAT) AS taxRate,
        ${Prisma.raw(TAXABLE_BASE_EXPR)} AS taxableBase,
        CAST(at.amount AS FLOAT) AS taxAmount,
        CAST(i.totalAmount AS FLOAT) AS invoiceTotal,
        i.issueDate,
        i.status
      ${BASE_FROM}
      ${whereFragment}
      ORDER BY ${orderByExpr}
      OFFSET ${skip} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `),
    db.$queryRaw<[{ total: bigint }]>(Prisma.sql`
      SELECT COUNT(*) AS total
      ${BASE_FROM}
      ${whereFragment}
    `),
  ]);

  const total = Number(countResult[0]?.total ?? 0);

  const rows: TaxReportRow[] = rawRows.map((r) => ({
    appliedTaxId: r.id,
    invoiceId: r.invoiceId,
    invoiceNumber: r.invoiceNumber,
    studentId: r.studentId,
    studentName: r.firstName ? `${r.firstName} ${r.lastName ?? ""}`.trim() : null,
    branchId: r.branchId,
    branchName: r.branchName ?? null,
    taxRuleId: r.taxRuleId,
    taxRuleName: r.taxRuleName,
    taxRate: toNum(r.taxRate),
    taxableBase: toNum(r.taxableBase),
    taxAmount: toNum(r.taxAmount),
    invoiceTotal: toNum(r.invoiceTotal),
    issueDate: r.issueDate,
    status: r.status,
  }));

  return { rows, total };
}

// ── Integrity awareness ─────────────────────────────────────────────────────
// Tax amounts are part of Invoice.totalAmount, so a critical INVOICE_BALANCE
// integrity issue (e.g. "invoice.total_formula": subtotal - discount + tax <>
// total) means tax exposure shown here may not reflect reality.
export async function hasCriticalTaxIntegrityIssue(organizationId: string): Promise<boolean> {
  const db = await getDb();
  const [{ count }] = await db.$queryRaw<[{ count: number | bigint }]>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM financial_integrity_issues
    WHERE organizationId = ${organizationId}
      AND status = 'OPEN'
      AND severity = 'CRITICAL'
      AND category = 'INVOICE_BALANCE'
  `);
  return Number(count) > 0;
}
