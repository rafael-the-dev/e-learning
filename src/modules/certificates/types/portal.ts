// =============================================================================
// CERTIFICATE ENGINE — PORTAL DTOs (Phase 10)
// -----------------------------------------------------------------------------
// The read-model shapes the authenticated portals (admin/secretary + student)
// consume. These are OUTWARD DTOs — they carry only what a UI needs and are the
// privacy boundary: a portal reads Certificate facts through these, never the raw
// records. Nothing here reads Academic Core / Transcript / Grade / Attendance, and
// no DTO recomputes eligibility (ADR-002).
//
// `allowedActions` are computed SERVER-SIDE (permissions + certificate/export
// state) so the UI only renders flags — it never infers a business rule.
//
// Privacy split (§4):
//   • the STUDENT detail DTO omits audit/events, transcript & certificate checksums,
//     the financial-clearance reference, and internal ids beyond the cert/export
//     ids a route needs.
//   • the ADMIN detail DTO exposes more (issue basis summary, transcript number, a
//     safe event history) but still never surfaces a raw `fileUrl` / storage key or
//     a raw snapshot/metadata blob.
// =============================================================================

/** Per-certificate action flags, all decided server-side (§11). */
export interface CertificateAllowedActions {
  canIssue: boolean;
  canRevoke: boolean;
  canSuspend: boolean;
  canRestore: boolean;
  canExport: boolean;
  canDownload: boolean;
}

/** A single row in a portal certificate list (admin or student). */
export interface CertificateListItemDto {
  id: string;
  certificateNumber: string | null;
  certificateType: string;
  status: string;
  publicStatus: string | null;
  studentName: string | null;
  courseName: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  allowedActions: CertificateAllowedActions;
}

/** A paginated list envelope. */
export interface CertificateListResult {
  items: CertificateListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** A safe, minimal export row for a portal (never a `fileUrl` / storage key / raw
 *  checksum). `canDownload` is true only for a READY export the caller may fetch. */
export interface CertificateExportSummaryDto {
  id: string;
  exportType: string;
  status: string;
  exportedAt: Date | null;
  canDownload: boolean;
}

/** A safe, typed event row (admin history) — the raw `metadata` blob is deliberately
 *  omitted so an internal pointer (e.g. an export storage key) never leaks. */
export interface CertificateEventSummaryDto {
  eventType: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorId: string | null;
  reason: string | null;
  createdAt: Date;
}

/** Admin / secretary certificate detail. */
export interface AdminCertificateDetailDto {
  id: string;
  certificateNumber: string | null;
  certificateType: string;
  status: string;
  publicStatus: string | null;
  studentName: string | null;
  courseName: string | null;
  /** Parsed frozen student snapshot (certificate snapshot, not a transcript read). */
  studentSnapshot: Record<string, unknown>;
  /** Parsed frozen course snapshot (may be null when the certificate has none). */
  courseSnapshot: Record<string, unknown> | null;
  /** A SAFE summary of the issue basis (type + finance status flags) — never the raw blob. */
  issueBasisSummary: Record<string, unknown>;
  transcriptNumber: string;
  financialClearanceStatus: string;
  issuedAt: Date | null;
  issuedBy: string | null;
  expiresAt: Date | null;
  verificationCode: string | null;
  exports: CertificateExportSummaryDto[];
  events: CertificateEventSummaryDto[];
  allowedActions: CertificateAllowedActions;
}

/** Student certificate detail — the redacted view (§4). No audit/events, no
 *  checksums, no transcript pointer/checksum, no finance reference, no internal ids. */
export interface StudentCertificateDetailDto {
  id: string;
  certificateNumber: string | null;
  certificateType: string;
  status: string;
  publicStatus: string | null;
  studentName: string | null;
  courseName: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  exports: CertificateExportSummaryDto[];
  allowedActions: CertificateAllowedActions;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

/** Admin/secretary list filters (§3). All optional; `page`/`pageSize` paginate. */
export interface CertificateAdminListFilters {
  studentId?: string;
  courseId?: string;
  certificateType?: string;
  status?: string;
  issuedFrom?: Date;
  issuedTo?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Student list filters — deliberately narrow (own scope is enforced by the service). */
export interface CertificateStudentListFilters {
  certificateType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}
