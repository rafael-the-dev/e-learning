import { describe, expect, it } from "vitest";
import { DeterministicCertificatePdfRenderer } from "../certificate-pdf-renderer";
import type {
  CertificatePdfRenderInput,
  CertificateRenderDto,
  CertificateTemplateView,
} from "@/modules/certificates/types/export";

// =============================================================================
// DeterministicCertificatePdfRenderer — rendering-only behaviour (Phase 8, §5)
// -----------------------------------------------------------------------------
// The renderer turns a privacy-safe DTO into valid, deterministic PDF bytes. It
// carries no business rule and touches no DB. These tests assert: valid PDF output
// (magic header + content type), determinism (same input → identical bytes), that
// the whitelisted display fields appear, and that no field outside the DTO can leak.
// =============================================================================

const TEMPLATE: CertificateTemplateView = {
  templateId: "tpl-1",
  name: "Modelo Oficial",
  language: "pt-PT",
  layoutJson: "{}",
  templateHtml: null,
  backgroundImageUrl: null,
  signatureImageUrl: null,
  sealImageUrl: null,
};

const DTO: CertificateRenderDto = {
  certificateNumber: "CERT-2026-000042",
  certificateType: "COURSE_COMPLETION",
  studentDisplayName: "João Silva Costa",
  courseName: "Carta de Condução B",
  organizationName: "Escola de Condução Central",
  issuedAt: new Date("2026-07-05T00:00:00.000Z"),
  expiresAt: null,
  verificationUrl: "https://verify.example.com/verify/certificate/abcdef0123456789abcdef0123456789",
  qrPayload: "https://verify.example.com/verify/certificate/abcdef0123456789abcdef0123456789",
  templateData: { templateName: "Modelo Oficial", language: "pt-PT" },
};

const renderer = new DeterministicCertificatePdfRenderer();
const input = (dto: CertificateRenderDto): CertificatePdfRenderInput => ({ render: dto, template: TEMPLATE });

describe("DeterministicCertificatePdfRenderer", () => {
  it("produces a valid application/pdf artifact", async () => {
    const { buffer, contentType } = await renderer.render(input(DTO));
    expect(contentType).toBe("application/pdf");
    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(buffer.toString("utf8")).toContain("%%EOF");
  });

  it("is deterministic — identical input yields byte-identical output", async () => {
    const a = await renderer.render(input(DTO));
    const b = await renderer.render(input(DTO));
    expect(a.buffer.equals(b.buffer)).toBe(true);
  });

  it("renders the whitelisted display fields", async () => {
    const { buffer } = await renderer.render(input(DTO));
    const text = buffer.toString("utf8");
    expect(text).toContain("CERT-2026-000042");
    expect(text).toContain("Escola de Condução Central");
    expect(text).toContain(DTO.verificationUrl);
  });

  it("emits nothing beyond the DTO — a value never placed in the DTO cannot appear", async () => {
    // A checksum-shaped secret is deliberately absent from the DTO; it must not
    // materialise in the output (the renderer only lays out DTO fields).
    const { buffer } = await renderer.render(input(DTO));
    const text = buffer.toString("utf8");
    expect(text).not.toContain("csum-SECRET");
    expect(text).not.toMatch(/transcriptChecksum|transcriptVersionId/);
  });
});
