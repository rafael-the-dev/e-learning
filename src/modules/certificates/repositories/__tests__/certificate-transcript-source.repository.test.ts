import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "./_fake-db";
import {
  existsIssuedTranscript,
  findIssuedTranscriptVersionForCertificate,
  findTranscriptVersionSummary,
} from "../certificate-transcript-source.repository";

// =============================================================================
// CertificateTranscriptSourceRepository — behavioural tests (§13)
// -----------------------------------------------------------------------------
// The repository is the Certificate Engine's Anti-Corruption Layer over the
// Transcript Engine: read-only, tenant-scoped, ISSUED-only for the full read, and
// it returns Certificate DTOs (never Prisma entities). These tests seed the fake
// transcript tables and assert copy-exact, immutable, DTO-only behaviour.
// =============================================================================

const ORG = "org-A";
const OTHER_ORG = "org-B";
const VERSION_ID = "ver-1";
const TRANSCRIPT_ID = "tr-1";

const STUDENT_SNAPSHOT = {
  studentId: "stu-1",
  studentCode: "S-001",
  firstName: "João",
  lastName: "Silva",
  fullName: "João Silva",
  status: "ACTIVE",
};

const COURSE_IDENTITY = {
  courseId: "course-1",
  courseName: "Direção Defensiva",
  courseCode: "DD-100",
  enrollmentId: "enr-1",
};

const COURSE_PROGRESS = {
  status: "COMPLETED",
  finalGrade: 16.5,
  earnedCredits: 30,
};

interface SeedOptions {
  organizationId?: string;
  versionStatus?: string;
  transcriptNumber?: string | null;
  checksum?: string | null;
  courseSnapshot?: string | null;
  withChildren?: boolean;
}

/** Seed one transcript version + its root (+ optional snapshot children). */
function seedTranscript(db: FakeDb, opts: SeedOptions = {}): void {
  const organizationId = opts.organizationId ?? ORG;
  const courseSnapshot =
    opts.courseSnapshot !== undefined
      ? opts.courseSnapshot
      : JSON.stringify({ course: COURSE_IDENTITY, courseProgress: COURSE_PROGRESS });

  seed(db, "academicTranscript", {
    id: TRANSCRIPT_ID,
    organizationId,
    studentId: "stu-1",
    courseId: "course-1",
    transcriptType: "COURSE_TRANSCRIPT",
    transcriptNumber: opts.transcriptNumber !== undefined ? opts.transcriptNumber : "TR-2026-000042",
  });

  seed(db, "academicTranscriptVersion", {
    id: VERSION_ID,
    organizationId,
    transcriptId: TRANSCRIPT_ID,
    versionNumber: 1,
    status: opts.versionStatus ?? "ISSUED",
    checksum: opts.checksum !== undefined ? opts.checksum : "chk-abc123",
    issuedAt: new Date("2026-07-01T10:00:00.000Z"),
    issuedBy: "user-issuer",
    studentSnapshot: JSON.stringify(STUDENT_SNAPSHOT),
    courseSnapshot,
  });

  if (opts.withChildren) {
    seed(db, "academicTranscriptLevel", {
      id: "lvl-1",
      organizationId,
      transcriptVersionId: VERSION_ID,
      levelName: "Nível 1",
      levelOrder: 1,
      status: "PASSED",
      finalGrade: 16,
    });
    seed(db, "academicTranscriptLevel", {
      id: "lvl-2",
      organizationId,
      transcriptVersionId: VERSION_ID,
      levelName: "Nível 2",
      levelOrder: 2,
      status: "PASSED",
      finalGrade: 17,
    });
    seed(db, "academicTranscriptSubject", {
      id: "sub-1",
      organizationId,
      transcriptVersionId: VERSION_ID,
      transcriptLevelId: "lvl-1",
      subjectName: "Código da Estrada",
      subjectOrder: 1,
      status: "PASSED",
      isRequired: true,
    });
    seed(db, "academicTranscriptSubject", {
      id: "sub-2",
      organizationId,
      transcriptVersionId: VERSION_ID,
      transcriptLevelId: "lvl-2",
      subjectName: "Condução",
      subjectOrder: 2,
      status: "PASSED",
      isRequired: true,
    });
    seed(db, "academicTranscriptAssessment", {
      id: "as-1",
      organizationId,
      transcriptSubjectId: "sub-1",
      componentName: "Exame Final",
      sourceType: "SCHEDULED_EVENT",
      grade: 16,
      maxGrade: 20,
      normalizedGrade: 16,
      status: "GRADED",
      isRecovery: false,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    // Subject-grain attendance + version-grain (transcriptSubjectId null).
    seed(db, "academicTranscriptAttendance", {
      id: "at-1",
      organizationId,
      transcriptVersionId: VERSION_ID,
      transcriptSubjectId: "sub-1",
      status: "SUFFICIENT",
      totalSessions: 10,
      totalPresentMinutes: 900,
      totalScheduledMinutes: 1000,
      attendancePercentage: 90,
    });
    seed(db, "academicTranscriptAttendance", {
      id: "at-2",
      organizationId,
      transcriptVersionId: VERSION_ID,
      transcriptSubjectId: null,
      status: "GOOD",
      totalSessions: 20,
      totalPresentMinutes: 1800,
      totalScheduledMinutes: 2000,
      attendancePercentage: 90,
    });
  }
}

const params = { organizationId: ORG, transcriptVersionId: VERSION_ID };

describe("findIssuedTranscriptVersionForCertificate — status & tenant gating", () => {
  it("1. returns the DTO for an ISSUED transcript version", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { withChildren: true });
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(dto).not.toBeNull();
    expect(dto!.transcriptVersionId).toBe(VERSION_ID);
    expect(dto!.transcriptStatus).toBe("ISSUED");
    expect(dto!.transcriptType).toBe("COURSE_TRANSCRIPT");
  });

  it("2. ignores a DRAFT transcript version (returns null)", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { versionStatus: "DRAFT" });
    expect(await findIssuedTranscriptVersionForCertificate(params, asClient(db))).toBeNull();
  });

  it("3. ignores a REVOKED transcript version (returns null)", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { versionStatus: "REVOKED" });
    expect(await findIssuedTranscriptVersionForCertificate(params, asClient(db))).toBeNull();
  });

  it("4. ignores a SUPERSEDED transcript version (returns null)", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { versionStatus: "SUPERSEDED" });
    expect(await findIssuedTranscriptVersionForCertificate(params, asClient(db))).toBeNull();
  });

  it("5. returns null for the wrong organization", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { organizationId: OTHER_ORG, withChildren: true });
    expect(await findIssuedTranscriptVersionForCertificate(params, asClient(db))).toBeNull();
  });
});

