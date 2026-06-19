import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import type {
  AccountsReceivableFilters,
  AccountsReceivableKPIs,
  AccountsReceivableRow,
  AgingBucket,
} from "../types";

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
  const expr = SORT_EXPRESSIONS[sortBy];
  const dir = sortDir === "desc" ? "DESC" : "ASC";
  return Prisma.raw(`${expr} ${dir}`);
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

// ── Bucket value → SQL predicate ────────────────────────────────────────────
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
type ArWhereFilters = Pick<
  AccountsReceivableFilters,
  | "organizationId" | "branchId" | "courseId" | "studentId"
  | "dueDateFrom" | "dueDateTo" | "dateFrom" | "dateTo"
  | "academicYearId" | "academicTermId" | "invoiceStatus" | "agingBucket" | "search"
>;

function buildArWhere(filters: Partial<ArWhereFilters> & Pick<ArWhereFilters, "organizationId">): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.organizationId = ${filters.organizationId}`,
    Prisma.sql`i.deletedAt IS NULL`,
    Prisma.sql`CAST(i.balanceAmount AS FLOAT) > 0`,
  ];

  if (filters.invoiceStatus) {
    clauses.push(Prisma.sql`i.status = ${filters.invoiceStatus}`);
  } else {
    clauses.push(Prisma.sql`i.status NOT IN ('CANCELLED', 'PAID')`);
  }

  if (filters.studentId) clauses.push(Prisma.sql`i.studentId = ${filters.studentId}`);
  if (filters.branchId) clauses.push(Prisma.sql`i.branchId = ${filters.branchId}`);
  if (filters.dateFrom) clauses.push(Prisma.sql`i.issueDate >= ${new Date(filters.dateFrom)}`);
  if (filters.dateTo) clauses.push(Prisma.sql`i.issueDate <= ${new Date(filters.dateTo)}`);
  if (filters.dueDateFrom) clauses.push(Prisma.sql`i.dueDate >= ${new Date(filters.dueDateFrom)}`);
  if (filters.dueDateTo) clauses.push(Prisma.sql`i.dueDate <= ${new Date(filters.dueDateTo)}`);

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
interface RawArRow {
  id: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  studentId: string | null;
  branchId: string | null;
  enrollmentId: string | null;
  firstName: string | null;
  lastName: string | null;
  branchName: string | null;
  enrollmentNumber: string | null;
  courseId: string | null;
  courseName: string | null;
  daysOverdue: number;
  agingBucket: string;
}

interface RawArKpiRow {
  totalReceivable: number;
  overdueReceivable: number;
  dueSoon: number;
  partiallyPaid: number | bigint;
  studentsWithDebt: number | bigint;
  invoiceCount: number | bigint;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
export async function getAccountsReceivableKPIs(
  filters: Pick<
    AccountsReceivableFilters,
    "organizationId" | "branchId" | "courseId" | "studentId"
    | "dueDateFrom" | "dueDateTo" | "dateFrom" | "dateTo"
    | "academicYearId" | "academicTermId"
  >
): Promise<AccountsReceivableKPIs> {
  const db = await getDb();
  const whereFragment = buildArWhere(filters);

  const [kpiRow] = await db.$queryRaw<RawArKpiRow[]>(Prisma.sql`
    SELECT
      ISNULL(SUM(CAST(i.balanceAmount AS FLOAT)), 0)                                                  AS totalReceivable,
      ISNULL(SUM(CASE WHEN i.dueDate < GETDATE()
                      THEN CAST(i.balanceAmount AS FLOAT) ELSE 0 END), 0)                            AS overdueReceivable,
      ISNULL(SUM(CASE WHEN i.dueDate >= GETDATE() AND i.dueDate <= DATEADD(day, 7, GETDATE())
                      THEN CAST(i.balanceAmount AS FLOAT) ELSE 0 END), 0)                            AS dueSoon,
      COUNT(CASE WHEN i.status = 'PARTIALLY_PAID' THEN 1 END)                                        AS partiallyPaid,
      COUNT(DISTINCT i.studentId)                                                                     AS studentsWithDebt,
      COUNT(i.id)                                                                                     AS invoiceCount
    FROM invoices i
    LEFT JOIN students s ON s.id = i.studentId AND s.deletedAt IS NULL
    ${whereFragment}
  `);

  return {
    totalReceivable:   toNum(kpiRow?.totalReceivable),
    overdueReceivable: toNum(kpiRow?.overdueReceivable),
    dueSoon:           toNum(kpiRow?.dueSoon),
    partiallyPaid:     Number(kpiRow?.partiallyPaid ?? 0),
    studentsWithDebt:  Number(kpiRow?.studentsWithDebt ?? 0),
    invoiceCount:      Number(kpiRow?.invoiceCount ?? 0),
  };
}

// ── Paginated row list ────────────────────────────────────────────────────────
export async function listAccountsReceivable(
  filters: AccountsReceivableFilters
): Promise<{ rows: AccountsReceivableRow[]; total: number }> {
  const db = await getDb();
  const { page, pageSize } = filters;
  const skip = (page - 1) * pageSize;
  const whereFragment = buildArWhere(filters);
  const orderByExpr = resolveOrderBy(filters.sortBy, filters.sortDir);

  const [rawRows, countResult] = await Promise.all([
    db.$queryRaw<RawArRow[]>(Prisma.sql`
      SELECT
        i.id,
        i.invoiceNumber,
        i.issueDate,
        i.dueDate,
        CAST(i.totalAmount   AS FLOAT) AS totalAmount,
        CAST(i.paidAmount    AS FLOAT) AS paidAmount,
        CAST(i.balanceAmount AS FLOAT) AS balanceAmount,
        i.status,
        i.studentId,
        i.branchId,
        i.enrollmentId,
        s.firstName,
        s.lastName,
        b.name                         AS branchName,
        e.enrollmentNumber,
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

  const rows: AccountsReceivableRow[] = rawRows.map((r) => ({
    invoiceId:        r.id,
    invoiceNumber:    r.invoiceNumber,
    studentId:        r.studentId,
    studentName:      r.firstName ? `${r.firstName} ${r.lastName ?? ""}`.trim() : null,
    enrollmentId:     r.enrollmentId,
    enrollmentNumber: r.enrollmentNumber ?? null,
    courseId:         r.courseId ?? null,
    courseName:       r.courseName ?? null,
    branchId:         r.branchId,
    branchName:       r.branchName ?? null,
    issueDate:        r.issueDate,
    dueDate:          r.dueDate,
    totalAmount:      r.totalAmount,
    paidAmount:       r.paidAmount,
    balanceAmount:    r.balanceAmount,
    status:           r.status,
    daysOverdue:      r.daysOverdue,
    agingBucket:      r.agingBucket as AgingBucket,
  }));

  return { rows, total };
}
