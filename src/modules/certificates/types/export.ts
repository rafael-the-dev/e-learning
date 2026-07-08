// =============================================================================
// CERTIFICATE ENGINE — EXPORT CONTRACTS (Phase 8)
// -----------------------------------------------------------------------------
// The shapes the Certificate Export Engine produces and consumes. Export CONSUMES
// the frozen issued-certificate snapshots (§2) — it never reads Academic Core, the
// Transcript, grades, or attendance, and never recomputes eligibility.
//
// Three groups:
//   • `CertificateRenderDto` / `CertificateTemplateView` — the privacy-safe INPUT
//     handed to the PDF renderer. Only whitelisted display fields; NO certificate
//     checksum, transcript pointer/checksum, document number, grades, or internal ids.
//   • `CertificatePdfRenderer` / `CertificateExportStorage` — the two swappable
//     adapter interfaces (render bytes / persist bytes). Defined here so the command
//     depends on interfaces, never a concrete implementation.
//   • `CertificateExportResultDto` — the OUTWARD result of an export (no raw snapshot).
// =============================================================================

/** The template fields the renderer needs — a plain view mapped from the template
 *  record by the command, so the renderer never imports a repository/record type. */
export interface CertificateTemplateView {
  templateId: string;
  name: string;
  language: string;
  layoutJson: string;
  templateHtml: string | null;
  backgroundImageUrl: string | null;
  signatureImageUrl: string | null;
  sealImageUrl: string | null;
}

/** Privacy-safe render input (§12). Derived ONLY from frozen certificate snapshots +
 *  the verification pointer. Carries no checksum, transcript pointer, or internal id. */
export interface CertificateRenderDto {
  certificateNumber: string;
  certificateType: string;
  /** The holder's name as frozen on the certificate (full name — this is the
   *  official artifact given to the holder, not the masked public projection). */
  studentDisplayName: string | null;
  courseName: string | null;
  organizationName: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  /** Public verification URL (contains the verification code). */
  verificationUrl: string;
  /** The QR payload — a public pointer only (the verification URL). */
  qrPayload: string;
  /** Safe, non-sensitive layout hints (template name/language/asset URLs). */
  templateData: Record<string, unknown>;
}

/** A produced binary artifact (the rendered PDF bytes + its content type). */
export interface CertificateExportArtifact {
  buffer: Buffer;
  contentType: string;
}

// ─── Renderer adapter (bytes-only; no repository, no business rule) ──────────

export interface CertificatePdfRenderInput {
  render: CertificateRenderDto;
  template: CertificateTemplateView;
}

export interface CertificatePdfRenderer {
  /** Render the certificate to PDF bytes. Pure rendering — no DB, no policy. */
  render(input: CertificatePdfRenderInput): Promise<CertificateExportArtifact>;
}

// ─── Storage adapter (persist bytes; return a URL + a file checksum) ──────────

export interface StoreCertificateExportParams {
  organizationId: string;
  certificateId: string;
  exportId: string;
  exportType: string;
  artifact: CertificateExportArtifact;
}

export interface StoredCertificateExport {
  /** Internal storage key — never returned to an API consumer verbatim. */
  storageKey: string;
  /** A URL the (future, authenticated) download route resolves. */
  fileUrl: string;
  /** SHA-256 of the EXPORTED FILE bytes — separate from `Certificate.checksum` (§8). */
  fileChecksum: string;
}

export interface CertificateExportStorage {
  store(params: StoreCertificateExportParams): Promise<StoredCertificateExport>;
}

// ─── Outward result (no raw snapshot; §12) ────────────────────────────────────

export interface CertificateExportResultDto {
  exportId: string;
  certificateId: string;
  exportType: string;
  status: string;
  fileUrl: string | null;
  fileChecksum: string | null;
  exportedAt: Date | null;
}