describe("findIssuedTranscriptVersionForCertificate — copy-exact snapshot", () => {
  it("6. returns an immutable snapshot (mutating the result never touches the source)", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { withChildren: true });
    const first = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    first!.transcriptNumber = "TAMPERED";
    first!.levels.pop();
    first!.studentSnapshot.fullName = "TAMPERED";
    const second = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(second!.transcriptNumber).toBe("TR-2026-000042");
    expect(second!.levels).toHaveLength(2);
    expect(second!.studentSnapshot.fullName).toBe("João Silva");
  });

  it("7. copies the version checksum exactly", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { checksum: "sha-DEADBEEF-exact" });
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(dto!.transcriptChecksum).toBe("sha-DEADBEEF-exact");
  });

  it("8. copies the transcript number exactly", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { transcriptNumber: "TR-2026-999999" });
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(dto!.transcriptNumber).toBe("TR-2026-999999");
  });

  it("9. copies the student snapshot exactly", async () => {
    const db = makeFakeDb();
    seedTranscript(db);
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(dto!.studentSnapshot).toEqual(STUDENT_SNAPSHOT);
  });

  it("10. copies the course snapshot exactly (un-nested from the transcript envelope)", async () => {
    const db = makeFakeDb();
    seedTranscript(db);
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(dto!.courseSnapshot).toEqual(COURSE_IDENTITY);
  });

  it("11. copies the course-progress snapshot exactly", async () => {
    const db = makeFakeDb();
    seedTranscript(db);
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(dto!.courseProgressSnapshot).toEqual(COURSE_PROGRESS);
  });

  it("surfaces null course/progress when the version has no course snapshot", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { courseSnapshot: null });
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(dto!.courseSnapshot).toBeNull();
    expect(dto!.courseProgressSnapshot).toBeNull();
  });

  it("orders children deterministically and preserves parent join keys", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { withChildren: true });
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(dto!.levels.map((l) => l.transcriptLevelId)).toEqual(["lvl-1", "lvl-2"]);
    expect(dto!.subjects.map((s) => s.transcriptSubjectId)).toEqual(["sub-1", "sub-2"]);
    expect(dto!.subjects[0].transcriptLevelId).toBe("lvl-1");
    expect(dto!.assessments[0].transcriptSubjectId).toBe("sub-1");
    // version-grain attendance keeps a null subject key
    expect(dto!.attendance.some((a) => a.transcriptSubjectId === null)).toBe(true);
  });
});

