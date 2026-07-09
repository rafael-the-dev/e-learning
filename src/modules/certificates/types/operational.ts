// =============================================================================
// CERTIFICATE ENGINE — OPERATIONAL HARDENING CONTRACTS (Phase 14)
// -----------------------------------------------------------------------------
// Reliability / observability / recovery shapes. This phase adds NO domain rule
// and NO lifecycle transition: every type here describes either the in-process
// Outbox (the ONE mutable seam) or a READ-ONLY operational projection (maintenance
// report, health KPIs, metrics, dashboard). None of these expose sensitive fields
// (checksums, storage paths, verification codes, student PII, transcript pointers)
// — aggregates and structural anomalies only (§10).
// =============================================================================

// ─── Outbox ────────────────────────────────────────────────────────────────

/** Delivery state of an outbox entry. `FAILED` is the dead-letter terminal state
 *  reached only after the retry budget is exhausted; it remains queryable and is
 *  never auto-deleted (§3). */
export const OutboxEntryStatus = {
  PENDING: "PENDING",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
} as const;
export type OutboxEntryStatus = (typeof OutboxEntryStatus)[keyof typeof OutboxEntryStatus];

/** A SANITIZED view of an outbox entry (safe to return over HTTP). It carries the
 *  routing envelope (event type / aggregate) and delivery bookkeeping only — never
 *  the event `payload`, which may contain student ids / transcript pointers / a
 *  checksum. */
export interface OutboxEntrySummary {
  id: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  status: OutboxEntryStatus;
  retryCount: number;
  enqueuedAt: Date;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
}

/** Aggregate delivery counts for the outbox. `total === pending + delivered + failed`. */
export interface OutboxSummary {
  total: number;
  pending: number;
  delivered: number;
  failed: number;
  /** The dead-letter entries (status FAILED), sanitized — for operator visibility. */
  deadLetter: OutboxEntrySummary[];
}

// ─── Maintenance report ──────────────────────────────────────────────────────

/** An export artifact whose owning certificate is missing or soft-deleted. */
export interface OrphanExportInfo {
  exportId: string;
  certificateId: string;
  exportType: string;
  status: string;
  createdAt: Date;
}

/** A PENDING export older than the stuck threshold (never reached READY/FAILED). */
export interface StuckExportInfo {
  exportId: string;
  certificateId: string;
  exportType: string;
  createdAt: Date;
  ageMinutes: number;
}

/** A FAILED export artifact. */
export interface FailedExportInfo {
  exportId: string;
  certificateId: string;
  exportType: string;
  createdAt: Date;
}

/** A group of verification rows that collide on a key that must be unique (a
 *  `verificationCode`, or the 1:1 `certificateId`). Normally empty — the DB holds
 *  unique indexes — this is a defense-in-depth integrity probe, not a domain rule.
 *  `key` is REDACTED (`"[REDACTED]"`) for a `verificationCode` group — a verification
 *  code must never leave via an operational response (§10); a `certificateId` key is
 *  an internal id and is emitted as-is. */
export interface DuplicateVerificationGroup {
  key: string;
  field: "verificationCode" | "certificateId";
  count: number;
  verificationIds: string[];
}

/** A verification projection whose `publicStatus` diverges from the value the
 *  existing lifecycle commands maintain for the owning certificate's status. This
 *  MIRRORS existing behaviour (revoke→REVOKED, suspend/stale→SUSPENDED,
 *  issued→VALID|EXPIRED); it introduces no new rule. */
export interface VerificationProjectionMismatch {
  verificationId: string;
  certificateId: string;
  certificateStatus: string;
  publicStatus: string;
  expectedPublicStatus: string[];
}

/** The read-only maintenance report (§4). Detection only — never a mutation. */
export interface CertificateMaintenanceReport {
  orphanExports: OrphanExportInfo[];
  stuckPendingExports: StuckExportInfo[];
  failedExports: FailedExportInfo[];
  duplicateVerifications: DuplicateVerificationGroup[];
  verificationProjectionMismatches: VerificationProjectionMismatch[];
  /** The PENDING-export age threshold (minutes) used for the stuck probe. */
  stuckThresholdMinutes: number;
  generatedAt: Date;
}

// ─── Health KPIs ───────────────────────────────────────────────────────────

/** Aggregate operational KPIs (§5). Read-only; no Academic read; counts only. */
export interface CertificateHealthKpis {
  totalCertificates: number;
  issued: number;
  revoked: number;
  suspended: number;
  stale: number;
  pendingApproval: number;
  draft: number;
  exportsReady: number;
  exportsFailed: number;
  verificationRows: number;
  verificationMismatches: number;
  requestsPending: number;
  requestsApproved: number;
  requestsFulfilled: number;
  generatedAt: Date;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/** The counted operational actions, per time window (§7). */
export interface CertificateMetricCounts {
  generate: number;
  issue: number;
  revoke: number;
  suspend: number;
  restore: number;
  export: number;
  verification: number;
  request: number;
}

/** Metrics bucketed by rolling windows (today / last 7 days / last 30 days). Built
 *  from existing tables only (no event replay). `verification` is sourced from the
 *  projection's `lastVerifiedAt` and therefore counts the MOST RECENT verification
 *  per certificate within the window (an approximation, documented in §47). */
export interface CertificateMetrics {
  today: CertificateMetricCounts;
  last7Days: CertificateMetricCounts;
  last30Days: CertificateMetricCounts;
  generatedAt: Date;
}

// ─── Operational dashboard ─────────────────────────────────────────────────

/** The composed operational dashboard DTO (§6): health counts + maintenance report
 *  + outbox summary + windowed metrics. No UI; a read model an admin surface can render. */
export interface CertificateOperationalDashboard {
  health: CertificateHealthKpis;
  maintenance: CertificateMaintenanceReport;
  outbox: OutboxSummary;
  metrics: CertificateMetrics;
  generatedAt: Date;
}
