import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type { AgingBucket, AgingBucketSummary, AgingFilters, AgingKPIs, AgingRow } from "../types";
import { AGING_BUCKET_LABELS } from "../types";

// ── Numeric coercion ────────────────────────────────────────────────────────
type DecimalLike = { toNumber(): number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" && "toNumber" in v ? v.toNumber() : (v as number);
}

// ── Sort whitelist ───────────────────────────────────────────────────────────
const SORT_EXPRESSIONS: Record<string, string> = {
  dueDate: "i.dueDate",
  balanceAmount: "CAST(i.balanceAmount AS FLOAT)",
  daysOverdue: "CASE WHEN i.dueDate IS NULL OR i.dueDate >= GETDATE() THEN 0 ELSE DATEDIFF(day, i.dueDate, GETDATE()) END",
  studentName: "s.firstName",
  invoiceNumber: "i.invoiceNumber",
};

function resolveOrderBy(sortBy?: string, sortDir?: string): Prisma.Sql {
  if (!sortBy || !SORT_EXPRESSIONS[sortBy]) {
    return Prisma.raw("i.dueDate ASC, CAST(i.balanceAmount AS FLOAT) DESC");
  }
  const dir = sortDir === "desc" ? "DESC" : "ASC";
  return Prisma.raw(`${SORT_EXPRESSIONS[sortBy]} ${dir}`);
}

// ── Aging bucket SQL CASE expression ────────────────────────────────────────
const AGING_BUCKET_CASE = `
  CASE
    WHEN i.dueDate IS NULL THEN 'current'
    WHEN i.dueDate >= CAST(GETDATE() AS date) THEN 'current'
    WHEN DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 1 AND 30 THEN '1-30'
    WHEN DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 31 AND 60 THEN '31-60'
    WHEN DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END`;

// ── Bucket value → SQL predicate ─────────────────────────────────────────────
function agingBucketClause(bucket: string): Prisma.Sql {
  switch (bucket) {
    case "current":
      return Prisma.sql`(i.dueDate IS NULL OR i.dueDate >= CAST(GETDATE() AS date))`;
    case "1-30":
      return Prisma.sql`(i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 1 AND 30)`;
    case "31-60":
      return Prisma.sql`(i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 31 AND 60)`;
    case "61-90":
      return Prisma.sql`(i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 61 AND 90)`;
    case "90+":
      return Prisma.sql`(i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) > 90)`;
    default:
      return Prisma.sql`1=1`;
  }
}

// ── WHERE builder ────────────────────────────────────────────────────────────
type AgingWhereFilters = Pick<
  AgingFilters,
  | "organizationId" | "branchId" | "courseId" | "studentId"
  | "academicYearId" | "academicTermId" | "dateFrom" | "dateTo"
  | "agingBucket" | "search"
>;

