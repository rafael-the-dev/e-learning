import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DomainEventType } from "@/server/events/event-types";
import { listCertificateCreatedTimestamps } from "@/modules/certificates/repositories/certificate.repository";
import { listCertificateEventTimestamps } from "@/modules/certificates/repositories/certificate-event.repository";
import { listExportCreatedTimestamps } from "@/modules/certificates/repositories/certificate-export.repository";
import { listVerificationTimestamps } from "@/modules/certificates/repositories/certificate-verification.repository";
import { listRequestCreatedTimestamps } from "@/modules/certificates/repositories/certificate-request.repository";
import type {
  CertificateMetricCounts,
  CertificateMetrics,
} from "@/modules/certificates/types/operational";

// =============================================================================
// CERTIFICATE METRICS SERVICE (Phase 14) — READ-ONLY, EXISTING TABLES ONLY
// -----------------------------------------------------------------------------
// Counts operational actions per rolling window (today / last 7 / last 30 days)
// from the tables that already record them — NO event replay, NO Academic read,
// NO write. Each action is sourced ONCE over the widest (30-day) window and the
// three windows are bucketed in memory, so there are no repeated scans and no N+1.
//   • generate      ← Certificate.createdAt          (a generate creates a row)
//   • issue/revoke/suspend/restore ← CertificateEvent.createdAt by eventType
//   • export        ← CertificateExport.createdAt
//   • verification  ← CertificateVerification.lastVerifiedAt (most-recent per cert)
//   • request       ← CertificateRequest.createdAt
// =============================================================================

const DAY_MS = 86_400_000;

const LIFECYCLE_EVENT_TYPES = [
  DomainEventType.CERTIFICATE_ISSUED,
  DomainEventType.CERTIFICATE_REVOKED,
  DomainEventType.CERTIFICATE_SUSPENDED,
  DomainEventType.CERTIFICATE_RESTORED,
];

/** Start of the UTC calendar day containing `now` — the "today" window boundary. */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function countFrom(timestamps: Date[], boundary: Date): number {
  const b = boundary.getTime();
  let n = 0;
  for (const t of timestamps) if (t.getTime() >= b) n += 1;
  return n;
}

export class CertificateMetricsService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.CERTIFICATES_VIEW)) {
      throw new AuthorizationError();
    }
  }

  async getMetrics(context: AuthContext, now: Date = new Date()): Promise<CertificateMetrics> {
    this.assertCanView(context);
    const { organizationId } = context;

    const todayStart = startOfUtcDay(now);
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

    const [generateTs, eventTs, exportTs, verificationTs, requestTs] = await Promise.all([
      listCertificateCreatedTimestamps({ organizationId, since: thirtyDaysAgo }),
      listCertificateEventTimestamps({
        organizationId,
        since: thirtyDaysAgo,
        eventTypes: LIFECYCLE_EVENT_TYPES,
      }),
      listExportCreatedTimestamps({ organizationId, since: thirtyDaysAgo }),
      listVerificationTimestamps({ organizationId, since: thirtyDaysAgo }),
      listRequestCreatedTimestamps({ organizationId, since: thirtyDaysAgo }),
    ]);

    const eventTsByType = (type: string): Date[] =>
      eventTs.filter((e) => e.eventType === type).map((e) => e.createdAt);

    const issueTs = eventTsByType(DomainEventType.CERTIFICATE_ISSUED);
    const revokeTs = eventTsByType(DomainEventType.CERTIFICATE_REVOKED);
    const suspendTs = eventTsByType(DomainEventType.CERTIFICATE_SUSPENDED);
    const restoreTs = eventTsByType(DomainEventType.CERTIFICATE_RESTORED);

    const bucket = (boundary: Date): CertificateMetricCounts => ({
      generate: countFrom(generateTs, boundary),
      issue: countFrom(issueTs, boundary),
      revoke: countFrom(revokeTs, boundary),
      suspend: countFrom(suspendTs, boundary),
      restore: countFrom(restoreTs, boundary),
      export: countFrom(exportTs, boundary),
      verification: countFrom(verificationTs, boundary),
      request: countFrom(requestTs, boundary),
    });

    return {
      today: bucket(todayStart),
      last7Days: bucket(sevenDaysAgo),
      last30Days: bucket(thirtyDaysAgo),
      generatedAt: now,
    };
  }
}

export const certificateMetricsService = new CertificateMetricsService();
