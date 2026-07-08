import { z } from "zod";
import {
  CertificateEligibilityBlocker,
  CertificateExportStatus,
  CertificateExportType,
  CertificateRequestStatus,
  CertificateStatus,
  CertificateType,
  CertificateVerificationPublicStatus,
  FinancialClearanceStatus,
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

/** Public verification code (Phase 7) — the opaque, globally-unique lookup handle.
 *  32 lowercase-hex chars (128 bits), matching `generateVerificationCode`. Validated
 *  at the public endpoint before any DB lookup so malformed input never hits the DB. */
export const certificateVerificationCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{32}$/, "Código de verificação inválido");
export type CertificateVerificationCode = z.infer<typeof certificateVerificationCodeSchema>;
