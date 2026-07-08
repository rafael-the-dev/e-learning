import { storage, type StorageProvider } from "@/infrastructure/storage";
import { CertificateMinistryFormat } from "@/modules/certificates/constants";
import type {
  CertificateMinistryStorage,
  StoreMinistryExportParams,
  StoredMinistryExport,
} from "@/modules/certificates/types/ministry";
import { computeFileChecksum } from "./certificate-export-storage";

// =============================================================================
// CERTIFICATE MINISTRY STORAGE (Phase 11) — persist the serialized artifact
// -----------------------------------------------------------------------------
// Wraps the project storage abstraction so the ministry command depends on the
// `CertificateMinistryStorage` interface, never a provider. It persists the
// serialized ministry payload (JSON/CSV/XML) under a tenant-scoped key SEPARATE from
// the PDF artifact key, and computes the FILE checksum (SHA-256 of the serialized
// bytes). The storage key is internal — never handed to an API consumer verbatim;
// the (authenticated) download route resolves it.
// =============================================================================

const EXTENSION: Record<CertificateMinistryFormat, string> = {
  [CertificateMinistryFormat.JSON]: "json",
  [CertificateMinistryFormat.CSV]: "csv",
  [CertificateMinistryFormat.XML]: "xml",
};

/** Tenant-scoped, collision-free key for a single ministry export artifact. Distinct
 *  from the PDF key (`…/<exportId>.pdf`) so the two export types never collide. */
export function buildMinistryStorageKey(params: {
  organizationId: string;
  certificateId: string;
  exportId: string;
  format: CertificateMinistryFormat;
}): string {
  const ext = EXTENSION[params.format];
  return `certificates/${params.organizationId}/${params.certificateId}/${params.exportId}.ministry.${ext}`;
}

export class DefaultCertificateMinistryStorage implements CertificateMinistryStorage {
  constructor(private readonly provider: StorageProvider = storage) {}

  async store(params: StoreMinistryExportParams): Promise<StoredMinistryExport> {
    const storageKey = buildMinistryStorageKey(params);
    const buffer = Buffer.from(params.artifact.content, "utf8");
    const fileChecksum = computeFileChecksum(buffer);
    const uploaded = await this.provider.upload(storageKey, buffer, {
      contentType: params.artifact.contentType,
      isPublic: false,
      metadata: {
        organizationId: params.organizationId,
        certificateId: params.certificateId,
        exportId: params.exportId,
        exportType: "MINISTRY",
        format: params.format,
      },
    });
    return { storageKey, fileUrl: uploaded.url, fileChecksum };
  }
}

/** The default ministry storage singleton the command uses unless a test injects one. */
export const certificateMinistryStorage: CertificateMinistryStorage =
  new DefaultCertificateMinistryStorage();
