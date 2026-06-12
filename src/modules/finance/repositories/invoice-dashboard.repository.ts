import { getDb } from "@/server/db";
import type {
  InvoiceDashboardKPIs,
  InvoiceStatusDistribution,
  InvoiceCourseDistribution,
  InvoiceMonthlyTrend,
  InvoiceAgingBucket,
  InvoiceWatchlistItem,
} from "@/modules/finance/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// INVOICE DASHBOARD REPOSITORY — all queries scoped to organizationId
// =============================================================================

export async function getInvoiceDashboardKPIs(organizationId: string): Promise<InvoiceDashboardKPIs> {
  const db = await getDb();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const threeDaysLater = new Date(now.getTime() + 3 * 86_400_000);

  const [
    invoicedTodayAgg,
    invoicedThisMonthAgg,
    pendingAgg,
    overdueAgg,
    paidThisMonthAgg,
    partiallyPaidCount,
    noPaymentCount,
    cancelledCount,
    dueSoonCount,
    studentsWithMultiplePending,
  ] = await Promise.all([
    // Total invoiced today (non-cancelled)
    db.invoice.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        status: { not: "CANCELLED" },
        issueDate: { gte: todayStart, lt: tomorrowStart },
      },
      _sum: { totalAmount: true },
    }),
    // Total invoiced this month (non-cancelled)
    db.invoice.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        status: { not: "CANCELLED" },
        issueDate: { gte: monthStart },
      },
      _sum: { totalAmount: true },
    }),
    // Pending amount + count
    db.invoice.aggregate({
      where: { organizationId, deletedAt: null, status: "PENDING" },
      _count: { _all: true },
      _sum: { balanceAmount: true },
    }),
    // Overdue amount + count
    db.invoice.aggregate({
      where: { organizationId, deletedAt: null, status: "OVERDUE" },
      _count: { _all: true },
      _sum: { balanceAmount: true },
    }),
    // Paid this month (PAID invoices where updatedAt >= monthStart)
    db.invoice.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        status: "PAID",
        updatedAt: { gte: monthStart },
      },
      _sum: { paidAmount: true },
    }),
    // Partially paid count
    db.invoice.count({
      where: { organizationId, deletedAt: null, status: "PARTIALLY_PAID" },
    }),
    // No payment received (paidAmount = 0, not cancelled/paid)
    db.invoice.count({
      where: {
        organizationId,
        deletedAt: null,
        paidAmount: { equals: 0 },
        status: { notIn: ["CANCELLED", "PAID"] },
      },
    }),
    // Cancelled count
    db.invoice.count({
      where: { organizationId, deletedAt: null, status: "CANCELLED" },
    }),
    // Due soon (next 3 days, not paid/cancelled)
    db.invoice.count({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        dueDate: { gte: now, lte: threeDaysLater },
      },
    }),
    // Students with more than 1 pending/overdue invoice
    db.invoice.groupBy({
      by: ["studentId"],
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["PENDING", "OVERDUE", "PARTIALLY_PAID"] },
        studentId: { not: null },
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 1 } },
      },
    }),
  ]);

  return {
    invoicedToday: (invoicedTodayAgg._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
    invoicedThisMonth: (invoicedThisMonthAgg._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
    pendingCount: pendingAgg._count._all,
    pendingAmount: (pendingAgg._sum.balanceAmount as DecimalLike | null)?.toNumber() ?? 0,
    overdueCount: overdueAgg._count._all,
    overdueAmount: (overdueAgg._sum.balanceAmount as DecimalLike | null)?.toNumber() ?? 0,
    paidThisMonth: (paidThisMonthAgg._sum.paidAmount as DecimalLike | null)?.toNumber() ?? 0,
    partiallyPaidCount,
    noPaymentCount,
    cancelledCount,
    dueSoonCount,
    studentsWithMultiplePendingCount: studentsWithMultiplePending.length,
  };
}

export async function getInvoiceStatusDistribution(
  organizationId: string
): Promise<InvoiceStatusDistribution[]> {
  const db = await getDb();
  const rows = await db.invoice.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  return rows.map((r) => ({
    status: r.status,
    count: r._count._all,
    totalAmount: (r._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
  }));
}

export async function getInvoiceCourseDistribution(
  organizationId: string
): Promise<InvoiceCourseDistribution[]> {
  const db = await getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const rows = await db.invoice.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { not: "CANCELLED" },
      issueDate: { gte: monthStart },
    },
    select: {
      totalAmount: true,
      enrollment: {
        select: {
          course: { select: { id: true, name: true } },
        },
      },
    },
  });

  const map = new Map<string, { courseName: string; count: number; totalAmount: number }>();
  for (const row of rows) {
    const courseId = row.enrollment?.course?.id ?? "__none__";
    const courseName = row.enrollment?.course?.name ?? "Sem curso";
    const amount = (row.totalAmount as DecimalLike).toNumber();
    const existing = map.get(courseId);
    if (existing) {
      existing.count++;
      existing.totalAmount += amount;
    } else {
      map.set(courseId, { courseName, count: 1, totalAmount: amount });
    }
  }

  return Array.from(map.entries())
    .map(([courseId, v]) => ({
      courseId: courseId === "__none__" ? null : courseId,
      ...v,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 10);
}

export async function getInvoiceMonthlyTrend(
  organizationId: string,
  months = 6
): Promise<InvoiceMonthlyTrend[]> {
  const db = await getDb();
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const rows = await db.invoice.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { not: "CANCELLED" },
      issueDate: { gte: startDate },
    },
    select: { issueDate: true, totalAmount: true },
  });

  const map = new Map<string, { count: number; totalAmount: number }>();
  for (const row of rows) {
    const key = `${row.issueDate.getFullYear()}-${String(row.issueDate.getMonth() + 1).padStart(2, "0")}`;
    const amount = (row.totalAmount as DecimalLike).toNumber();
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      existing.totalAmount += amount;
    } else {
      map.set(key, { count: 1, totalAmount: amount });
    }
  }

  const result: InvoiceMonthlyTrend[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const data = map.get(key) ?? { count: 0, totalAmount: 0 };
    result.push({ month: key, ...data });
  }
  return result;
}