function buildAgingWhere(filters: Partial<AgingWhereFilters> & Pick<AgingWhereFilters, "organizationId">): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
    Prisma.sql`i.status NOT IN ('CANCELLED', 'PAID')`,
    Prisma.sql`CAST(i.balanceAmount AS FLOAT) > 0`,
  ];

  if (filters.studentId) clauses.push(Prisma.sql`i.studentId = ${filters.studentId}`);
  if (filters.branchId)  clauses.push(Prisma.sql`i.branchId = ${filters.branchId}`);
  if (filters.dateFrom)  clauses.push(Prisma.sql`i.issueDate >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo)    clauses.push(Prisma.sql`i.issueDate <= ${new Date(filters.dateTo)}`);

  if (filters.courseId) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = i.enrollmentId AND e.courseId = ${filters.courseId} AND e.deletedAt IS NULL
    )`);
  }
  if (filters.academicYearId) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = i.enrollmentId AND e.academicYearId = ${filters.academicYearId} AND e.deletedAt IS NULL
    )`);
  }
  if (filters.academicTermId) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = i.enrollmentId AND e.academicTermId = ${filters.academicTermId} AND e.deletedAt IS NULL
    )`);
  }

  if (filters.agingBucket) {
    clauses.push(agingBucketClause(filters.agingBucket));
  }

  if (filters.search) {
    const escaped = filters.search.replace(/[%_[\]]/g, "\\$&");
    const term = `%${escaped}%`;
    clauses.push(Prisma.sql`(
      i.invoiceNumber LIKE ${term} ESCAPE '\\'
      OR s.firstName LIKE ${term} ESCAPE '\\'
      OR s.lastName  LIKE ${term} ESCAPE '\\'
    )`);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

// ── Raw row shapes ───────────────────────────────────────────────────────────
interface RawAgingKpiRow {
  totalOutstanding: number;
  currentTotal:     number;
  currentCount:     number | bigint;
  b1to30Total:      number;
  b1to30Count:      number | bigint;
  b31to60Total:     number;
  b31to60Count:     number | bigint;
  b61to90Total:     number;
  b61to90Count:     number | bigint;
  b90plusTotal:     number;
  b90plusCount:     number | bigint;
  invoiceCount:     number | bigint;
}

interface RawAgingRow {
  id: string;
  invoiceNumber: string;
  dueDate: Date | null;
  balanceAmount: number;
  studentId: string | null;
  branchId: string | null;
  firstName: string | null;
  lastName: string | null;
  branchName: string | null;
  courseId: string | null;
  courseName: string | null;
  daysOverdue: number;
  agingBucket: string;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
export async function getAgingKPIs(
  filters: Pick<AgingFilters, "organizationId" | "branchId" | "courseId" | "studentId" | "dateFrom" | "dateTo">
): Promise<{ kpis: AgingKPIs; buckets: AgingBucketSummary[] }> {
  const db = await getDb();
  const whereFragment = buildAgingWhere(filters);

  const [row] = await db.$queryRaw<RawAgingKpiRow[]>(Prisma.sql`
    SELECT
      ISNULL(SUM(CAST(i.balanceAmount AS FLOAT)), 0)    AS totalOutstanding,
      -- current
      ISNULL(SUM(CASE WHEN i.dueDate IS NULL OR i.dueDate >= CAST(GETDATE() AS date)
        THEN CAST(i.balanceAmount AS FLOAT) ELSE 0 END), 0)  AS currentTotal,
      COUNT(CASE WHEN i.dueDate IS NULL OR i.dueDate >= CAST(GETDATE() AS date) THEN 1 END) AS currentCount,
      -- 1–30
      ISNULL(SUM(CASE WHEN i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 1 AND 30
        THEN CAST(i.balanceAmount AS FLOAT) ELSE 0 END), 0)  AS b1to30Total,
      COUNT(CASE WHEN i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 1 AND 30 THEN 1 END) AS b1to30Count,
      -- 31–60
      ISNULL(SUM(CASE WHEN i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 31 AND 60
        THEN CAST(i.balanceAmount AS FLOAT) ELSE 0 END), 0)  AS b31to60Total,
      COUNT(CASE WHEN i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 31 AND 60 THEN 1 END) AS b31to60Count,
      -- 61–90
      ISNULL(SUM(CASE WHEN i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 61 AND 90
        THEN CAST(i.balanceAmount AS FLOAT) ELSE 0 END), 0)  AS b61to90Total,
      COUNT(CASE WHEN i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 61 AND 90 THEN 1 END) AS b61to90Count,
      -- 90+
      ISNULL(SUM(CASE WHEN i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) > 90
        THEN CAST(i.balanceAmount AS FLOAT) ELSE 0 END), 0)  AS b90plusTotal,
      COUNT(CASE WHEN i.dueDate IS NOT NULL AND DATEDIFF(day, i.dueDate, GETDATE()) > 90 THEN 1 END) AS b90plusCount,
      COUNT(i.id) AS invoiceCount
    FROM invoices i
    LEFT JOIN students s ON s.id = i.studentId AND s.deletedAt IS NULL
    ${whereFragment}
  `);

  const kpis: AgingKPIs = {
    totalOutstanding: toNum(row?.totalOutstanding),
    current:          toNum(row?.currentTotal),
    bucket1to30:      toNum(row?.b1to30Total),
    bucket31to60:     toNum(row?.b31to60Total),
    bucket61to90:     toNum(row?.b61to90Total),
    bucket90plus:     toNum(row?.b90plusTotal),
    invoiceCount:     Number(row?.invoiceCount ?? 0),
  };

  const ORDER: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];
  const buckets: AgingBucketSummary[] = ORDER.map((b) => {
    switch (b) {
      case "current":  return { bucket: b, label: AGING_BUCKET_LABELS[b], count: Number(row?.currentCount ?? 0), totalAmount: toNum(row?.currentTotal) };
      case "1-30":     return { bucket: b, label: AGING_BUCKET_LABELS[b], count: Number(row?.b1to30Count  ?? 0), totalAmount: toNum(row?.b1to30Total)  };
      case "31-60":    return { bucket: b, label: AGING_BUCKET_LABELS[b], count: Number(row?.b31to60Count ?? 0), totalAmount: toNum(row?.b31to60Total) };
      case "61-90":    return { bucket: b, label: AGING_BUCKET_LABELS[b], count: Number(row?.b61to90Count ?? 0), totalAmount: toNum(row?.b61to90Total) };
      case "90+":      return { bucket: b, label: AGING_BUCKET_LABELS[b], count: Number(row?.b90plusCount ?? 0), totalAmount: toNum(row?.b90plusTotal) };
    }
  });

  return { kpis, buckets };
}

// ── Paginated row list ────────────────────────────────────────────────────────
export async function listAgingRows(
  filters: AgingFilters
): Promise<{ rows: AgingRow[]; total: number }> {
  const db = await getDb();
  const { page, pageSize } = filters;
  const skip = (page - 1) * pageSize;
  const whereFragment = buildAgingWhere(filters);
  const orderByExpr = resolveOrderBy(filters.sortBy, filters.sortDir);

  const [rawRows, countResult] = await Promise.all([
    db.$queryRaw<RawAgingRow[]>(Prisma.sql`
      SELECT
        i.id,
        i.invoiceNumber,
        i.dueDate,
        CAST(i.balanceAmount AS FLOAT) AS balanceAmount,
        i.studentId,
        i.branchId,
        s.firstName,
        s.lastName,
        b.name                         AS branchName,
        c.id                           AS courseId,
        c.name                         AS courseName,
        CASE
          WHEN i.dueDate IS NULL OR i.dueDate >= GETDATE() THEN 0
          ELSE DATEDIFF(day, i.dueDate, GETDATE())
        END                            AS daysOverdue,
        ${Prisma.raw(AGING_BUCKET_CASE)} AS agingBucket
      FROM invoices i
      LEFT JOIN students    s ON s.id = i.studentId    AND s.deletedAt IS NULL
      LEFT JOIN branches    b ON b.id = i.branchId
      LEFT JOIN enrollments e ON e.id = i.enrollmentId AND e.deletedAt IS NULL
      LEFT JOIN courses     c ON c.id = e.courseId
      ${whereFragment}
      ORDER BY ${orderByExpr}
      OFFSET ${skip} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `),
    db.$queryRaw<[{ total: bigint }]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM invoices i
      LEFT JOIN students s ON s.id = i.studentId AND s.deletedAt IS NULL
      ${whereFragment}
    `),
  ]);

  const total = Number(countResult[0]?.total ?? 0);

  const rows: AgingRow[] = rawRows.map((r) => ({
    invoiceId:    r.id,
    invoiceNumber: r.invoiceNumber,
    studentId:    r.studentId,
    studentName:  r.firstName ? `${r.firstName} ${r.lastName ?? ""}`.trim() : null,
    courseId:     r.courseId ?? null,
    courseName:   r.courseName ?? null,
    branchId:     r.branchId,
    branchName:   r.branchName ?? null,
    dueDate:      r.dueDate,
    balanceAmount: r.balanceAmount,
    daysOverdue:  r.daysOverdue,
    agingBucket:  r.agingBucket as AgingBucket,
  }));

  return { rows, total };
}
