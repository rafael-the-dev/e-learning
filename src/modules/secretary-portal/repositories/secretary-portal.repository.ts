import { getDb } from "@/server/db";
import type {
  PendingEnrollmentRow,
  AttentionInvoiceRow,
  DocumentReviewRow,
  RecentStudentRow,
  SecretaryDeadline,
} from "@/modules/secretary-portal/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// SECRETARY PORTAL REPOSITORY
// Every query is scoped to organizationId (tenant isolation) and bounded —
// counts/sums use SQL aggregation (count / groupBy / _sum), lists use take.
// No findMany without a `take`, no JS grouping over large row sets.
// =============================================================================

const PENDING_ENROLLMENT_STATUSES = ["DRAFT", "PENDING_PAYMENT"] as const;
const OPEN_INVOICE_EXCLUDED_STATUSES = ["CANCELLED", "PAID"] as const;
const PENDING_REFUND_STATUSES = ["REQUESTED", "APPROVED"] as const;
const ACTIVE_CLASS_GROUP_STATUSES = ["FORMING", "ACTIVE"] as const;
const UPCOMING_ASSESSMENT_STATUSES = ["DRAFT", "SCHEDULED", "OPEN"] as const;

// ─── KPI counts ─────────────────────────────────────────────────────────────────

export async function countPendingEnrollments(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: { organizationId, deletedAt: null, status: { in: [...PENDING_ENROLLMENT_STATUSES] } },
  });
}

export async function countActiveStudents(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.student.count({ where: { organizationId, deletedAt: null, status: "ACTIVE" } });
}

export async function countPendingPayments(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.payment.count({ where: { organizationId, status: "PENDING" } });
}

export async function countOverdueInvoices(organizationId: string, now: Date): Promise<number> {
  const db = await getDb();
  return db.invoice.count({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: [...OPEN_INVOICE_EXCLUDED_STATUSES] },
      balanceAmount: { gt: 0 },
      dueDate: { lt: now },
    },
  });
}

export async function countDocumentsPendingReview(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.studentDocument.count({ where: { organizationId, deletedAt: null, status: "PENDING" } });
}

export async function countFormingClassGroups(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.classGroup.count({ where: { organizationId, deletedAt: null, status: "FORMING" } });
}

// ─── Financial attention aggregates ──────────────────────────────────────────────

export async function aggregateOverdueInvoices(
  organizationId: string,
  now: Date
): Promise<{ count: number; amount: number }> {
  const db = await getDb();
  const result = await db.invoice.aggregate({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: [...OPEN_INVOICE_EXCLUDED_STATUSES] },
      balanceAmount: { gt: 0 },
      dueDate: { lt: now },
    },
    _count: { _all: true },
    _sum: { balanceAmount: true },
  });
  return {
    count: result._count._all,
    amount: (result._sum.balanceAmount as DecimalLike | null)?.toNumber() ?? 0,
  };
}

export async function aggregatePendingPayments(
  organizationId: string
): Promise<{ count: number; amount: number }> {
  const db = await getDb();
  const result = await db.payment.aggregate({
    where: { organizationId, status: "PENDING" },
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  return {
    count: result._count._all,
    amount: (result._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
  };
}

export async function aggregatePendingRefunds(
  organizationId: string
): Promise<{ count: number; amount: number }> {
  const db = await getDb();
  const result = await db.refund.aggregate({
    where: { organizationId, deletedAt: null, status: { in: [...PENDING_REFUND_STATUSES] } },
    _count: { _all: true },
    _sum: { amount: true },
  });
  return {
    count: result._count._all,
    amount: (result._sum.amount as DecimalLike | null)?.toNumber() ?? 0,
  };
}

// ─── Student administration counts ───────────────────────────────────────────────

export async function countActiveStudentsWithoutPortalAccount(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.student.count({
    where: { organizationId, deletedAt: null, status: "ACTIVE", userId: null },
  });
}

export async function countActiveStudentsMissingEmail(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.student.count({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      OR: [{ email: null }, { email: "" }],
    },
  });
}

export async function countInactiveStudentsWithActiveEnrollment(organizationId: string): Promise<number> {
  const db = await getDb();
  // Distinct students (status != ACTIVE) that still hold an ACTIVE enrollment.
  // COUNT(DISTINCT) in SQL — the database does the grouping and returns a single
  // scalar; no per-student rows are transferred to Node just to be counted.
  const rows = await db.$queryRaw<{ n: number | bigint }[]>`
    SELECT COUNT(DISTINCT e.studentId) AS n
    FROM enrollments e
    INNER JOIN students s ON s.id = e.studentId
    WHERE e.organizationId = ${organizationId}
      AND e.deletedAt IS NULL
      AND e.status = 'ACTIVE'
      AND s.deletedAt IS NULL
      AND s.status <> 'ACTIVE'`;
  return Number(rows[0]?.n ?? 0);
}

export async function countActiveEnrollmentsWithoutClassGroup(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: { organizationId, deletedAt: null, status: "ACTIVE", classGroupId: null },
  });
}

