import type {
  CertificateMinistryArtifact,
  CertificateMinistryTransport,
  CertificateMinistryTransportMetadata,
  CertificateMinistryTransportResult,
} from "@/modules/certificates/types/ministry";

// =============================================================================
// CERTIFICATE MINISTRY TRANSPORT (Phase 11) — local/no-op adapter
// -----------------------------------------------------------------------------
// The submission seam for a ministry/government endpoint. Phase 11 ships a LOCAL
// transport that performs NO external call: it records nothing off-box and returns
// a DETERMINISTIC response derived from the payload checksum, so the pipeline is
// fully exercised and testable without any real ministry credentials/API. A real
// HTTP transport is future work — it implements the same interface, so the command
// never changes.
// =============================================================================

/** Deterministic local transport: `externalReference` is derived from the payload
 *  checksum (stable for identical content) and `submittedAt` is the caller-provided
 *  timestamp. No I/O, no external call. */
export class LocalCertificateMinistryTransport implements CertificateMinistryTransport {
  async submit(
    _artifact: CertificateMinistryArtifact,
    metadata: CertificateMinistryTransportMetadata
  ): Promise<CertificateMinistryTransportResult> {
    return {
      externalReference: `LOCAL-MINISTRY-${metadata.payloadChecksum.slice(0, 24)}`,
      submittedAt: metadata.submittedAt,
      status: "RECORDED",
    };
  }
}

/** The default transport the command uses unless a test/integration injects one. */
export const certificateMinistryTransport: CertificateMinistryTransport =
  new LocalCertificateMinistryTransport();
