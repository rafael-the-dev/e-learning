import { z } from "zod";
import {
  CertificateEligibilityBlocker,
  CertificateExportStatus,
  CertificateExportType,
  CertificateMinistryFormat,
  CertificateRequestStatus,
  CertificateStatus,
  CertificateType,
  CertificateVerificationPublicStatus,
  FinancialClearanceStatus,
  StaleReason,
} from "@/modules/certificates/constants";

// =============================================================================
// CERTIFICATE ENGINE — FOUNDATION SCHEMAS (Phase 0)
// -----------------------------------------------------------------------------
// Enum-only Zod schemas mirroring the const-object vocabularies in
// `../constants`. These validate that a value is a canonical domain string; they
// carry NO business logic. Command/input schemas (generate/issue/revoke/…) are a
// LATER phase and are intentionally not defined here.
//
// Each schema is derived from the const object's values so the two can never drift.
// =============================================================================

/** Tuple helper: turn a const-object's values into a non-empty tuple for z.enum. */
function values<T extends Record<string, string>>(obj: T): [string, ...string[]] {
  const vals = Object.values(obj);
  return vals as [string, ...string[]];
}

export const certificateTypeSchema = z.enum(values(CertificateType), {
  message: "Tipo de certificado inválido",
});
export type CertificateTypeInput = z.infer<typeof certificateTypeSchema>;

export const certificateStatusSchema = z.enum(values(CertificateStatus), {
  message: "Estado de certificado inválido",
});
export type CertificateStatusInput = z.infer<typeof certificateStatusSchema>;

export const certificateRequestStatusSchema = z.enum(values(CertificateRequestStatus), {
  message: "Estado de pedido inválido",
});
export type CertificateRequestStatusInput = z.infer<typeof certificateRequestStatusSchema>;

export const certificateExportTypeSchema = z.enum(values(CertificateExportType), {
  message: "Tipo de exportação inválido",
});
export type CertificateExportTypeInput = z.infer<typeof certificateExportTypeSchema>;

export const certificateExportStatusSchema = z.enum(values(CertificateExportStatus), {
  message: "Estado de exportação inválido",
});
export type CertificateExportStatusInput = z.infer<typeof certificateExportStatusSchema>;

export const certificateVerificationPublicStatusSchema = z.enum(
  values(CertificateVerificationPublicStatus),
  { message: "Estado de verificação inválido" }
);
export type CertificateVerificationPublicStatusInput = z.infer<
  typeof certificateVerificationPublicStatusSchema
>;

export const financialClearanceStatusSchema = z.enum(values(FinancialClearanceStatus), {
  message: "Estado de regularização financeira inválido",
});
export type FinancialClearanceStatusInput = z.infer<typeof financialClearanceStatusSchema>;

export const certificateEligibilityBlockerSchema = z.enum(values(CertificateEligibilityBlocker), {
  message: "Impedimento de elegibilidade inválido",
});
export type CertificateEligibilityBlockerInput = z.infer<
  typeof certificateEligibilityBlockerSchema
>;

// =============================================================================
// COMMAND INPUT SCHEMAS (Phase 4)
// -----------------------------------------------------------------------------
// Client-supplied input for certificate commands. `organizationId`, `studentId`,
// and the actor come from the server `ServiceContext` / are derived from the
// transcript facts — never from the client. Immutable fields the engine owns
// (certificateNumber, checksum, transcriptNumber/checksum, status) are likewise
// not accepted here. `.strict()` rejects any unexpected field.
// =============================================================================

/** Input for `GenerateCertificateCommand` — create a DRAFT / PENDING_APPROVAL
 *  certificate from an issued transcript version. */