export async function getInvoiceAgingBuckets(
  organizationId: string
): Promise<InvoiceAgingBucket[]> {
  const db = await getDb();
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d15 = new Date(now.getTime() - 15 * 86_400_000);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);

  const overdueWhere = { organizationId, deletedAt: null, status: { notIn: ["CANCELLED", "PAID"] as string[] } };

  const [b1, b2, b3, b4] = await Promise.all([
    db.invoice.aggregate({
      where: { ...overdueWhere, dueDate: { gte: d7, lt: now } },
      _count: { _all: true },
      _sum: { balanceAmount: true },
    }),
    db.invoice.aggregate({
      where: { ...overdueWhere, dueDate: { gte: d15, lt: d7 } },
      _count: { _all: true },
      _sum: { balanceAmount: true },
    }),
    db.invoice.aggregate({
      where: { ...overdueWhere, dueDate: { gte: d30, lt: d15 } },
      _count: { _all: true },
      _sum: { balanceAmount: true },
    }),
    db.invoice.aggregate({
      where: { ...overdueWhere, dueDate: { lt: d30 } },
      _count: { _all: true },
      _sum: { balanceAmount: true },
    }),
  ]);

  return [
    {
      bucket: "1-7",
      label: "1–7 dias",
      count: b1._count._all,
      totalAmount: (b1._sum.balanceAmount as DecimalLike | null)?.toNumber() ?? 0,
    },
    {
      bucket: "8-15",
      label: "8–15 dias",
      count: b2._count._all,
      totalAmount: (b2._sum.balanceAmount as DecimalLike | null)?.toNumber() ?? 0,
    },
    {
      bucket: "16-30",
      label: "16–30 dias",
      count: b3._count._all,
      totalAmount: (b3._sum.balanceAmount as DecimalLike | null)?.toNumber() ?? 0,
    },
    {
      bucket: "31+",
      label: "31+ dias",
      count: b4._count._all,
      totalAmount: (b4._sum.balanceAmount as DecimalLike | null)?.toNumber() ?? 0,
    },
  ];
}

const watchlistSelect = {
  id: true,
  invoiceNumber: true,
  studentId: true,
  enrollmentId: true,
  totalAmount: true,
  balanceAmount: true,
  dueDate: true,
  paidAmount: true,
  student: { select: { firstName: true, lastName: true } },
  enrollment: { select: { enrollmentNumber: true } },
} as const;

