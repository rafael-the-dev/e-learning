// =============================================================================
// CERTIFICATE ENGINE — MINISTRY EXPORT CONTRACTS (Phase 11)
// -----------------------------------------------------------------------------
// The shapes the Ministry Export Engine produces and consumes. Ministry export
// CONSUMES the frozen issued-certificate snapshots only — it never reads Academic
// Core, the Transcript, grades, or attendance, and never recomputes eligibility
// (ADR-002). The payload is privacy-minimized (§11): only fields needed for
// official verification travel; NO transcript pointer/checksum, grades, attendance,
// finance reference, internal ids, raw snapshots, or audit metadata.
//
// Layering mirrors the PDF export (Phase 8): the command depends on the builder +
// formatter + transport + storage INTERFACES here, never a concrete implementation.
// =============================================================================

import type { CertificateMinistryFormat } from "@/modules/certificates/constants";

/** The minimized source the command assembles from Certificate + CertificateVerification
 *  + Organization. Already narrowed at read time — it carries NO raw snapshot, transcript
 *  pointer/checksum, grade, attendance, or finance field. */
export interface CertificateMinistrySourceDto {
  certificateNumber: string;
  certificateType: string;
  studentName: string | null;
  courseName: string | null;
  organizationName: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  verificationCode: string;
  verificationUrl: string;
  /** The certificate CONTENT checksum (frozen at issue) — NOT any transcript checksum. */
  certificateChecksum: string;
  status: string;
}

/** The normalized, official ministry payload (§4/§11). Dates are ISO-8601 strings so
 *  the serialized artifact is stable and transport-agnostic. This is the ONLY shape
 *  that leaves the engine toward a ministry. */
export interface CertificateMinistryPayload {
  certificateNumber: string;
  certificateType: string;
  studentName: string | null;
  courseName: string | null;
  organizationName: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  verificationCode: string;
  verificationUrl: string;
  certificateChecksum: string;
  status: string;
}

/** A serialized artifact + its content type, produced by a formatter. */
export interface CertificateMinistryArtifact {
  content: string;
  contentType: string;
  format: CertificateMinistryFormat;
}

/** A pure, deterministic payload → string formatter (JSON / CSV / XML). */
export interface CertificateMinistryFormatter {
  format(payload: CertificateMinistryPayload): CertificateMinistryArtifact;
}

// ─── Transport adapter (submit; NO real API in Phase 11) ─────────────────────

export interface CertificateMinistryTransportMetadata {
  certificateId: string;
  certificateNumber: string;
  format: CertificateMinistryFormat;
  /** SHA-256 of the serialized artifact — also the deterministic reference seed. */
  payloadChecksum: string;
  submittedAt: Date;
}

export interface CertificateMinistryTransportResult {
  /** An opaque reference for the submission (deterministic for the local transport). */
  externalReference: string;
  submittedAt: Date;
  status: string;
}

export interface CertificateMinistryTransport {
  submit(
    artifact: CertificateMinistryArtifact,
    metadata: CertificateMinistryTransportMetadata
  ): Promise<CertificateMinistryTransportResult>;
}

// ─── Storage adapter (persist the serialized artifact; hash the bytes) ────────

export interface StoreMinistryExportParams {
  organizationId: string;
  certificateId: string;
  exportId: string;
  format: CertificateMinistryFormat;
  artifact: CertificateMinistryArtifact;
}

export interface StoredMinistryExport {
  /** Internal storage key — never returned to an API consumer verbatim. */
  storageKey: string;
  /** Internal URL the (authenticated) download path resolves — never surfaced raw. */
  fileUrl: string;
  /** SHA-256 of the serialized artifact bytes. */
  fileChecksum: string;
}

export interface CertificateMinistryStorage {
  store(params: StoreMinistryExportParams): Promise<StoredMinistryExport>;
}

// ─── Outward result (no raw snapshot / transcript id / storage path; §10) ─────

export interface CertificateMinistryExportResultDto {
  exportId: string;
  certificateId: string;
  exportType: string;
  format: CertificateMinistryFormat;
  status: string;
  externalReference: string | null;
  fileChecksum: string | null;
  exportedAt: Date | null;
}
