import { randomUUID } from "crypto";
import { getDb } from "@/server/db";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import {
  resolveOverdueBoundary,
  resolveInvoiceTimezone,
} from "@/modules/reports/finance/student-finance-semantics";

// =============================================================================
// TYPES
// =============================================================================

interface OrgBillingSettings {
  organizationId: string;
  timezone: string;
  overdueGraceDays: number;
  markInvoiceOverdueWhenAnyInstallmentOverdue: boolean;
}

export interface DailyBillingJobResult {
  jobRunId: string;
  startedAt: Date;
  completedAt: Date;
  organizationsProcessed: number;
  organizationsSkipped: number;
  totalInvoicesMarkedOverdue: number;
  totalInstallmentsMarkedOverdue: number;
  errors: Array<{ organizationId: string; error: string }>;
  /** Organizations where an invalid timezone was detected and UTC was used instead. */
  timezoneWarnings: Array<{ organizationId: string; warning: string }>;
}

export interface RunDailyBillingJobOptions {
  /** Restrict processing to a single organization (dev / manual trigger). */
  organizationId?: string;
}

const INSTALLMENT_INVOICE_BATCH_SIZE = 500;

// =============================================================================
// DATE HELPERS
// =============================================================================

/**
 * Returns the overdue cutoff date for a given timezone and grace period.
 *
 * Timezone handling: today's calendar date is resolved in the organization's
 * IANA timezone (e.g. "Africa/Maputo"), then interpreted as UTC midnight so
 * that the cutoff aligns with the organization's local business day.
 *
 * Grace days: a value of 0 means "mark as overdue on the first day after
 * the due date". dueDate < cutoff satisfies: dueDate = yesterday → overdue. ✓
 * With graceDays = 5: items due 3 days ago are NOT yet overdue.            ✓
 *
 * Callers should validate the timezone with resolveTimezone() before calling
 * this function so that configuration issues surface as warnings in the result.
 * The internal try/catch acts only as a last-resort safety net.
 */
// F-M1: the overdue boundary + timezone resolution are the CANONICAL shared helpers
// (student-finance-semantics) so the daily job and the finance summary/risk use one window.
// These thin re-exports preserve the job's public API (and existing tests).
export function getCutoffDate(timezone: string, graceDays: number): Date {
  return resolveOverdueBoundary({ timezone, graceDays });
}

export function resolveTimezone(rawTimezone: string | null | undefined): {
  timezone: string;
  warning?: string;
} {
  return resolveInvoiceTimezone(rawTimezone);
}

// =============================================================================
// OVERDUE PROCESSING PER ORG
// =============================================================================

async function processOrganization(
  db: Awaited<ReturnType<typeof getDb>>,
  settings: OrgBillingSettings,
  runStartedAt: Date
): Promise<{ invoicesMarkedOverdue: number; installmentsMarkedOverdue: number; affectedStudentIds: string[] }> {
  const { organizationId, timezone, overdueGraceDays, markInvoiceOverdueWhenAnyInstallmentOverdue } =
    settings;

  const cutoff = getCutoffDate(timezone, overdueGraceDays);

  // ── Step 1: Mark installments OVERDUE ──────────────────────────────────────
  // Single updateMany — no records loaded into memory.
  const instResult = await db.installment.updateMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
      balanceAmount: { gt: 0 },
      dueDate: { lt: cutoff },
    },
    data: { status: "OVERDUE" },
  });

  // ── Step 2a: Mark invoices OVERDUE via their own dueDate ───────────────────
  // Only for invoices without a payment plan — those are governed by the
  // installment route (step 2b).
  const invDirectResult = await db.invoice.updateMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
      balanceAmount: { gt: 0 },
      dueDate: { lt: cutoff },
      deletedAt: null,
      paymentPlan: null,
    },
    data: { status: "OVERDUE" },
  });

  // ── Step 2b: Mark invoices OVERDUE when any linked installment is OVERDUE ──
  // Batch IDs to avoid unbounded IN lists on SQL Server.
  let invFromInstallmentsCount = 0;
  if (markInvoiceOverdueWhenAnyInstallmentOverdue) {
    const overdueInstallmentRows = await db.installment.findMany({
      where: { organizationId, status: "OVERDUE" },
      select: { invoiceId: true },
      distinct: ["invoiceId"],
    });

    const invoiceIds = overdueInstallmentRows.map((r) => r.invoiceId);

    for (let i = 0; i < invoiceIds.length; i += INSTALLMENT_INVOICE_BATCH_SIZE) {
      const batch = invoiceIds.slice(i, i + INSTALLMENT_INVOICE_BATCH_SIZE);
      const r = await db.invoice.updateMany({
        where: {
          id: { in: batch },
          organizationId,
          status: { in: ["PENDING", "PARTIALLY_PAID"] },
          balanceAmount: { gt: 0 },
          deletedAt: null,
        },
        data: { status: "OVERDUE" },
      });
      invFromInstallmentsCount += r.count;
    }
  }

  // F-H3: the students whose invoices were marked OVERDUE by THIS run (updatedAt bumped by
  // the updateMany calls above, at/after runStartedAt) — the DELTA that newly went overdue,
  // not the whole overdue population. Distinct, org-scoped; emitted as INVOICE_OVERDUE per
  // student so the risk projection refreshes without waiting for the daily reconcile.
  const affectedRows =
    invDirectResult.count + invFromInstallmentsCount > 0
      ? await db.invoice.findMany({
          where: {
            organizationId,
            status: "OVERDUE",
            deletedAt: null,
            studentId: { not: null },
            updatedAt: { gte: runStartedAt },
          },
          select: { studentId: true },
          distinct: ["studentId"],
        })
      : [];

  return {
    invoicesMarkedOverdue: invDirectResult.count + invFromInstallmentsCount,
    installmentsMarkedOverdue: instResult.count,
    affectedStudentIds: affectedRows.map((r) => r.studentId).filter((id): id is string => id !== null),
  };
}

