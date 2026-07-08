import { storage, type StorageProvider } from "@/infrastructure/storage";

// =============================================================================
// CERTIFICATE EXPORT STORAGE READER (Phase 8C) — authenticated read-back
// -----------------------------------------------------------------------------
// The read counterpart of `CertificateExportStorage`. It fetches a stored artifact
// BY ITS INTERNAL STORAGE KEY so the authenticated download path can stream the
// bytes through the server after authorization. The storage key is derived
// server-side (`buildExportStorageKey`) — a client never supplies a key or a path,
// and the raw provider URL is never redirected to.
//
// Lives OUTSIDE `services/` (alongside the writer) because the service-layer
// architecture guards forbid an `@/infrastructure/storage` dependency in a service;
// this is an infrastructure adapter, not a domain service.
// =============================================================================

export interface CertificateExportStorageReader {
  /** Return the raw bytes for an internal storage key. Throws if absent. */
  read(storageKey: string): Promise<Buffer>;
}

export class DefaultCertificateExportStorageReader implements CertificateExportStorageReader {
  constructor(private readonly provider: StorageProvider = storage) {}

  async read(storageKey: string): Promise<Buffer> {
    return this.provider.download(storageKey);
  }
}

/** The default reader singleton the download service uses unless a test injects one. */
export const certificateExportStorageReader: CertificateExportStorageReader =
  new DefaultCertificateExportStorageReader();