describe("findIssuedTranscriptVersionForCertificate — transaction client & DTO shape", () => {
  it("16. accepts a transaction client and uses it (never falls back to getDb)", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { withChildren: true });
    const txRunner = db as unknown as {
      $transaction: <T>(fn: (tx: FakeDb) => Promise<T> | T) => Promise<T>;
    };
    const dto = await txRunner.$transaction((tx) =>
      findIssuedTranscriptVersionForCertificate(params, asClient(tx))
    );
    expect(dto!.transcriptVersionId).toBe(VERSION_ID);
  });

  it("17. leaks no Prisma persistence keys (organizationId / transcriptId / raw id)", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { withChildren: true });
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    // `transcriptVersionId` is a legitimate top-level DTO field (the pinned
    // pointer); tenant/persistence columns must NOT leak anywhere.
    for (const key of ["organizationId", "transcriptId", "id"]) expect(dto).not.toHaveProperty(key);
    for (const level of dto!.levels)
      for (const key of ["organizationId", "transcriptVersionId", "id"])
        expect(level).not.toHaveProperty(key);
    for (const subject of dto!.subjects)
      for (const key of ["organizationId", "transcriptVersionId", "id"])
        expect(subject).not.toHaveProperty(key);
    for (const a of dto!.assessments)
      for (const key of ["organizationId", "id"]) expect(a).not.toHaveProperty(key);
    for (const at of dto!.attendance)
      for (const key of ["organizationId", "transcriptVersionId", "id"])
        expect(at).not.toHaveProperty(key);
  });

  it("18. returns exactly the DTO shape (no extra top-level keys)", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { withChildren: true });
    const dto = await findIssuedTranscriptVersionForCertificate(params, asClient(db));
    expect(Object.keys(dto!).sort()).toEqual(
      [
        "assessments",
        "attendance",
        "courseProgressSnapshot",
        "courseSnapshot",
        "issuedAt",
        "issuedBy",
        "levels",
        "studentSnapshot",
        "subjects",
        "transcriptChecksum",
        "transcriptNumber",
        "transcriptStatus",
        "transcriptType",
        "transcriptVersionId",
      ].sort()
    );
  });
});

describe("findTranscriptVersionSummary", () => {
  it("returns lightweight metadata joined from version + root", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { withChildren: true });
    const summary = await findTranscriptVersionSummary(params, asClient(db));
    expect(summary).toEqual({
      transcriptVersionId: VERSION_ID,
      transcriptNumber: "TR-2026-000042",
      checksum: "chk-abc123",
      status: "ISSUED",
      issuedAt: new Date("2026-07-01T10:00:00.000Z"),
      studentId: "stu-1",
      courseId: "course-1",
    });
  });

  it("returns a summary regardless of status (exposes status for the caller to decide)", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { versionStatus: "DRAFT" });
    const summary = await findTranscriptVersionSummary(params, asClient(db));
    expect(summary!.status).toBe("DRAFT");
  });

  it("returns null for the wrong organization", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { organizationId: OTHER_ORG });
    expect(await findTranscriptVersionSummary(params, asClient(db))).toBeNull();
  });
});

describe("existsIssuedTranscript", () => {
  it("is true only for an ISSUED version in the same organization", async () => {
    const db = makeFakeDb();
    seedTranscript(db);
    expect(await existsIssuedTranscript(params, asClient(db))).toBe(true);
  });

  it("is false for a non-ISSUED version", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { versionStatus: "SUPERSEDED" });
    expect(await existsIssuedTranscript(params, asClient(db))).toBe(false);
  });

  it("is false across organizations and for a missing version", async () => {
    const db = makeFakeDb();
    seedTranscript(db, { organizationId: OTHER_ORG });
    expect(await existsIssuedTranscript(params, asClient(db))).toBe(false);
    expect(
      await existsIssuedTranscript({ organizationId: ORG, transcriptVersionId: "nope" }, asClient(db))
    ).toBe(false);
  });
});
