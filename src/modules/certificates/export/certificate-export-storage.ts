import { createHash } from "node:crypto";
import { storage, type StorageProvider } from "@/infrastructure/storage";
import type {
  CertificateExportStorage,
  StoreCertificateExportParams,
  StoredCertificateExport,
} from "@/modules/certificates/types/export";

// =============================================================================
// CERTIFICATE EXPORT STORAGE (Phase 8) — persist the artifact, hash the bytes
// -----------------------------------------------------------------------------
// Wraps the project storage abstraction (`@/infrastructure/storage`) so the export
// command depends on the `CertificateExportStorage` interface, never a provider. It
// stores the PDF buffer under a tenant-scoped key, returns the provider URL, and
// computes the FILE checksum (SHA-256 of the exported bytes).
//
// The file checksum is SEPARATE from `Certificate.checksum` (§8): the certificate
// checksum protects the certificate's CONTENT (frozen at issue), while this hashes
// the produced ARTIFACT. This layer never reads or writes `Certificate.checksum`.
//
// The storage key is an internal detail. It is stored on the export row and NOT
// meant to be handed to an API consumer verbatim — the (future) authenticated
// download route resolves it to a short-lived URL.
// =============================================================================

/** Tenant-scoped, collision-free key for a single export artifact. */
export function buildExportStorageKey(params: {
  organizationId: string;
  certificateId: string;
  exportId: string;
}): string {
  return `certificates/${params.organizationId}/${params.certificateId}/${params.exportId}.pdf`;
}

/** SHA-256 (lowercase hex) of the raw artifact bytes. */
export function computeFileChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export class DefaultCertificateExportStorage implements CertificateExportStorage {
  constructor(private readonly provider: StorageProvider = storage) {}

  async store(params: StoreCertificateExportParams): Promise<StoredCertificateExport> {
    const storageKey = buildExportStorageKey(params);
    const fileChecksum = computeFileChecksum(params.artifact.buffer);
    const uploaded = await this.provider.upload(storageKey, params.artifact.buffer, {
      contentType: params.artifact.contentType,
      isPublic: false,
      metadata: {
        organizationId: params.organizationId,
        certificateId: params.certificateId,
        exportId: params.exportId,
        exportType: params.exportType,
      },
    });
    return { storageKey, fileUrl: uploaded.url, fileChecksum };
  }
}

/** The default storage singleton the export command uses unless a test injects one. */
export const certificateExportStorage: CertificateExportStorage =
  new DefaultCertificateExportStorage();
