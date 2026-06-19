import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type { RevenueTrendFilters } from "../types";

function num(v: { toNumber(): number } | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

function dateRangeClauses(column: string, filters: Pick<RevenueTrendFilters, "dateFrom" | "dateTo">): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [];
  if (filters.dateFrom) clauses.push(Prisma.sql`${Prisma.raw(column)} >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    clauses.push(Prisma.sql`${Prisma.raw(column)} <= ${end}`);
  }
  return clauses;
}

function enrollmentScopeClauses(
  enrollmentColumn: string,
  filters: Pick<RevenueTrendFilters, "courseId" | "academicYearId" | "academicTermId">
): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [];
  if (filters.courseId) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = ${Prisma.raw(enrollmentColumn)} AND e.courseId = ${filters.courseId} AND e.deletedAt IS NULL
    )`);
  }
  if (filters.academicYearId) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = ${Prisma.raw(enrollmentColumn)} AND e.academicYearId = ${filters.academicYearId} AND e.deletedAt IS NULL
    )`);
  }
  if (filters.academicTermId) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = ${Prisma.raw(enrollmentColumn)} AND e.academicTermId = ${filters.academicTermId} AND e.deletedAt IS NULL
    )`);
  }
  return clauses;
}

export interface RawInvoiceMonthRow {
  month: string;
  invoiced: number;
  collected: number;
  outstanding: number;
}

export interface RawRefundMonthRow {
  month: string;
  refunded: number;
}

// =============================================================================
// Invoiced / Collected / Outstanding — one GROUP BY query, bucketed by
// Invoice.issueDate (the billing-period view). Collected = Invoice.paidAmount,
// Outstanding = Invoice.balanceAmount, both for the SAME billing cohort —
// these are the "how much of what was billed in month M has been collected /
// still owed, as of today" figures, not a historical balance snapshot.
// =============================================================================

export async function getInvoiceMonthlyAggregates(filters: RevenueTrendFilters): Promise<RawInvoiceMonthRow[]> {
  const db = await getDb();
  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
    Prisma.sql`i.status <> 'CANCELLED'`,
    ...(filters.branchId ? [Prisma.sql`i.branchId = ${filters.branchId}`] : []),
    ...dateRangeClauses("i.issueDate", filters),
    ...enrollmentScopeClauses("i.enrollmentId", filters),
  ];

  const rows = await db.$queryRaw<Array<{ month: string; invoiced: number; collected: number; outstanding: number }>>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), i.issueDate, 120)          AS month,
      ISNULL(SUM(CAST(i.totalAmount AS FLOAT)), 0)   AS invoiced,
      ISNULL(SUM(CAST(i.paidAmount AS FLOAT)), 0)    AS collected,
      ISNULL(SUM(CAST(i.balanceAmount AS FLOAT)), 0) AS outstanding
    FROM invoices i
    WHERE ${Prisma.join(clauses, " AND ")}
    GROUP BY CONVERT(VARCHAR(7), i.issueDate, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => ({
    month: r.month,
    invoiced: num(r.invoiced),
    collected: num(r.collected),
    outstanding: num(r.outstanding),
  }));
}

// =============================================================================
// Refunded — bucketed by Refund.completedAt (the actual cash-effect date, not
// the request date), status = COMPLETED only (REQUESTED/APPROVED have not
// moved cash yet).
// =============================================================================

export async function getRefundMonthlyAggregates(filters: RevenueTrendFilters): Promise<RawRefundMonthRow[]> {
  const db = await getDb();
  const clauses: Prisma.Sql[] = [
    Prisma.sql`r.organizationId = ${filters.organizationId}`,
    Prisma.sql`r.deletedAt IS NULL`,
    Prisma.sql`r.status = 'COMPLETED'`,
    ...(filters.branchId ? [Prisma.sql`r.branchId = ${filters.branchId}`] : []),
    ...dateRangeClauses("r.completedAt", filters),
    ...enrollmentScopeClauses("r.enrollmentId", filters),
  ];

  const rows = await db.$queryRaw<Array<{ month: string; refunded: number }>>(Prisma.sql`
    SELECT
      CONVERT(VARCHAR(7), r.completedAt, 120)     AS month,
      ISNULL(SUM(CAST(r.amount AS FLOAT)), 0)     AS refunded
    FROM refunds r
    WHERE ${Prisma.join(clauses, " AND ")}
    GROUP BY CONVERT(VARCHAR(7), r.completedAt, 120)
    ORDER BY month ASC
  `);

  return rows.map((r) => ({ month: r.month, refunded: num(r.refunded) }));
}