// =============================================================================
// JOB ENTRY POINT
// =============================================================================

export async function runDailyBillingJob(
  options?: RunDailyBillingJobOptions
): Promise<DailyBillingJobResult> {
  const jobRunId = randomUUID();
  const startedAt = new Date();

  const errors: Array<{ organizationId: string; error: string }> = [];
  const timezoneWarnings: Array<{ organizationId: string; warning: string }> = [];
  let totalInvoices = 0;
  let totalInstallments = 0;
  let processed = 0;
  let skipped = 0;

  const db = await getDb();

  const orgs = await db.organization.findMany({
    where: {
      // Optional single-org filter for dev/manual trigger; omit for full run.
      ...(options?.organizationId ? { id: options.organizationId } : {}),
      // SUSPENDED organizations are excluded: their billing is frozen until
      // the account is reinstated. CANCELLED organizations are never processed.
      status: { notIn: ["CANCELLED", "SUSPENDED"] },
      deletedAt: null,
    },
    select: {
      id: true,
      timezone: true,
      settings: {
        select: {
          enableAutomaticOverdueProcessing: true,
          overdueGraceDays: true,
          markInvoiceOverdueWhenAnyInstallmentOverdue: true,
          notifyOnOverdue: true,
          overdueNotificationDelayDays: true,
        },
      },
    },
  });

  for (const org of orgs) {
    const s = org.settings;
    const enabled = s?.enableAutomaticOverdueProcessing ?? true;

    if (!enabled) {
      skipped++;
      continue;
    }

    // Validate timezone before computing the cutoff. resolveTimezone() never
    // throws; an invalid value becomes "UTC" and produces a warning.
    const { timezone, warning: tzWarning } = resolveTimezone(org.timezone);
    if (tzWarning) {
      timezoneWarnings.push({ organizationId: org.id, warning: tzWarning });
      console.warn(`[DailyBillingJob] ${tzWarning} (organizationId: ${org.id})`);
    }

    try {
      const result = await processOrganization(db, {
        organizationId: org.id,
        timezone,
        overdueGraceDays: s?.overdueGraceDays ?? 0,
        markInvoiceOverdueWhenAnyInstallmentOverdue:
          s?.markInvoiceOverdueWhenAnyInstallmentOverdue ?? true,
      }, startedAt);

      totalInvoices += result.invoicesMarkedOverdue;
      totalInstallments += result.installmentsMarkedOverdue;
      processed++;

      // F-H3: emit a per-student INVOICE_OVERDUE for each student who newly went overdue this
      // run, so the StudentRiskProjection refreshes promptly (the daily reconcile is the
      // backstop). Independent of notifyOnOverdue — that flag governs notifications, not risk.
      for (const studentId of result.affectedStudentIds) {
        await eventPublisher.publish({
          organizationId: org.id,
          eventType: DomainEventType.INVOICE_OVERDUE,
          aggregateType: DomainAggregateType.INVOICE,
          aggregateId: studentId,
          actorId: "SYSTEM",
          payload: { studentId, organizationId: org.id, jobRunId, occurredAt: startedAt.toISOString() },
        });
      }

      // Publish one aggregated event per org per run.
      // Skipped when notifyOnOverdue=false so notification handlers are not
      // triggered for organizations that have opted out.
      const notifyOnOverdue = s?.notifyOnOverdue ?? true;
      const overdueNotificationDelayDays = s?.overdueNotificationDelayDays ?? 0;

      if (
        (result.invoicesMarkedOverdue > 0 || result.installmentsMarkedOverdue > 0) &&
        notifyOnOverdue
      ) {
        await eventPublisher.publish({
          organizationId: org.id,
          eventType: DomainEventType.BILLING_OVERDUE_DETECTED,
          aggregateType: DomainAggregateType.BILLING_JOB,
          aggregateId: jobRunId,
          actorId: "SYSTEM",
          payload: {
            organizationId: org.id,
            invoiceCount: result.invoicesMarkedOverdue,
            installmentCount: result.installmentsMarkedOverdue,
            jobRunId,
            // Forwarded to the event handler so it can delay notifications.
            overdueNotificationDelayDays,
          },
        });
      }
    } catch (err) {
      errors.push({ organizationId: org.id, error: (err as Error).message });
    }
  }

  const completedAt = new Date();

  // Persist a queryable audit record of every job run so operators can
  // diagnose past overdue-processing events without database archaeology.
  try {
    await db.auditLog.create({
      data: {
        organizationId: null,
        actorId: null,
        entity: "BillingJob",
        entityId: jobRunId,
        action:
          errors.length > 0
            ? "daily_billing_job.completed_with_errors"
            : "daily_billing_job.completed",
        newValues: JSON.stringify({
          jobRunId,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          organizationsProcessed: processed,
          organizationsSkipped: skipped,
          totalInvoicesMarkedOverdue: totalInvoices,
          totalInstallmentsMarkedOverdue: totalInstallments,
          errorCount: errors.length,
          timezoneWarningCount: timezoneWarnings.length,
        }),
      },
    });
  } catch {
    // Audit log failure must never abort or alter the job result.
  }

  return {
    jobRunId,
    startedAt,
    completedAt,
    organizationsProcessed: processed,
    organizationsSkipped: skipped,
    totalInvoicesMarkedOverdue: totalInvoices,
    totalInstallmentsMarkedOverdue: totalInstallments,
    errors,
    timezoneWarnings,
  };
}
