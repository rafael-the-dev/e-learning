import type { Prisma } from "@prisma/client";

// =============================================================================
// CANONICAL FINANCIAL "OVERDUE" / "OUTSTANDING" SEMANTICS (F-M1)
//
// The single source of truth for what "outstanding" and "overdue" mean, so the
// student finance summary, the risk engine (via the summary), the daily-billing job
// and any dashboard agree on the SAME definition — regardless of whether the
// operational OVERDUE status has been materialized yet.
//
// Overdue is a FINANCIAL FACT, not merely the materialized status:
//     open invoice (PENDING | PARTIALLY_PAID | OVERDUE)
//   AND balanceAmount > 0            (only the still-owed balance counts)
//   AND dueDate < boundary           (past due, at the org's day boundary + grace)
// So an invoice is overdue the moment its due date passes, even before the daily job
// flips its status; and an OVERDUE-status invoice that has since been paid to a zero
// balance is NOT overdue even if the status hasn't been normalized yet.
// =============================================================================

/** Invoice statuses that still carry a claim (an unpaid/partly-paid balance). */
export const OPEN_INVOICE_STATUSES = ["PENDING", "PARTIALLY_PAID", "OVERDUE"] as const;

/**
 * The overdue day boundary for an org: the start of "today" in the org's timezone, minus the
 * configured grace days. `dueDate < boundary` ⇒ overdue. With graceDays = 0 an invoice due
 * today is NOT yet overdue (it becomes overdue at the start of the next local day). This is
 * the SAME computation the daily-billing job uses, so the summary/risk and the job never
 * disagree on the window.
 */
export function resolveOverdueBoundary(params: {
  timezone: string;
  graceDays: number;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();
  let year: number;
  let month: number;
  let day: number;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: params.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
    month = Number(parts.find((p) => p.type === "month")?.value ?? 1) - 1;
    day = Number(parts.find((p) => p.type === "day")?.value ?? 1);
  } catch {
    year = now.getUTCFullYear();
    month = now.getUTCMonth();
    day = now.getUTCDate();
  }
  const todayMidnightUtc = new Date(Date.UTC(year, month, day));
  return new Date(todayMidnightUtc.getTime() - params.graceDays * 24 * 60 * 60 * 1000);
}

/** Validate an IANA timezone; fall back to UTC with a warning (never throws). */
export function resolveInvoiceTimezone(rawTimezone: string | null | undefined): {
  timezone: string;
  warning?: string;
} {
  const tz = rawTimezone ?? "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return { timezone: tz };
  } catch {
    return { timezone: "UTC", warning: `Fuso horário inválido "${tz}" — fallback para UTC` };
  }
}

/** Where-clause for OUTSTANDING invoices: open status + still-owed balance (org/student scoped). */
export function buildOutstandingInvoiceWhere(params: {
  organizationId: string;
  studentId?: string;
}): Prisma.InvoiceWhereInput {
  return {
    organizationId: params.organizationId,
    ...(params.studentId ? { studentId: params.studentId } : {}),
    deletedAt: null,
    status: { in: [...OPEN_INVOICE_STATUSES] },
    balanceAmount: { gt: 0 },
  };
}

/** Where-clause for OVERDUE invoices: outstanding AND past the boundary. */
export function buildOverdueInvoiceWhere(params: {
  organizationId: string;
  studentId?: string;
  boundary: Date;
}): Prisma.InvoiceWhereInput {
  return {
    ...buildOutstandingInvoiceWhere({ organizationId: params.organizationId, studentId: params.studentId }),
    dueDate: { lt: params.boundary },
  };
}
