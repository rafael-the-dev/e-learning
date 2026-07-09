import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { certificateOutbox } from "@/modules/certificates/outbox";
import type {
  CertificateOperationalDashboard,
  OutboxSummary,
} from "@/modules/certificates/types/operational";
import { certificateHealthService } from "./certificate-health.service";
import { certificateMaintenanceService } from "./certificate-maintenance.service";
import { certificateMetricsService } from "./certificate-metrics.service";

// =============================================================================
// CERTIFICATE OPERATIONAL SERVICE (Phase 14) — READ-ONLY DASHBOARD COMPOSER
// -----------------------------------------------------------------------------
// Assembles the operational dashboard DTO (§6): health KPIs + maintenance report
// + outbox delivery summary + windowed metrics. Pure composition over the read
// services + the outbox summary; each underlying service enforces `certificates.view`.
// No UI, no write, no Academic read. The outbox summary is SANITIZED (counts +
// dead-letter envelope, never event payloads).
// =============================================================================

export class CertificateOperationalService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.CERTIFICATES_VIEW)) {
      throw new AuthorizationError();
    }
  }

  /** The SANITIZED outbox delivery summary (counts + dead-letter envelope, no event
   *  payloads). Requires `certificates.view`. */
  async getOutboxSummary(context: AuthContext): Promise<OutboxSummary> {
    this.assertCanView(context);
    return certificateOutbox.summary();
  }

  async getDashboard(
    context: AuthContext,
    now: Date = new Date()
  ): Promise<CertificateOperationalDashboard> {
    const [health, maintenance, metrics] = await Promise.all([
      certificateHealthService.getHealth(context, now),
      certificateMaintenanceService.getReport(context, now),
      certificateMetricsService.getMetrics(context, now),
    ]);
    return {
      health,
      maintenance,
      outbox: certificateOutbox.summary(),
      metrics,
      generatedAt: now,
    };
  }
}

export const certificateOperationalService = new CertificateOperationalService();
