import type {
  CertificateExportArtifact,
  CertificatePdfRenderInput,
  CertificatePdfRenderer,
  CertificateRenderDto,
} from "@/modules/certificates/types/export";

// =============================================================================
// CERTIFICATE PDF RENDERER (Phase 8) — rendering only
// -----------------------------------------------------------------------------
// Turns a privacy-safe `CertificateRenderDto` (+ template view) into PDF bytes. It
// contains NO business rule: it does not decide eligibility, resolve templates,
// touch the DB, or read Academic Core / Transcript / grades — the command supplies
// a finished DTO and this layer only lays out bytes (§5/§31). It imports no
// repository and no other engine.
//
// This default implementation is a DETERMINISTIC, dependency-free minimal PDF
// writer: identical input → identical bytes (no clock, no randomness), so it is a
// stable test double AND a real `application/pdf` artifact. A richer template
// renderer (branded layout via the project PDF infra) can replace it behind the
// `CertificatePdfRenderer` interface without touching the command.
// =============================================================================

const PDF_CONTENT_TYPE = "application/pdf";

/** Escape the three characters significant inside a PDF literal string. */
function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** The human-visible lines placed on the certificate, derived ONLY from the DTO. */
function renderLines(dto: CertificateRenderDto, templateName: string): string[] {
  return [
    dto.organizationName ?? "",
    "CERTIFICADO",
    `Nº ${dto.certificateNumber}`,
    dto.studentDisplayName ?? "",
    dto.courseName ?? "",
    dto.issuedAt ? `Emitido em ${dto.issuedAt.toISOString().slice(0, 10)}` : "",
    dto.expiresAt ? `Válido até ${dto.expiresAt.toISOString().slice(0, 10)}` : "",
    `Verificar em: ${dto.verificationUrl}`,
    `Modelo: ${templateName}`,
  ].filter((line) => line.length > 0);
}

/** A single text content stream positioning each line down the page. */
function buildContentStream(lines: string[]): string {
  const ops: string[] = ["BT", "/F1 14 Tf", "16 TL", "56 780 Td"];
  lines.forEach((line, index) => {
    if (index > 0) ops.push("T*");
    ops.push(`(${escapePdfText(line)}) Tj`);
  });
  ops.push("ET");
  return ops.join("\n");
}

/**
 * Assemble a minimal, valid single-page PDF. Object byte-offsets for the xref
 * table are computed from the actual serialized bytes (never hand-counted), so the
 * document is valid by construction and fully deterministic.
 */
export function renderCertificatePdfBytes(lines: string[]): Buffer {
  const content = buildContentStream(lines);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  const size = objects.length + 1;
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export class DeterministicCertificatePdfRenderer implements CertificatePdfRenderer {
  async render(input: CertificatePdfRenderInput): Promise<CertificateExportArtifact> {
    const lines = renderLines(input.render, input.template.name);
    return { buffer: renderCertificatePdfBytes(lines), contentType: PDF_CONTENT_TYPE };
  }
}

/** The default renderer singleton the export command uses unless a test injects one. */
export const certificatePdfRenderer: CertificatePdfRenderer =
  new DeterministicCertificatePdfRenderer();
