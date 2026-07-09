import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// PHASE 14 — OPERATIONAL HARDENING ARCHITECTURE GUARDS
// -----------------------------------------------------------------------------
// The operational layer is READ-ONLY except the Outbox. These static guards read
// the sources directly so a forbidden edit fails fast:
//   • no Academic Core / Transcript / Grade / Attendance / Eligibility imports;
//   • services + outbox import no certificate command;
//   • routes import no repository and no command (thin shells);
//   • the read services perform no DB write and never touch eventPublisher — only
//     the Outbox (the single mutable seam) may reference it;
//   • no PDF / renderer / storage / ministry / React anywhere in the layer.
// =============================================================================

const MOD = join(process.cwd(), "src", "modules", "certificates");
const APP = join(process.cwd(), "src", "app", "api", "certificates");

const READ_SERVICES = [
  "certificate-health.service.ts",
  "certificate-maintenance.service.ts",
  "certificate-metrics.service.ts",
  "certificate-operational.service.ts",
].map((f) => join(MOD, "services", f));

const OUTBOX_FILES = ["retry-policy.ts", "certificate-outbox.service.ts", "index.ts"].map((f) =>
  join(MOD, "outbox", f)
);

const ROUTE_FILES = ["health", "maintenance", "metrics", "outbox"].map((op) =>
  join(APP, op, "route.ts")
);

const read = (p: string): string => readFileSync(p, "utf8");
const ALL = [...READ_SERVICES, ...OUTBOX_FILES, ...ROUTE_FILES];

describe("no upstream engine imports anywhere in the operational layer", () => {
  it("no Academic Core / Transcript imports", () => {
    for (const p of ALL) {
      const src = read(p);
      expect(src).not.toMatch(/modules\/(grades|attendance|assessments|academic|enrollments|transcripts)/);
      expect(src).not.toMatch(/AcademicTranscript/);
      expect(src).not.toMatch(/certificate-transcript-source/);
    }
  });

  it("no EligibilityEngine imports", () => {
    for (const p of ALL) {
      expect(read(p)).not.toMatch(/certificate-eligibility|evaluateCertificateEligibility|EligibilityEngine/);
    }
  });

  it("no PDF / renderer / storage / ministry / React", () => {
    for (const p of ALL) {
      const src = read(p);
      expect(src).not.toMatch(/react-pdf|puppeteer|generatePdf|infrastructure\/storage|certificate-ministry|certificate-pdf/);
      expect(src).not.toMatch(/from ["']react["']|from ["']react-dom["']|"use client"/);
    }
  });
});

describe("services + outbox import no certificate command", () => {
  it("no command import in the operational services or outbox", () => {
    for (const p of [...READ_SERVICES, ...OUTBOX_FILES]) {
      expect(read(p)).not.toMatch(/certificates\/commands/);
    }
  });
});

describe("routes are thin shells", () => {
  it("no repository import in any operational route", () => {
    for (const p of ROUTE_FILES) {
      expect(read(p)).not.toMatch(/modules\/certificates\/repositories/);
    }
  });

  it("no command import in any operational route", () => {
    for (const p of ROUTE_FILES) {
      expect(read(p)).not.toMatch(/certificates\/commands/);
    }
  });
});

describe("read-only except the Outbox", () => {
  it("the read services perform no DB writes / raw SQL", () => {
    for (const p of READ_SERVICES) {
      const src = read(p);
      expect(src).not.toMatch(/\.create\(/);
      expect(src).not.toMatch(/\.createMany\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.updateMany\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.deleteMany\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\$queryRaw|\$executeRaw/);
    }
  });

  it("only the Outbox references eventPublisher (the read services never do)", () => {
    for (const p of READ_SERVICES) {
      expect(read(p)).not.toMatch(/eventPublisher|EventPublisher/);
    }
    // The Outbox IS the single delivery seam that legitimately wraps the publisher.
    const outbox = read(join(MOD, "outbox", "certificate-outbox.service.ts"));
    expect(outbox).toMatch(/eventPublisher/);
  });
});
