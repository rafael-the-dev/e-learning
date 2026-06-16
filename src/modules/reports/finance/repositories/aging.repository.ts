import { getDb } from "@/server/db";
import type { AgingBucket, AgingBucketSummary, AgingFilters, AgingKPIs, AgingRow } from "../types";
import { AGING_BUCKET_LABELS } from "../types";
import { calcDaysOverdue, calcAgingBucket, aggregateAgingBuckets } from "../utils/aging-calc";

type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

export async function getAgingKPIs(
  filters: Pick<AgingFilters, "organizationId" | "branchId" | "courseId" | "studentId" | "dateFrom" | "dateTo">
): Promise<{ kpis: AgingKPIs; buckets: AgingBucketSummary[] }> {
  const db = await getDb();
  const today = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    balanceAmount: { gt: 0 },
    status: { notIn: ["CANCELLED", "PAID"] },
    deletedAt: null,
  };
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.dateFrom || filters.dateTo) {
    where.issueDate = {};
    if (filters.dateFrom) where.issueDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.issueDate.lte = new Date(filters.dateTo);
  }

  const rows = await db.invoice.findMany({
    where,
    select: { balanceAmount: true, dueDate: true },
  });

  const numericRows = rows.map((r) => ({
    balanceAmount: toNum(r.balanceAmount as DecimalLike),
    dueDate: r.dueDate,
  }));
  const { bucketMap, totalOutstanding } = aggregateAgingBuckets(numericRows, today);

  const kpis: AgingKPIs = {
    totalOutstanding,
    current:      bucketMap["current"].total,
    bucket1to30:  bucketMap["1-30"].total,
    bucket31to60: bucketMap["31-60"].total,
    bucket61to90: bucketMap["61-90"].total,
    bucket90plus: bucketMap["90+"].total,
    invoiceCount: rows.length,
  };

  const ORDER: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];
  const buckets: AgingBucketSummary[] = ORDER.map((b) => ({
    bucket: b,
    label: AGING_BUCKET_LABELS[b],
    count: bucketMap[b].count,
    totalAmount: bucketMap[b].total,
  }));

  return { kpis, buckets };
}

export async function listAgingRows(
  filters: AgingFilters
): Promise<{ rows: AgingRow[]; total: number }> {
  const db = await getDb();
  const today = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    organizationId: filters.organizationId,
    balanceAmount: { gt: 0 },
    status: { notIn: ["CANCELLED", "PAID"] },
    deletedAt: null,
  };
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.dateFrom || filters.dateTo) {
    where.issueDate = {};
    if (filters.dateFrom) where.issueDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.issueDate.lte = new Date(filters.dateTo);
  }
  if (filters.search) {
    where.OR = [
      { invoiceNumber: { contains: filters.search } },
      { student: { firstName: { contains: filters.search } } },
      { student: { lastName: { contains: filters.search } } },
    ];
  }

  const allRows = await db.invoice.findMany({
    where,
    orderBy: [{ dueDate: "asc" }],
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      balanceAmount: true,
      studentId: true,
      branchId: true,
      student: { select: { firstName: true, lastName: true } },
      branch: { select: { name: true } },
      enrollment: {
        select: {
          course: { select: { id: true, name: true } },
        },
      },
    },
  });

  const mapped: AgingRow[] = allRows.map((r) => ({
    invoiceId: r.id,
    invoiceNumber: r.invoiceNumber,
    studentId: r.studentId,
    studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : null,
    courseId: r.enrollment?.course?.id ?? null,
    courseName: r.enrollment?.course?.name ?? null,
    branchId: r.branchId,
    branchName: r.branch?.name ?? null,
    dueDate: r.dueDate,
    balanceAmount: toNum(r.balanceAmount as DecimalLike),
    daysOverdue: calcDaysOverdue(r.dueDate, today),
    agingBucket: calcAgingBucket(r.dueDate, today),
  }));

  const filtered = filters.agingBucket
    ? mapped.filter((r) => r.agingBucket === filters.agingBucket)
    : mapped;

  const total = filtered.length;
  const skip = (filters.page - 1) * filters.pageSize;
  const rows = filtered.slice(skip, skip + filters.pageSize);

  return { rows, total };
}
