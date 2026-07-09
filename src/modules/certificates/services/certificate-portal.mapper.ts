import { CertificateStatus } from "@/modules/certificates/constants";
import type {
  CertificateDetailRecord,
  CertificateListRecord,
} from "@/modules/certificates/types/repository";
import type {
  AdminCertificateDetailDto,
  CertificateAllowedActions,
  CertificateExportSummaryDto,
  CertificateListItemDto,
  StudentCertificateDetailDto,
} from "@/modules/certificates/types/portal";
import {
  parseSnapshot,
  readCourseName,
  readStudentFullName,
} from "@/modules/certificates/lib/certificate-snapshot";

// =============================================================================
// CERTIFICATE PORTAL MAPPER (Phase 10) — pure, READ-ONLY DTO shaping
// -----------------------------------------------------------------------------
// Maps frozen Certificate records → outward portal DTOs and computes the
// server-side `allowedActions`. It is a PURE function module: no DB, no writes,
// no command, no event/audit, no Academic Core / Transcript read. Display names
// come from the certificate's OWN frozen snapshots (never a live academic read).
// The read services own the data access; this module only shapes + gates.
// =============================================================================

const ISSUABLE: ReadonlySet<string> = new Set([
  CertificateStatus.DRAFT,
  CertificateStatus.PENDING_APPROVAL,
]);
const REVOCABLE: ReadonlySet<string> = new Set([
  CertificateStatus.ISSUED,
  CertificateStatus.SUSPENDED,
]);
const EXPORTABLE: ReadonlySet<string> = new Set([
  CertificateStatus.ISSUED,
  CertificateStatus.SUSPENDED,
]);

/** The caller's raw capabilities (from RBAC + scope). `canView` gates download for a
 *  certificate the caller is allowed to see; the lifecycle caps mirror the command
 *  permissions (restore reuses `certificates.suspend`). */
export interface CertificateActionCaps {
  canIssue: boolean;
  canRevoke: boolean;
  canSuspend: boolean;
  canRestore: boolean;
  canExport: boolean;
  canView: boolean;
}

/** No-management capability set (e.g. a student) — only viewing/downloading. */
export const READONLY_CAPS: CertificateActionCaps = {
  canIssue: false,
  canRevoke: false,
  canSuspend: false,
  canRestore: false,
  canExport: false,
  canView: true,
};

/** Compute the per-certificate action flags server-side from permissions + the
 *  certificate status + whether a READY export exists (§11). The UI renders these;
 *  it never re-derives a rule. */
export function computeAllowedActions(
  status: string,
  hasReadyExport: boolean,
  caps: CertificateActionCaps
): CertificateAllowedActions {
  return {
    canIssue: caps.canIssue && ISSUABLE.has(status),
    canRevoke: caps.canRevoke && REVOCABLE.has(status),
    canSuspend: caps.canSuspend && status === CertificateStatus.ISSUED,
    canRestore: caps.canRestore && status === CertificateStatus.SUSPENDED,
    canExport: caps.canExport && EXPORTABLE.has(status),
    canDownload: caps.canView && hasReadyExport,
  };
}

// ─── List item ─────────────────────────────────────────────────────────────

export interface ListItemContext {
  publicStatus: string | null;
  hasReadyExport: boolean;
  caps: CertificateActionCaps;
}

export function toListItemDto(
  cert: CertificateListRecord,
  ctx: ListItemContext
): CertificateListItemDto {
  return {
    id: cert.id,
    certificateNumber: cert.certificateNumber,
    certificateType: cert.certificateType,
    status: cert.status,
    publicStatus: ctx.publicStatus,
    studentName: readStudentFullName(cert.studentSnapshot),
    courseName: readCourseName(cert.courseSnapshot),
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
    allowedActions: computeAllowedActions(cert.status, ctx.hasReadyExport, ctx.caps),
  };
}

// ─── Export summary (safe: no fileUrl / storage key / raw checksum) ──────────

function toExportSummary(
  exp: { id: string; exportType: string; status: string; exportedAt: Date | null },
  caps: CertificateActionCaps
): CertificateExportSummaryDto {
  const isReady = exp.status === "READY";
  return {
    id: exp.id,
    exportType: exp.exportType,
    status: exp.status,
    exportedAt: exp.exportedAt,
    canDownload: caps.canView && isReady,
  };
}

// ─── Detail (admin) ──────────────────────────────────────────────────────────

export function toAdminDetailDto(
  record: CertificateDetailRecord,
  caps: CertificateActionCaps
): AdminCertificateDetailDto {
  const publicStatus = record.verification?.publicStatus ?? null;
  const exports = record.exports.map((e) => toExportSummary(e, caps));
  const hasReadyExport = exports.some((e) => e.status === "READY");
  return {
    id: record.id,
    certificateNumber: record.certificateNumber,
    certificateType: record.certificateType,
    status: record.status,
    publicStatus,
    studentName: readStudentFullName(record.studentSnapshot),
    courseName: readCourseName(record.courseSnapshot),
    studentSnapshot: parseSnapshot(record.studentSnapshot),
    courseSnapshot: record.courseSnapshot ? parseSnapshot(record.courseSnapshot) : null,
    // A SAFE summary from certificate columns only — never the raw issueBasis blob.
    issueBasisSummary: {
      certificateType: record.certificateType,
      transcriptNumber: record.transcriptNumber,
      financialClearanceStatus: record.financialClearanceStatus,
    },
    transcriptNumber: record.transcriptNumber,
    financialClearanceStatus: record.financialClearanceStatus,
    issuedAt: record.issuedAt,
    issuedBy: record.issuedBy,
    expiresAt: record.expiresAt,
    verificationCode: record.verificationCode,
    exports,
    // Typed event history only — the raw `metadata` blob is intentionally dropped.
    events: record.events.map((ev) => ({
      eventType: ev.eventType,
      previousStatus: ev.previousStatus,
      newStatus: ev.newStatus,
      actorId: ev.actorId,
      reason: ev.reason,
      createdAt: ev.createdAt,
    })),
    allowedActions: computeAllowedActions(record.status, hasReadyExport, caps),
  };
}

// ─── Detail (student — redacted) ─────────────────────────────────────────────

export function toStudentDetailDto(
  record: CertificateDetailRecord,
  caps: CertificateActionCaps = READONLY_CAPS
): StudentCertificateDetailDto {
  const publicStatus = record.verification?.publicStatus ?? null;
  const exports = record.exports.map((e) => toExportSummary(e, caps));
  const hasReadyExport = exports.some((e) => e.status === "READY");
  return {
    id: record.id,
    certificateNumber: record.certificateNumber,
    certificateType: record.certificateType,
    status: record.status,
    publicStatus,
    studentName: readStudentFullName(record.studentSnapshot),
    courseName: readCourseName(record.courseSnapshot),
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    exports,
    allowedActions: computeAllowedActions(record.status, hasReadyExport, caps),
  };
}