export async function countActiveEnrollmentsWithoutLevel(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: { organizationId, deletedAt: null, status: "ACTIVE", currentLevelId: null },
  });
}

export async function findActiveStudentsWithoutPortalAccount(
  organizationId: string,
  limit: number
): Promise<{ studentId: string; studentName: string; email: string | null }[]> {
  const db = await getDb();
  const rows = await db.student.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE", userId: null },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    studentId: r.id,
    studentName: `${r.firstName} ${r.lastName}`,
    email: r.email,
  }));
}

// ─── Operational queues (top-N) ──────────────────────────────────────────────────

export async function findPendingEnrollments(
  organizationId: string,
  limit: number
): Promise<PendingEnrollmentRow[]> {
  const db = await getDb();
  const rows = await db.enrollment.findMany({
    where: { organizationId, deletedAt: null, status: { in: [...PENDING_ENROLLMENT_STATUSES] } },
    select: {
      id: true,
      enrollmentNumber: true,
      status: true,
      createdAt: true,
      student: { select: { firstName: true, lastName: true } },
      course: { select: { name: true } },
      currentLevel: { select: { name: true } },
      classGroup: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" }, // oldest first — those that have waited longest need action
    take: limit,
  });
  return rows.map((r) => ({
    enrollmentId: r.id,
    studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : "—",
    enrollmentNumber: r.enrollmentNumber,
    courseName: r.course?.name ?? "—",
    levelName: r.currentLevel?.name ?? null,
    classGroupName: r.classGroup?.name ?? null,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

export async function findAttentionInvoices(
  organizationId: string,
  now: Date,
  limit: number
): Promise<AttentionInvoiceRow[]> {
  const db = await getDb();
  const rows = await db.invoice.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: [...OPEN_INVOICE_EXCLUDED_STATUSES] },
      balanceAmount: { gt: 0 },
      dueDate: { lt: now },
    },
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      balanceAmount: true,
      status: true,
      dueDate: true,
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { dueDate: "asc" }, // most overdue first
    take: limit,
  });
  return rows.map((r) => ({
    invoiceId: r.id,
    studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : "—",
    invoiceNumber: r.invoiceNumber,
    totalAmount: (r.totalAmount as DecimalLike).toNumber(),
    balanceAmount: (r.balanceAmount as DecimalLike).toNumber(),
    status: r.status,
    dueDate: r.dueDate,
  }));
}

export async function findDocumentsPendingReview(
  organizationId: string,
  now: Date,
  limit: number
): Promise<DocumentReviewRow[]> {
  const db = await getDb();
  const rows = await db.studentDocument.findMany({
    where: { organizationId, deletedAt: null, status: "PENDING" },
    select: {
      id: true,
      documentType: true,
      createdAt: true,
      studentId: true,
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" }, // oldest pending first
    take: limit,
  });
  return rows.map((r) => ({
    documentId: r.id,
    studentId: r.studentId,
    studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : "—",
    documentType: r.documentType,
    daysPending: Math.max(0, Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000)),
  }));
}

export async function findRecentStudents(
  organizationId: string,
  limit: number
): Promise<RecentStudentRow[]> {
  const db = await getDb();
  const rows = await db.student.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      createdAt: true,
      enrollments: {
        where: { deletedAt: null },
        select: { status: true, course: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => {
    const latest = r.enrollments[0];
    return {
      studentId: r.id,
      studentName: `${r.firstName} ${r.lastName}`,
      contact: r.email ?? r.phone ?? null,
      courseName: latest?.course?.name ?? null,
      enrollmentStatus: latest?.status ?? null,
      createdAt: r.createdAt,
    };
  });
}

// ─── Upcoming deadlines (next N days) ────────────────────────────────────────────

export async function findInvoicesDueSoon(
  organizationId: string,
  now: Date,
  until: Date,
  limit: number
): Promise<SecretaryDeadline[]> {
  const db = await getDb();
  const rows = await db.invoice.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: [...OPEN_INVOICE_EXCLUDED_STATUSES] },
      balanceAmount: { gt: 0 },
      dueDate: { gte: now, lte: until },
    },
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { dueDate: "asc" },
    take: limit,
  });
  return rows
    .filter((r): r is typeof r & { dueDate: Date } => r.dueDate != null)
    .map((r) => ({
      id: `invoice-${r.id}`,
      type: "INVOICE_DUE" as const,
      title: `${r.invoiceNumber}${r.student ? ` · ${r.student.firstName} ${r.student.lastName}` : ""}`,
      date: r.dueDate,
      link: `/invoices/${r.id}`,
    }));
}

