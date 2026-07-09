// =============================================================================
// CERTIFICATE ENGINE — REPOSITORY RECORD & FILTER TYPES (Phase 2B)
// -----------------------------------------------------------------------------
// Plain persistence-shaped types the certificate-model repositories return and
// accept. NOT client/UI/API DTOs and NOT public-verification shapes. They mirror
// the stored columns so no Prisma model type leaks past the repository boundary.
//
// JSON snapshot columns (`studentSnapshot`, `courseSnapshot`, `issueBasisSnapshot`,
// event `metadata`) are carried as the raw stored `string` — the repository never
// parses, recomputes, or reshapes them. Certificate models have no Decimal
// columns, so every numeric field is a plain `number`.
// =============================================================================

export interface CertificatePolicyRecord {
  id: string;
  organizationId: string;
  name: string;
  certificateType: string;
  courseId: string | null;
  requiresIssuedTranscript: boolean;
  requiresCourseCompleted: boolean;
  requiresNoPendingSubjects: boolean;
  requiresFinancialClearance: boolean;
  requiresManualApproval: boolean;
  autoIssueOnTranscriptIssued: boolean;
  staleAction: string;
  validityMonths: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CertificateTemplateRecord {
  id: string;
  organizationId: string;
  name: string;
  certificateType: string;
  courseId: string | null;
  language: string;
  layoutJson: string;
  templateHtml: string | null;
  backgroundImageUrl: string | null;
  signatureImageUrl: string | null;
  sealImageUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** The lean projection returned by `listCertificates` for paginated portal lists.
 *  Carries ONLY the columns `toListItemDto` consumes — never the large frozen JSON
 *  blobs (`issueBasisSnapshot`) or the `Max` reason columns — so a list page does not
 *  transfer data it discards. Detail reads use the full `CertificateRecord`. */
export interface CertificateListRecord {
  id: string;
  certificateNumber: string | null;
  certificateType: string;
  status: string;
  studentSnapshot: string;
  courseSnapshot: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
}

export interface CertificateRecord {
  id: string;
  organizationId: string;
  studentId: string;
  enrollmentId: string | null;
  courseId: string | null;
  transcriptVersionId: string;
  transcriptNumber: string;
  transcriptChecksum: string;
  certificatePolicyId: string | null;
  certificateTemplateId: string | null;
  certificateNumber: string | null;
  certificateType: string;
  status: string;
  studentSnapshot: string;
  courseSnapshot: string | null;
  issueBasisSnapshot: string;
  financialClearanceStatus: string;
  financialClearanceCheckedAt: Date | null;
  financialClearanceReference: string | null;
  verificationCode: string | null;
  verificationUrl: string | null;
  checksum: string | null;
  issuedAt: Date | null;
  issuedBy: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
  suspendedAt: Date | null;
  suspendedBy: string | null;
  suspendReason: string | null;
  staleDetectedAt: Date | null;
  staleReason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CertificateEventRecord {
  id: string;
  organizationId: string;
  certificateId: string;
  eventType: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorId: string | null;
  reason: string | null;
  metadata: string | null;
  createdAt: Date;
}

export interface CertificateExportRecord {
  id: string;
  organizationId: string;
  certificateId: string;
  exportType: string;
  fileUrl: string | null;
  fileChecksum: string | null;
  exportedBy: string | null;
  exportedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Composed, org-scoped read backing the authenticated export download (Phase 8C):
 *  the export row + the minimal certificate columns the download path needs. It
 *  carries NO transcript pointer/checksum, NO snapshot, and NO academic field — the
 *  download path never reads the Transcript or Academic Core. `fileUrl` is INTERNAL
 *  (never surfaced to the client); the artifact is streamed through the server. */
export interface CertificateExportDownloadRecord {
  exportId: string;
  organizationId: string;
  status: string;
  exportType: string;
  fileUrl: string | null;
  fileChecksum: string | null;
  certificateId: string;
  certificateStatus: string;
  certificateStudentId: string;
  certificateNumber: string | null;
  certificateType: string;
}

export interface CertificateVerificationRecord {
  id: string;
  organizationId: string;
  certificateId: string;
  verificationCode: string;
  publicStatus: string;
  verificationCount: number;
  lastVerifiedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CertificateRequestRecord {
  id: string;
  organizationId: string;
  studentId: string;
  transcriptVersionId: string | null;
  certificateType: string;
  requestedBy: string;
  status: string;
  reason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  fulfilledCertificateId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** A certificate plus its append-only children (events/exports) and its 1:1
 *  verification projection. Assembled by `findCertificateDetailById`. */
export interface CertificateDetailRecord extends CertificateRecord {
  events: CertificateEventRecord[];
  exports: CertificateExportRecord[];
  verification: CertificateVerificationRecord | null;
}

// ─── List filters (org-scoped; `includeDeleted` opt-in; skip/take pagination) ──

export interface CertificatePolicyListFilters {
  organizationId: string;
  certificateType?: string;
  /** `null` filters org-default rows; omit for no course filter. */
  courseId?: string | null;
  status?: string;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
}

export interface CertificateTemplateListFilters {
  organizationId: string;
  certificateType?: string;
  courseId?: string | null;
  language?: string;
  status?: string;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
}

export interface CertificateListFilters {
  organizationId: string;
  studentId?: string;
  enrollmentId?: string;
  courseId?: string;
  transcriptVersionId?: string;
  certificateType?: string;
  status?: string;
  /** Inclusive `issuedAt` lower bound (Phase 10 admin filter). */
  issuedFrom?: Date;
  /** Inclusive `issuedAt` upper bound (Phase 10 admin filter). */
  issuedTo?: Date;
  /** Free-text match against `certificateNumber` (Phase 10 admin filter). */
  search?: string;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
}

export interface CertificateRequestListFilters {
  organizationId: string;
  studentId?: string;
  certificateType?: string;
  status?: string;
  /** Inclusive `createdAt` lower bound (Phase 12 admin filter). */
  createdFrom?: Date;
  /** Inclusive `createdAt` upper bound (Phase 12 admin filter). */
  createdTo?: Date;
  includeDeleted?: boolean;
  skip?: number;
  take?: number;
}
