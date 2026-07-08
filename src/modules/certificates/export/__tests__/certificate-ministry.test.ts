import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { StorageProvider } from "@/infrastructure/storage";
import type {
  CertificateMinistryPayload,
  CertificateMinistrySourceDto,
} from "@/modules/certificates/types/ministry";
import {
  buildCertificateMinistryPayload,
  MINISTRY_PAYLOAD_FIELDS,
} from "../certificate-ministry-payload";
import {
  certificateMinistryCsvFormatter,
  certificateMinistryJsonFormatter,
  certificateMinistryXmlFormatter,
  formatMinistryPayload,
} from "../certificate-ministry-formatters";
import { DefaultCertificateMinistryStorage } from "../certificate-ministry-storage";

// =============================================================================
// Ministry payload builder + formatters + storage — Phase 11 pure tests
// -----------------------------------------------------------------------------
// The builder/formatters are pure & deterministic; storage hashes the serialized
// bytes. No DB, no network, no real disk (a fake StorageProvider is injected).
// =============================================================================

const SOURCE: CertificateMinistrySourceDto = {
  certificateNumber: "CERT-2026-000042",
  certificateType: "COURSE_COMPLETION",
  studentName: "João Silva",
  courseName: "Curso A",
  organizationName: "Escola Central",
  issuedAt: new Date("2026-07-05T00:00:00.000Z"),
  expiresAt: null,
  verificationCode: "vc-1",
  verificationUrl: "https://verify.example.com/verify/certificate/vc-1",
  certificateChecksum: "cert-checksum-1",
  status: "ISSUED",
};

describe("buildCertificateMinistryPayload (16–18)", () => {
  it("16. exposes exactly the allowed fields, in the documented order", () => {
    const payload = buildCertificateMinistryPayload(SOURCE);
    expect(Object.keys(payload)).toEqual([...MINISTRY_PAYLOAD_FIELDS]);
  });

  it("17/18. never carries transcript pointer/checksum, grades, attendance, finance, or internal ids", () => {
    // A source polluted with forbidden fields must not leak them (builder copies field-by-field).
    const polluted = {
      ...SOURCE,
      transcriptChecksum: "tchk-SECRET",
      transcriptVersionId: "ver-SECRET",
      grades: [{ subject: "x", grade: 20 }],
      attendance: 0.9,
      financialClearanceReference: "FIN-SECRET",
      studentId: "stu-SECRET",
    } as unknown as CertificateMinistrySourceDto;
    const json = JSON.stringify(buildCertificateMinistryPayload(polluted));
    expect(json).not.toMatch(/tchk-SECRET|ver-SECRET|grades|attendance|FIN-SECRET|stu-SECRET/);
  });

  it("normalizes dates to ISO-8601 strings", () => {
    const payload = buildCertificateMinistryPayload(SOURCE);
    expect(payload.issuedAt).toBe("2026-07-05T00:00:00.000Z");
    expect(payload.expiresAt).toBeNull();
  });
});

describe("formatters (19–21)", () => {
  const payload: CertificateMinistryPayload = buildCertificateMinistryPayload(SOURCE);

  it("19. JSON is deterministic and stable-ordered", () => {
    const a = certificateMinistryJsonFormatter.format(payload).content;
    const b = certificateMinistryJsonFormatter.format(payload).content;
    expect(a).toBe(b);
    expect(JSON.stringify(Object.keys(JSON.parse(a)))).toBe(JSON.stringify([...MINISTRY_PAYLOAD_FIELDS]));
    expect(formatMinistryPayload(payload, "JSON").contentType).toBe("application/json");
  });

  it("20. CSV has a header row and escapes commas/quotes/newlines", () => {
    const tricky = buildCertificateMinistryPayload({
      ...SOURCE,
      studentName: 'Silva, "Jr"\nSecond',
      courseName: "Plain",
    });
    const csv = certificateMinistryCsvFormatter.format(tricky).content;
    const [header, row] = csv.split("\r\n");
    expect(header.startsWith("certificateNumber,certificateType,studentName")).toBe(true);
    expect(row).toContain('"Silva, ""Jr""\nSecond"'); // quoted + doubled quotes, newline preserved inside quotes
    expect(row).toContain("Plain");
  });

  it("21. XML escapes special characters and has a root element", () => {
    const tricky = buildCertificateMinistryPayload({ ...SOURCE, courseName: 'A & B <c> "d" \'e\'' });
    const xml = certificateMinistryXmlFormatter.format(tricky).content;
    expect(xml).toContain("<?xml version");
    expect(xml).toContain("<certificate>");
    expect(xml).toContain("</certificate>");
    expect(xml).toContain("<courseName>A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;</courseName>");
    expect(xml).not.toMatch(/<c>|&(?!amp;|lt;|gt;|quot;|apos;)/); // no unescaped markup
  });
});

describe("DefaultCertificateMinistryStorage (23–24)", () => {
  it("23. fileChecksum equals the SHA-256 of the serialized artifact; key/url internal", async () => {
    const uploads: Array<{ key: string; buffer: Buffer }> = [];
    const provider: StorageProvider = {
      upload: vi.fn(async (key: string, buffer: Buffer) => {
        uploads.push({ key, buffer });
        return { key, url: `/uploads/${key}`, size: buffer.length };
      }),
      download: vi.fn(),
      delete: vi.fn(),
      getUrl: (k: string) => `/uploads/${k}`,
      getSignedUrl: vi.fn(),
    } as unknown as StorageProvider;

    const artifact = formatMinistryPayload(buildCertificateMinistryPayload(SOURCE), "JSON");
    const stored = await new DefaultCertificateMinistryStorage(provider).store({
      organizationId: "org-A",
      certificateId: "cert-1",
      exportId: "exp-1",
      format: "JSON",
      artifact,
    });

    const expected = createHash("sha256").update(Buffer.from(artifact.content, "utf8")).digest("hex");
    expect(stored.fileChecksum).toBe(expected);
    expect(stored.storageKey).toBe("certificates/org-A/cert-1/exp-1.ministry.json");
    expect(uploads[0].key).toBe(stored.storageKey);
    // The key is distinct from the PDF artifact key (no `.pdf`).
    expect(stored.storageKey.endsWith(".ministry.json")).toBe(true);
  });
});