export async function findClassGroupDeadlines(
  organizationId: string,
  now: Date,
  until: Date,
  limit: number
): Promise<SecretaryDeadline[]> {
  const db = await getDb();
  const rows = await db.classGroup.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: [...ACTIVE_CLASS_GROUP_STATUSES] },
      OR: [{ startDate: { gte: now, lte: until } }, { endDate: { gte: now, lte: until } }],
    },
    select: { id: true, name: true, startDate: true, endDate: true },
    take: limit,
  });
  const out: SecretaryDeadline[] = [];
  for (const r of rows) {
    if (r.startDate && r.startDate >= now && r.startDate <= until) {
      out.push({
        id: `cg-start-${r.id}`,
        type: "CLASS_GROUP_START",
        title: r.name,
        date: r.startDate,
        link: `/class-groups/${r.id}`,
      });
    }
    if (r.endDate && r.endDate >= now && r.endDate <= until) {
      out.push({
        id: `cg-end-${r.id}`,
        type: "CLASS_GROUP_END",
        title: r.name,
        date: r.endDate,
        link: `/class-groups/${r.id}`,
      });
    }
  }
  return out;
}

export async function findUpcomingAssessments(
  organizationId: string,
  now: Date,
  until: Date,
  limit: number
): Promise<SecretaryDeadline[]> {
  const db = await getDb();
  const rows = await db.assessment.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: [...UPCOMING_ASSESSMENT_STATUSES] },
      assessmentDate: { gte: now, lte: until },
    },
    select: { id: true, title: true, assessmentDate: true },
    orderBy: { assessmentDate: "asc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: `assessment-${r.id}`,
    type: "ASSESSMENT" as const,
    title: r.title,
    date: r.assessmentDate,
    link: `/assessments/${r.id}`,
  }));
}

export async function findUpcomingAcademicEvents(
  organizationId: string,
  now: Date,
  until: Date,
  limit: number
): Promise<SecretaryDeadline[]> {
  const db = await getDb();
  const rows = await db.academicEvent.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: ["CANCELLED", "ARCHIVED"] },
      startDate: { gte: now, lte: until },
    },
    select: { id: true, title: true, startDate: true },
    orderBy: { startDate: "asc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: `event-${r.id}`,
    type: "ACADEMIC_EVENT" as const,
    title: r.title,
    date: r.startDate,
    link: `/academic-calendar`,
  }));
}
