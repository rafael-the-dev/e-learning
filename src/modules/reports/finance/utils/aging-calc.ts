import type { AgingBucket } from "../types";

export function calcDaysOverdue(dueDate: Date | null, today: Date): number {
  if (!dueDate) return 0;
  return Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
}

export function calcAgingBucket(dueDate: Date | null, today: Date): AgingBucket {
  if (!dueDate) return "current";
  const d = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
  if (d <= 0) return "current";
  if (d <= 30) return "1-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}

export function aggregateAgingBuckets(
  rows: Array<{ balanceAmount: number; dueDate: Date | null }>,
  today: Date
) {
  const bucketMap = {
    current: { count: 0, total: 0 },
    "1-30":  { count: 0, total: 0 },
    "31-60": { count: 0, total: 0 },
    "61-90": { count: 0, total: 0 },
    "90+":   { count: 0, total: 0 },
  } as Record<AgingBucket, { count: number; total: number }>;

  let totalOutstanding = 0;

  for (const r of rows) {
    const bucket = calcAgingBucket(r.dueDate, today);
    bucketMap[bucket].count++;
    bucketMap[bucket].total += r.balanceAmount;
    totalOutstanding += r.balanceAmount;
  }

  return { bucketMap, totalOutstanding };
}

export function aggregatePaymentsKPIs(
  payments: Array<{
    totalAmount: number;
    splits: Array<{ method: string; amount: number }>;
    refunds: Array<{ amount: number }>;
    paymentDate: Date;
  }>
) {
  let totalReceived = 0;
  let cashReceived = 0;
  let mobileMoneyReceived = 0;
  let bankTransferReceived = 0;
  let refundedTotal = 0;

  const methodMap = new Map<string, { count: number; total: number }>();
  const monthMap = new Map<string, { count: number; total: number }>();

  for (const p of payments) {
    const gross = p.totalAmount;
    const refunded = p.refunds.reduce((s, r) => s + r.amount, 0);

    totalReceived += gross;
    refundedTotal += refunded;

    for (const split of p.splits) {
      const amt = split.amount;
      const m = split.method;

      if (m === "CASH") cashReceived += amt;
      else if (m === "MPESA" || m === "EMOLA") mobileMoneyReceived += amt;
      else if (m === "BANK_TRANSFER") bankTransferReceived += amt;

      const existing = methodMap.get(m) ?? { count: 0, total: 0 };
      existing.count++;
      existing.total += amt;
      methodMap.set(m, existing);
    }

    const monthKey = `${p.paymentDate.getFullYear()}-${String(p.paymentDate.getMonth() + 1).padStart(2, "0")}`;
    const monthEntry = monthMap.get(monthKey) ?? { count: 0, total: 0 };
    monthEntry.count++;
    monthEntry.total += gross;
    monthMap.set(monthKey, monthEntry);
  }

  return {
    totalReceived,
    paymentsCount: payments.length,
    averagePayment: payments.length > 0 ? totalReceived / payments.length : 0,
    cashReceived,
    mobileMoneyReceived,
    bankTransferReceived,
    refundedTotal,
    netReceived: totalReceived - refundedTotal,
    methodMap,
    monthMap,
  };
}
