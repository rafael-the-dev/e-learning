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