type WatchlistRow = {
  id: string;
  invoiceNumber: string;
  studentId: string | null;
  enrollmentId: string | null;
  totalAmount: DecimalLike;
  balanceAmount: DecimalLike;
  paidAmount: DecimalLike;
  dueDate: Date | null;
  student: { firstName: string; lastName: string } | null;
  enrollment: { enrollmentNumber: string | null } | null;
};

function mapWatchlistRow(
  row: WatchlistRow,
  issue: string,
  severity: InvoiceWatchlistItem["severity"],
  recommendedAction: string
): InvoiceWatchlistItem {
  return {
    invoiceId: row.id,
    invoiceNumber: row.invoiceNumber,
    studentId: row.studentId,
    studentName: row.student ? `${row.student.firstName} ${row.student.lastName}` : null,
    enrollmentId: row.enrollmentId,
    enrollmentNumber: row.enrollment?.enrollmentNumber ?? null,
    totalAmount: row.totalAmount.toNumber(),
    balanceAmount: row.balanceAmount.toNumber(),
    dueDate: row.dueDate,
    issue,
    severity,
    recommendedAction,
  };
}

export async function findInvoiceWatchlist(
  organizationId: string
): Promise<InvoiceWatchlistItem[]> {
  const db = await getDb();
  const now = new Date();
  const threeDaysLater = new Date(now.getTime() + 3 * 86_400_000);

  const [overdue, noPayment, partiallyPaid, dueSoon, cancelledWithPayments] = await Promise.all([
    db.invoice.findMany({
      where: { organizationId, deletedAt: null, status: "OVERDUE" },
      select: watchlistSelect,
      orderBy: { dueDate: "asc" },
      take: 15,
    }),
    db.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        paidAmount: { equals: 0 },
        status: { notIn: ["CANCELLED", "PAID"] },
      },
      select: watchlistSelect,
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    db.invoice.findMany({
      where: { organizationId, deletedAt: null, status: "PARTIALLY_PAID" },
      select: watchlistSelect,
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    db.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        dueDate: { gte: now, lte: threeDaysLater },
      },
      select: watchlistSelect,
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    db.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "CANCELLED",
        paidAmount: { gt: 0 },
      },
      select: watchlistSelect,
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const seen = new Set<string>();
  const items: InvoiceWatchlistItem[] = [];

  for (const row of overdue) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const daysOverdue = row.dueDate
      ? Math.floor((now.getTime() - row.dueDate.getTime()) / 86_400_000)
      : 0;
    const severity: InvoiceWatchlistItem["severity"] =
      daysOverdue > 30 ? "critical" : daysOverdue > 15 ? "high" : "medium";
    items.push(
      mapWatchlistRow(
        row as WatchlistRow,
        `Em atraso há ${daysOverdue} dia${daysOverdue !== 1 ? "s" : ""}`,
        severity,
        "Registar pagamento ou enviar lembrete"
      )
    );
  }

  for (const row of dueSoon) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const daysUntil = row.dueDate
      ? Math.ceil((row.dueDate.getTime() - now.getTime()) / 86_400_000)
      : 0;
    items.push(
      mapWatchlistRow(
        row as WatchlistRow,
        `Vence em ${daysUntil} dia${daysUntil !== 1 ? "s" : ""}`,
        "medium",
        "Enviar lembrete de pagamento"
      )
    );
  }

  for (const row of noPayment) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    items.push(
      mapWatchlistRow(
        row as WatchlistRow,
        "Sem pagamento recebido",
        "high",
        "Registar pagamento ou confirmar junto do aluno"
      )
    );
  }

  for (const row of partiallyPaid) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    items.push(
      mapWatchlistRow(
        row as WatchlistRow,
        "Parcialmente paga",
        "low",
        "Registar pagamento do saldo restante"
      )
    );
  }

  for (const row of cancelledWithPayments) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    items.push(
      mapWatchlistRow(
        row as WatchlistRow,
        "Cancelada com pagamentos",
        "high",
        "Verificar reembolso ou crédito ao aluno"
      )
    );
  }

  return items;
}