export const generateCertificateSchema = z
  .object({
    transcriptVersionId: z.string().min(1, "A versão do histórico é obrigatória"),
    certificateType: certificateTypeSchema,
    policyId: z.string().min(1).optional(),
    courseId: z.string().min(1).optional(),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();
export type GenerateCertificateInput = z.infer<typeof generateCertificateSchema>;

/** Input for `IssueCertificateCommand` — promote a generated certificate to the
 *  official ISSUED record. The certificate is addressed by id only; every
 *  lifecycle value (number, checksum, status, issue stamp, verification code/url)
 *  is computed server-side and must not be supplied by the client. */
export const issueCertificateSchema = z
  .object({
    certificateId: z.string().min(1, "O identificador do certificado é obrigatório"),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();
export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;

/** Input for `ApproveCertificateCommand` — records the approval provenance for a
 *  PENDING_APPROVAL certificate so it becomes issuable (Phase 5 gate). The approval
 *  does NOT change the certificate status; it appends a `certificate.approved`
 *  CertificateEvent that `IssueCertificateCommand` reads as provenance. The
 *  certificate is addressed by id only. */
export const approveCertificateSchema = z
  .object({
    certificateId: z.string().min(1, "O identificador do certificado é obrigatório"),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();
export type ApproveCertificateInput = z.infer<typeof approveCertificateSchema>;

/** Input for `RevokeCertificateCommand` — ISSUED | SUSPENDED → REVOKED (terminal).
 *  A reason is mandatory (revocation changes historical truth). */
export const revokeCertificateSchema = z
  .object({
    certificateId: z.string().min(1, "O identificador do certificado é obrigatório"),
    reason: z.string().min(1, "O motivo é obrigatório").max(500, "O motivo não pode exceder 500 caracteres"),
  })
  .strict();
export type RevokeCertificateInput = z.infer<typeof revokeCertificateSchema>;

/** Input for `SuspendCertificateCommand` — ISSUED → SUSPENDED. A reason is mandatory. */
export const suspendCertificateSchema = z
  .object({
    certificateId: z.string().min(1, "O identificador do certificado é obrigatório"),
    reason: z.string().min(1, "O motivo é obrigatório").max(500, "O motivo não pode exceder 500 caracteres"),
  })
  .strict();
export type SuspendCertificateInput = z.infer<typeof suspendCertificateSchema>;

/** Input for `RestoreCertificateCommand` — SUSPENDED → ISSUED. Reason optional. */
export const restoreCertificateSchema = z
  .object({
    certificateId: z.string().min(1, "O identificador do certificado é obrigatório"),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();
export type RestoreCertificateInput = z.infer<typeof restoreCertificateSchema>;

/** Input for `ExportCertificateCommand` — render + persist a certificate artifact.
 *  The certificate is addressed by id; `exportType` defaults to PDF. Every produced
 *  value (file url/checksum) is computed server-side and never supplied by the client. */
export const exportCertificateSchema = z
  .object({
    certificateId: z.string().min(1, "O identificador do certificado é obrigatório"),
    exportType: certificateExportTypeSchema.default(CertificateExportType.PDF),
  })
  .strict();
/** INPUT type (pre-parse): `exportType` is optional and defaults to PDF. */
export type ExportCertificateInput = z.input<typeof exportCertificateSchema>;

/** Input for `ExportCertificateToMinistryCommand` (Phase 11) — serialize an ISSUED
 *  certificate's frozen, privacy-minimized snapshot to a ministry artifact and submit
 *  it through the transport adapter. `format` defaults to JSON. Every produced value
 *  (external reference / file checksum) is computed server-side, never supplied here. */
export const exportCertificateToMinistrySchema = z
  .object({
    certificateId: z.string().min(1, "O identificador do certificado é obrigatório"),
    format: z
      .enum([
        CertificateMinistryFormat.JSON,
        CertificateMinistryFormat.CSV,
        CertificateMinistryFormat.XML,
      ])
      .default(CertificateMinistryFormat.JSON),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();
/** INPUT type (pre-parse): `format` is optional and defaults to JSON. */
export type ExportCertificateToMinistryInput = z.input<typeof exportCertificateToMinistrySchema>;

/** Input for `ReconcileCertificateStalenessCommand` (Phase 9) — a manual/admin
 *  backfill that marks certificates STALE when their linked transcript version was
 *  invalidated but the reactive event was missed. At least one target is required
 *  (`transcriptVersionId` processes all linked certificates; `certificateId`
 *  processes one). `dryRun` defaults to TRUE (report only). `reason` is one of the
 *  transcript-driven stale reasons and defaults to `TRANSCRIPT_MARKED_STALE`. The
 *  command reads NO transcript table — the caller supplies the reason. */
export const reconcileCertificateStalenessSchema = z
  .object({
    transcriptVersionId: z.string().min(1).optional(),
    certificateId: z.string().min(1).optional(),
    dryRun: z.boolean().optional().default(true),
    reason: z
      .enum([
        StaleReason.TRANSCRIPT_SUPERSEDED,
        StaleReason.TRANSCRIPT_REVOKED,
        StaleReason.TRANSCRIPT_MARKED_STALE,
      ])
      .optional(),
  })
  .strict()
  .refine((v) => Boolean(v.transcriptVersionId) || Boolean(v.certificateId), {
    message: "É necessário indicar a versão do histórico ou o certificado",
  });
/** INPUT type (pre-parse): `dryRun` is optional and defaults to `true`. */
export type ReconcileCertificateStalenessInput = z.input<typeof reconcileCertificateStalenessSchema>;

// =============================================================================
// CERTIFICATE REQUEST WORKFLOW SCHEMAS (Phase 12)
// -----------------------------------------------------------------------------
// The request is an ADMINISTRATIVE workflow — it decides no academic eligibility
// (that stays in the engine) and generates no certificate directly (that stays in
// GenerateCertificateCommand). `organizationId` + the actor come from the context;
// `studentId` is resolved server-side (own for a student, or the supplied id for a
// staff-created request). `.strict()` rejects unexpected fields.
// =============================================================================

/** Input for `RequestCertificateCommand` — create a PENDING request. `studentId` is
 *  accepted ONLY for a staff-created request (a student is always resolved to self). */
export const requestCertificateSchema = z
  .object({
    certificateType: certificateTypeSchema,
    transcriptVersionId: z.string().min(1).optional(),
    studentId: z.string().min(1).optional(),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();
export type RequestCertificateInput = z.infer<typeof requestCertificateSchema>;

/** Input for `ApproveCertificateRequestCommand` — PENDING → APPROVED. */
export const approveCertificateRequestSchema = z
  .object({
    requestId: z.string().min(1, "O identificador do pedido é obrigatório"),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();
export type ApproveCertificateRequestInput = z.infer<typeof approveCertificateRequestSchema>;

/** Input for `RejectCertificateRequestCommand` — PENDING → REJECTED (reason required). */
export const rejectCertificateRequestSchema = z
  .object({
    requestId: z.string().min(1, "O identificador do pedido é obrigatório"),
    reason: z.string().min(1, "O motivo é obrigatório").max(500, "O motivo não pode exceder 500 caracteres"),
  })
  .strict();
export type RejectCertificateRequestInput = z.infer<typeof rejectCertificateRequestSchema>;

/** Input for `CancelCertificateRequestCommand` — PENDING/APPROVED → CANCELLED. */
export const cancelCertificateRequestSchema = z
  .object({
    requestId: z.string().min(1, "O identificador do pedido é obrigatório"),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();
export type CancelCertificateRequestInput = z.infer<typeof cancelCertificateRequestSchema>;

/** Input for `FulfillCertificateRequestCommand` — APPROVED → FULFILLED (generates the
 *  certificate via GenerateCertificateCommand; no auto-issue in Phase 12). */
export const fulfillCertificateRequestSchema = z
  .object({
    requestId: z.string().min(1, "O identificador do pedido é obrigatório"),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();
export type FulfillCertificateRequestInput = z.infer<typeof fulfillCertificateRequestSchema>;

// =============================================================================
// BULK OPERATION SCHEMAS (Phase 13)
// -----------------------------------------------------------------------------
// The bulk layer is an ORCHESTRATOR: each item is executed through the existing
// single-item command. These schemas validate only the ENVELOPE (a non-empty item
// list + flags) — the per-item business rules stay in the single commands.
// `stopOnFailure` defaults to false (continue past failures). `reason` is applied to
// every item; for revoke/suspend it is mandatory (mirrors the single commands).
// =============================================================================

const bulkStopOnFailure = z.boolean().optional().default(false);

export const bulkGenerateCertificatesSchema = z
  .object({
    items: z
      .array(
        z.object({
          transcriptVersionId: z.string().min(1, "A versão do histórico é obrigatória"),
          certificateType: certificateTypeSchema,
          policyId: z.string().min(1).optional(),
          courseId: z.string().min(1).optional(),
        })
      )
      .min(1, "É necessário pelo menos um item"),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
    stopOnFailure: bulkStopOnFailure,
  })
  .strict();
export type BulkGenerateCertificatesInput = z.input<typeof bulkGenerateCertificatesSchema>;

const bulkCertificateIdItems = z
  .array(z.object({ certificateId: z.string().min(1, "O identificador do certificado é obrigatório") }))
  .min(1, "É necessário pelo menos um item");

export const bulkIssueCertificatesSchema = z
  .object({
    items: bulkCertificateIdItems,
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
    stopOnFailure: bulkStopOnFailure,
  })
  .strict();
export type BulkIssueCertificatesInput = z.input<typeof bulkIssueCertificatesSchema>;

export const bulkExportCertificatesSchema = z
  .object({
    items: z
      .array(
        z.object({
          certificateId: z.string().min(1, "O identificador do certificado é obrigatório"),
          exportType: certificateExportTypeSchema.optional(),
        })
      )
      .min(1, "É necessário pelo menos um item"),
    stopOnFailure: bulkStopOnFailure,
  })
  .strict();
export type BulkExportCertificatesInput = z.input<typeof bulkExportCertificatesSchema>;

export const bulkRevokeCertificatesSchema = z
  .object({
    items: bulkCertificateIdItems,
    reason: z.string().min(1, "O motivo é obrigatório").max(500, "O motivo não pode exceder 500 caracteres"),
    stopOnFailure: bulkStopOnFailure,
  })
  .strict();
export type BulkRevokeCertificatesInput = z.input<typeof bulkRevokeCertificatesSchema>;

export const bulkSuspendCertificatesSchema = z
  .object({
    items: bulkCertificateIdItems,
    reason: z.string().min(1, "O motivo é obrigatório").max(500, "O motivo não pode exceder 500 caracteres"),
    stopOnFailure: bulkStopOnFailure,
  })
  .strict();
export type BulkSuspendCertificatesInput = z.input<typeof bulkSuspendCertificatesSchema>;

export const bulkRestoreCertificatesSchema = z
  .object({
    items: bulkCertificateIdItems,
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
    stopOnFailure: bulkStopOnFailure,
  })
  .strict();
export type BulkRestoreCertificatesInput = z.input<typeof bulkRestoreCertificatesSchema>;

/** Public verification code (Phase 7) — the opaque, globally-unique lookup handle.
 *  32 lowercase-hex chars (128 bits), matching `generateVerificationCode`. Validated
 *  at the public endpoint before any DB lookup so malformed input never hits the DB. */
export const certificateVerificationCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{32}$/, "Código de verificação inválido");
export type CertificateVerificationCode = z.infer<typeof certificateVerificationCodeSchema>;
