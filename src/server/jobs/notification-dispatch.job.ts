import { randomUUID } from "crypto";
import { getDb } from "@/server/db";
import { dispatchPendingDeliveries } from "@/modules/notifications/services/notification-dispatcher.service";

// =============================================================================
// NOTIFICATION DISPATCH JOB
// Batch entry point for POST /api/internal/jobs/notifications/dispatch.
// dispatchPendingDeliveries() itself is single-organization (see
// notification-dispatcher.service.ts); this job fans it out across every
// active organization, mirroring daily-billing.job.ts's own org loop.
// =============================================================================

export interface RunNotificationDispatchJobOptions {
  /** Restrict processing to a single organization. */
  organizationId?: string;
  /** Max deliveries processed per organization in this run. Default 100, capped at 500. */
  limit?: number;
}

export interface NotificationDispatchJobResult {
  processed: number;
  sent: number;
  delivered: number;
  /** Same value as providerNotConfigured — kept for the route's documented response shape. */
  failed: number;
  providerNotConfigured: number;
  errors: number;
  startedAt: Date;
  completedAt: Date;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function runNotificationDispatchJob(
  options?: RunNotificationDispatchJobOptions
): Promise<NotificationDispatchJobResult> {
  const jobRunId = randomUUID();
  const startedAt = new Date();
  const limit = Math.min(options?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const db = await getDb();

  const orgs = await db.organization.findMany({
    where: {
      ...(options?.organizationId ? { id: options.organizationId } : {}),
      // Paused/cancelled organizations are skipped, same convention as
      // daily-billing.job.ts — no point sending notifications for a tenant
      // whose account isn't active.
      status: { notIn: ["CANCELLED", "SUSPENDED"] },
      deletedAt: null,
    },
    select: { id: true },
  });

  let processed = 0;
  let sent = 0;
  let delivered = 0;
  let providerNotConfigured = 0;
  let errors = 0;

  for (const org of orgs) {
    try {
      const summary = await dispatchPendingDeliveries(org.id, new Date(), limit);
      processed += summary.processed;
      sent += summary.sent;
      delivered += summary.delivered;
      providerNotConfigured += summary.providerNotConfigured;
      errors += summary.errors;
    } catch (error) {
      errors++;
      console.error(`[NotificationDispatchJob] Failed to dispatch for organization ${org.id}:`, error);
    }
  }

  const completedAt = new Date();

  try {
    await db.auditLog.create({
      data: {
        organizationId: options?.organizationId ?? null,
        actorId: null,
        entity: "NotificationDispatcher",
        entityId: jobRunId,
        action: "notification_dispatcher.run",
        newValues: JSON.stringify({
          jobRunId,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          organizationsProcessed: orgs.length,
          processed,
          sent,
          delivered,
          failed: providerNotConfigured,
          errors,
        }),
      },
    });
  } catch {
    // Audit log failure must never abort or alter the job result.
  }

  return { processed, sent, delivered, failed: providerNotConfigured, providerNotConfigured, errors, startedAt, completedAt };
}
