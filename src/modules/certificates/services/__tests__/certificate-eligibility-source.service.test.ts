import { describe, expect, it } from "vitest";
import type { PrismaClientOrTx } from "@/server/db";
import { asClient, makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";
import {
  CERTIFICATE_ELIGIBILITY_SOURCE_VERSION,
  loadCertificateEligibilityFacts,
} from "../certificate-eligibility-source.service";

// =============================================================================
// CertificateEligibilitySource — behavioural tests (Phase 3A)
// -----------------------------------------------------------------------------
// The read-aggregation façade: loads policy + transcript facts, returns finance
// null and administrative {}, decides nothing. These tests seed the fake DB
// (policy rows + transcript tables) and assert copy-only, decision-free output.
// =============================================================================

const ORG = "org-A";

function seedPolicy(db: FakeDb, overrides: Record<string, unknown>): void {
  seed(db, "certificatePolicy", {
    organizationId: ORG,
    name: "Policy",
    certificateType: "COURSE_COMPLETION",
    courseId: null,
    requiresIssuedTranscript: true,
    requiresCourseCompleted: true,
    requiresNoPendingSubjects: true,
    requiresFinancialClearance: false,
    requiresManualApproval: false,
    autoIssueOnTranscriptIssued: false,
    staleAction: "MARK_STALE",
    validityMonths: null,
    status: "ACTIVE",
    deletedAt: null,
    ...overrides,
  });
}

function seedIssuedTranscript(db: FakeDb, versionId = "ver-1"): void {
  seed(db, "academicTranscript", {
    id: "tr-1",
    organizationId: ORG,
    studentId: "stu-1",
    courseId: "course-1",
    transcriptType: "COURSE_TRANSCRIPT",
    transcriptNumber: "TR-2026-000001",
  });
  seed(db, "academicTranscriptVersion", {
    id: versionId,
    organizationId: ORG,
    transcriptId: "tr-1",
    status: "ISSUED",
    checksum: "chk-1",
    issuedAt: new Date("2026-07-01T00:00:00.000Z"),
    issuedBy: "user-1",
    studentSnapshot: JSON.stringify({ fullName: "João Silva" }),
    courseSnapshot: JSON.stringify({ course: { courseId: "course-1" }, courseProgress: { status: "COMPLETED" } }),
  });
}

const baseInput = { organizationId: ORG, studentId: "stu-1", certificateType: "COURSE_COMPLETION" };

describe("loadCertificateEligibilityFacts — policy loading", () => {
  it("1. loads the explicit policy when policyId is supplied", async () => {
    const db = makeFakeDb();
    seedPolicy(db, { id: "p-explicit", status: "INACTIVE" }); // explicit load ignores status
    seedPolicy(db, { id: "p-default" });
    const facts = await loadCertificateEligibilityFacts({ ...baseInput, policyId: "p-explicit" }, asClient(db));
    expect(facts.policy?.id).toBe("p-explicit");
  });

  it("2. loads the course-override policy (no explicit id)", async () => {
    const db = makeFakeDb();
    seedPolicy(db, { id: "p-default", courseId: null });
    seedPolicy(db, { id: "p-course", courseId: "course-1" });
    const facts = await loadCertificateEligibilityFacts({ ...baseInput, courseId: "course-1" }, asClient(db));
    expect(facts.policy?.id).toBe("p-course");
  });

  it("3. falls back to the default active policy when no override exists", async () => {
    const db = makeFakeDb();
    seedPolicy(db, { id: "p-default", courseId: null });
    const facts = await loadCertificateEligibilityFacts({ ...baseInput, courseId: "course-9" }, asClient(db));
    expect(facts.policy?.id).toBe("p-default");
  });

  it("4. returns policy null when nothing resolves", async () => {
    const db = makeFakeDb();
    const facts = await loadCertificateEligibilityFacts(baseInput, asClient(db));
    expect(facts.policy).toBeNull();
  });

  it("returns policy null when an explicit id misses (no fallback)", async () => {
    const db = makeFakeDb();
    seedPolicy(db, { id: "p-default" });
    const facts = await loadCertificateEligibilityFacts({ ...baseInput, policyId: "nope" }, asClient(db));
    expect(facts.policy).toBeNull();
  });
});

describe("loadCertificateEligibilityFacts — transcript loading", () => {
  it("5. loads the transcript through the ACL", async () => {
    const db = makeFakeDb();
    seedIssuedTranscript(db);
    const facts = await loadCertificateEligibilityFacts({ ...baseInput, transcriptVersionId: "ver-1" }, asClient(db));
    expect(facts.transcript?.transcriptVersionId).toBe("ver-1");
    expect(facts.transcript?.transcriptNumber).toBe("TR-2026-000001");
  });

  it("6. returns transcript null when absent or not found", async () => {
    const db = makeFakeDb();
    // no transcriptVersionId at all
    expect((await loadCertificateEligibilityFacts(baseInput, asClient(db))).transcript).toBeNull();
    // a version id that does not exist
    expect(
      (await loadCertificateEligibilityFacts({ ...baseInput, transcriptVersionId: "ghost" }, asClient(db))).transcript
    ).toBeNull();
  });

  it("14. surfaces no transcript persistence keys (ACL DTO only)", async () => {
    const db = makeFakeDb();
    seedIssuedTranscript(db);
    const facts = await loadCertificateEligibilityFacts({ ...baseInput, transcriptVersionId: "ver-1" }, asClient(db));
    for (const key of ["organizationId", "transcriptId", "id"]) {
      expect(facts.transcript).not.toHaveProperty(key);
    }
  });
});

describe("loadCertificateEligibilityFacts — placeholders, metadata, immutability", () => {
  it("7. passes the transaction client through (never falls back to getDb)", async () => {
    const db = makeFakeDb();
    seedPolicy(db, { id: "p-default" });
    seedIssuedTranscript(db);
    const txRunner = db as unknown as { $transaction: <T>(fn: (tx: FakeDb) => Promise<T> | T) => Promise<T> };
    const facts = await txRunner.$transaction((tx) =>
      loadCertificateEligibilityFacts({ ...baseInput, transcriptVersionId: "ver-1" }, asClient(tx))
    );
    expect(facts.policy?.id).toBe("p-default");
    expect(facts.transcript?.transcriptVersionId).toBe("ver-1");
  });

  it("8/9. finance clearance is null and administrative is an empty object", async () => {
    const db = makeFakeDb();
    const facts = await loadCertificateEligibilityFacts(baseInput, asClient(db));
    expect(facts.financialClearance).toBeNull();
    expect(facts.administrative).toEqual({});
  });

  it("10. populates metadata (loadedAt + sourceVersion)", async () => {
    const db = makeFakeDb();
    const facts = await loadCertificateEligibilityFacts(baseInput, asClient(db));
    expect(facts.metadata.loadedAt).toBeInstanceOf(Date);
    expect(facts.metadata.sourceVersion).toBe(CERTIFICATE_ELIGIBILITY_SOURCE_VERSION);
  });

  it("11. exposes no derived eligibility verdict", async () => {
    const db = makeFakeDb();
    seedPolicy(db, { id: "p-default" });
    const facts = await loadCertificateEligibilityFacts(baseInput, asClient(db));
    expect(facts).not.toHaveProperty("eligible");
    expect(facts.policy).not.toHaveProperty("eligible");
    expect(facts).not.toHaveProperty("blockers");
  });

  it("12. returns a frozen fact set", async () => {
    const db = makeFakeDb();
    const facts = await loadCertificateEligibilityFacts(baseInput, asClient(db));
    expect(Object.isFrozen(facts)).toBe(true);
  });

  it("15. policy facts expose only the declared fields (no Prisma columns)", async () => {
    const db = makeFakeDb();
    seedPolicy(db, { id: "p-default" });
    const facts = await loadCertificateEligibilityFacts(baseInput, asClient(db));
    expect(Object.keys(facts.policy!).sort()).toEqual(
      [
        "autoIssueOnTranscriptIssued",
        "certificateType",
        "id",
        "requiresCourseCompleted",
        "requiresFinancialClearance",
        "requiresIssuedTranscript",
        "requiresManualApproval",
        "requiresNoPendingSubjects",
        "staleAction",
        "validityMonths",
      ].sort()
    );
    for (const key of ["organizationId", "createdAt", "updatedAt", "deletedAt", "name", "courseId"]) {
      expect(facts.policy).not.toHaveProperty(key);
    }
  });

  it("13. propagates repository failures (does not swallow)", async () => {
    const throwing = {
      certificatePolicy: {
        findFirst: async () => {
          throw new Error("boom");
        },
      },
    } as unknown as PrismaClientOrTx;
    await expect(
      loadCertificateEligibilityFacts({ ...baseInput, policyId: "p" }, throwing)
    ).rejects.toThrow("boom");
  });
});
