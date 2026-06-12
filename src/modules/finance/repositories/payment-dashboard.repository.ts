import { getDb } from "@/server/db";
import type {
  PaymentDashboardKPIs,
  PaymentMethodDistribution,
  PaymentStatusDistribution,
  PaymentMonthlyTrend,
  PaymentBranchDistribution,
  PaymentWatchlistItem,
} from "@/modules/finance/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// PAYMENT DASHBOARD REPOSITORY — all queries scoped to organizationId
// =============================================================================

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────

export async function getPaymentDashboardKPIs(organizationId: string): Promise<PaymentDashboardKPIs> {
  const db = await getDb();
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const monthStart = startOfMonth(now);

  const [
    todayAgg,
    monthAgg,
    pendingAgg,
    confirmedAgg,
    cancelledCount,
    requireReceiptCount,
    overpaymentCount,
    walletCreditAgg,
  ] = await Promise.all([
    db.payment.aggregate({
      where: {
        organizationId,
        status: "CONFIRMED",
        paymentDate: { gte: todayStart, lt: tomorrowStart },
      },
      _sum: { totalAmount: true },
    }),
    db.payment.aggregate({
      where: { organizationId, status: "CONFIRMED", paymentDate: { gte: monthStart } },
      _sum: { totalAmount: true },
    }),
    db.payment.aggregate({
      where: { organizationId, status: "PENDING" },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    db.payment.aggregate({
      where: { organizationId, status: "CONFIRMED" },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    db.payment.count({ where: { organizationId, status: "CANCELLED" } }),
    // Confirmed with no receipt (receipt field is null → never issued)
    db.payment.count({
      where: { organizationId, status: "CONFIRMED", receipt: null },
    }),
    // Confirmed with WALLET_CREDIT allocations (overpayment created wallet credit)
    db.payment.count({
      where: {
        organizationId,
        status: "CONFIRMED",
        allocations: { some: { allocationType: "WALLET_CREDIT" } },
      },
    }),
    // Wallet credit applied this month (WALLET_CREDIT allocations = credit drawn from wallet)
    db.paymentAllocation.aggregate({
      where: {
        organizationId,
        allocationType: "WALLET_CREDIT",
        createdAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    receivedToday: (todayAgg._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
    receivedThisMonth: (monthAgg._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
    pendingCount: pendingAgg._count._all,
    pendingAmount: (pendingAgg._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
    confirmedCount: confirmedAgg._count._all,
    confirmedAmount: (confirmedAgg._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
    cancelledCount,
    requireReceiptCount,
    overpaymentCount,
    walletCreditUsed: (walletCreditAgg._sum.amount as DecimalLike | null)?.toNumber() ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DISTRIBUTIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function getPaymentStatusDistribution(
  organizationId: string
): Promise<PaymentStatusDistribution[]> {
  const db = await getDb();
  const rows = await db.payment.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
    _sum: { totalAmount: true },
    orderBy: { _count: { status: "desc" } },
  });
  return rows.map((r) => ({
    status: r.status,
    count: r._count._all,
    totalAmount: (r._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
  }));
}

export async function getPaymentMethodDistribution(
  organizationId: string
): Promise<PaymentMethodDistribution[]> {
  const db = await getDb();
  const rows = await db.paymentSplit.groupBy({
    by: ["method"],
    where: { organizationId },
    _count: { _all: true },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });
  return rows.map((r) => ({
    method: r.method,
    count: r._count._all,
    totalAmount: (r._sum.amount as DecimalLike | null)?.toNumber() ?? 0,
  }));
}

export async function getPaymentMonthlyTrend(
  organizationId: string,
  months = 6
): Promise<PaymentMonthlyTrend[]> {
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  cutoff.setDate(1);
  cutoff.setHours(0, 0, 0, 0);

  const rows = await db.payment.findMany({
    where: { organizationId, status: "CONFIRMED", paymentDate: { gte: cutoff } },
    select: { paymentDate: true, totalAmount: true },
    orderBy: { paymentDate: "asc" },
  });

  const map = new Map<string, { count: number; totalAmount: number }>();
  for (const row of rows) {
    const key = `${row.paymentDate.getFullYear()}-${String(row.paymentDate.getMonth() + 1).padStart(2, "0")}`;
    const existing = map.get(key) ?? { count: 0, totalAmount: 0 };
    map.set(key, {
      count: existing.count + 1,
      totalAmount: existing.totalAmount + (row.totalAmount as DecimalLike).toNumber(),
    });
  }

  return Array.from(map.entries()).map(([month, data]) => ({
    month,
    count: data.count,
    totalAmount: data.totalAmount,
  }));
}

export async function getPaymentBranchDistribution(
  organizationId: string
): Promise<PaymentBranchDistribution[]> {
  const db = await getDb();
  const [rows, branches] = await Promise.all([
    db.payment.groupBy({
      by: ["branchId"],
      where: { organizationId },
      _count: { _all: true },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
    }),
    db.branch.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ]);

  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  return rows.map((r) => ({
    branchId: r.branchId,
    branchName: r.branchId ? (branchMap.get(r.branchId) ?? "Filial Desconhecida") : "Sem Filial",
    count: r._count._all,
    totalAmount: (r._sum.totalAmount as DecimalLike | null)?.toNumber() ?? 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// WATCHLIST
// ─────────────────────────────────────────────────────────────────────────────

export async function findPaymentWatchlist(
  organizationId: string,
  limit = 20
): Promise<PaymentWatchlistItem[]> {
  const db = await getDb();

  const baseSelect = {
    id: true,
    paymentNumber: true,
    studentId: true,
    invoiceId: true,
    totalAmount: true,
    paymentDate: true,
    student: { select: { id: true, firstName: true, lastName: true } },
    invoice: { select: { id: true, invoiceNumber: true } },
  } as const;

  type BaseRow = {
    id: string;
    paymentNumber: string;
    studentId: string | null;
    invoiceId: string | null;
    totalAmount: DecimalLike;
    paymentDate: Date;
    student: { id: string; firstName: string; lastName: string } | null;
    invoice: { id: string; invoiceNumber: string } | null;
  };

  function toBase(
    row: BaseRow
  ): Omit<PaymentWatchlistItem, "issue" | "severity" | "recommendedAction"> {
    return {
      paymentId: row.id,
      paymentNumber: row.paymentNumber,
      studentId: row.studentId,
      studentName: row.student
        ? `${row.student.firstName} ${row.student.lastName}`
        : null,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoice?.invoiceNumber ?? null,
      amount: row.totalAmount.toNumber(),
      paymentDate: row.paymentDate,
    };
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [pending, missingReceipt, overpayments, recentCancelled] = await Promise.all([
    // Critical: pending confirmation
    db.payment.findMany({
      where: { organizationId, status: "PENDING" },
      select: baseSelect,
      orderBy: { paymentDate: "asc" },
      take: limit,
    }),
    // High: confirmed but no receipt
    db.payment.findMany({
      where: { organizationId, status: "CONFIRMED", receipt: null },
      select: baseSelect,
      orderBy: { paymentDate: "asc" },
      take: limit,
    }),
    // Medium: confirmed with overpayment → wallet credit
    db.payment.findMany({
      where: {
        organizationId,
        status: "CONFIRMED",
        allocations: { some: { allocationType: "WALLET_CREDIT" } },
      },
      select: baseSelect,
      orderBy: { paymentDate: "desc" },
      take: limit,
    }),
    // Low: recently cancelled
    db.payment.findMany({
      where: { organizationId, status: "CANCELLED", updatedAt: { gte: sevenDaysAgo } },
      select: baseSelect,
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
  ]);

  const items: PaymentWatchlistItem[] = [];
  const seen = new Set<string>();

  function add(
    row: BaseRow,
    issue: string,
    severity: PaymentWatchlistItem["severity"],
    recommendedAction: string
  ) {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    items.push({ ...toBase(row), issue, severity, recommendedAction });
  }

  for (const row of pending) {
    add(row, "Aguarda confirmação", "critical", "Confirmar pagamento");
  }
  for (const row of missingReceipt) {
    add(row, "Sem recibo emitido", "high", "Emitir recibo");
  }
  for (const row of overpayments) {
    add(row, "Gerou crédito na carteira", "medium", "Verificar carteira do aluno");
  }
  for (const row of recentCancelled) {
    add(row, "Cancelado recentemente", "low", "Verificar motivo do cancelamento");
  }

  return items.slice(0, limit);
}
