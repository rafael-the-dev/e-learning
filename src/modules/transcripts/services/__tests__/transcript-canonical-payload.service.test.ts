import { describe, expect, it } from "vitest";
import { TranscriptDetailLevel, TranscriptType } from "@/modules/transcripts/constants";
import type {
  TranscriptLevelSnapshot,
  TranscriptSnapshotPayload,
} from "@/modules/transcripts/types";
import {
  canonicalTranscriptString,
  toCanonicalTranscriptContent,
  transcriptContentChecksum,
} from "../transcript-canonical-payload.service";

// =============================================================================
// TRANSCRIPT CANONICAL PAYLOAD SERVICE — TESTS (Phase 3, spec §13 #15–#20)
// The service delegates canonicalization to @/shared/lib/checksum; these tests
// assert the delegation + the content/envelope split behave as specified.
// =============================================================================

const D = (iso: string) => new Date(iso);

function level(courseLevelId: string, levelOrder: number, finalGrade: number | null): TranscriptLevelSnapshot {
  return {
    courseLevelId,
    levelName: `Nível ${levelOrder}`,
    levelCode: `N${levelOrder}`,
    levelOrder,
    finalGrade,
    status: "COMPLETED",
    completedAt: D("2026-05-01"),
    startedAt: D("2026-01-01"),
    earnedCredits: 10,
    workloadHours: 100,
    subjects: [],
  };
}

function basePayload(): TranscriptSnapshotPayload {
  return {
    transcriptType: TranscriptType.COURSE_TRANSCRIPT,
    scope: {
      enrollmentId: "e1",
      courseId: "c1",
      courseLevelId: null,
      academicTermId: null,
      levelSubjectId: null,
    },
    snapshotDate: D("2026-06-15T00:00:00.000Z"),
    studentSnapshot: {
      studentId: "s1",
      studentCode: "AL-001",
      firstName: "Ana",
      lastName: "Silva",
      fullName: "Ana Silva",
      dateOfBirth: D("2000-01-01"),
      idType: "BI",
      idNumber: "123",
      status: "ACTIVE",
    },
    courseSnapshot: {
      courseId: "c1",
      courseName: "Ligeiros",
      courseCode: "B",
      categoryId: "cat1",
      category: "Automóvel",
      totalHours: 220,
      enrollmentId: "e1",
      enrollmentNumber: "E-001",
      academicYearId: "ay1",
      academicTermId: null,
      enrollmentStatus: "ACTIVE",
    },
    courseProgressSnapshot: {
      finalGrade: 15,
      earnedCredits: 10,
      status: "IN_PROGRESS",
      completedAt: null,
      calculatedAt: null,
    },
    levels: [level("cl1", 1, 14), level("cl2", 2, null)],
    periodAttendances: [],
    metadata: {
      detailLevel: TranscriptDetailLevel.DETAILED,
      generatedBy: "user-1",
      builderVersion: "1.0.0",
      levelCount: 2,
      subjectCount: 0,
      assessmentCount: 0,
      periodAttendanceCount: 0,
    },
  };
}

describe("canonical payload — determinism (#15, #20)", () => {
  it("#15 same data, different object-key insertion order => identical canonical output", () => {
    const a = basePayload();
    const b = basePayload();
    // Rebuild studentSnapshot with keys inserted in reverse order.
    b.studentSnapshot = Object.fromEntries(
      Object.entries(a.studentSnapshot).reverse()
    ) as typeof a.studentSnapshot;

    expect(canonicalTranscriptString(b)).toBe(canonicalTranscriptString(a));
    expect(transcriptContentChecksum(b)).toBe(transcriptContentChecksum(a));
  });

  it("#20 checksum is stable across repeated calls", () => {
    const p = basePayload();
    const c1 = transcriptContentChecksum(p);
    const c2 = transcriptContentChecksum(p);
    const c3 = transcriptContentChecksum(basePayload());
    expect(c1).toBe(c2);
    expect(c1).toBe(c3);
    expect(c1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("canonical payload — value normalization (#16, #17)", () => {
  it("#16 Decimal 1.50 and number 1.5 normalize identically", () => {
    const decimalLike = { toString: () => "1.50", toFixed: (n: number) => (1.5).toFixed(n) };

    const withDecimal = basePayload();
    withDecimal.levels = [level("cl1", 1, decimalLike as unknown as number)];
    const withNumber = basePayload();
    withNumber.levels = [level("cl1", 1, 1.5)];

    expect(canonicalTranscriptString(withDecimal)).toBe(canonicalTranscriptString(withNumber));
    expect(transcriptContentChecksum(withDecimal)).toBe(transcriptContentChecksum(withNumber));
  });

  it("#17 Dates normalize to ISO (equal instants => equal digest)", () => {
    const a = basePayload();
    const b = basePayload();
    // distinct Date object, same instant
    b.studentSnapshot = { ...b.studentSnapshot, dateOfBirth: new Date("2000-01-01T00:00:00.000Z") };
    a.studentSnapshot = { ...a.studentSnapshot, dateOfBirth: new Date("2000-01-01T00:00:00.000Z") };
    expect(transcriptContentChecksum(a)).toBe(transcriptContentChecksum(b));
    expect(canonicalTranscriptString(a)).toContain("2000-01-01T00:00:00.000Z");
  });
});

describe("canonical payload — null vs undefined & array order (#18, #19)", () => {
  it("#18 null is preserved, undefined is omitted (they differ)", () => {
    const withNull = basePayload();
    withNull.courseProgressSnapshot = {
      finalGrade: 15,
      earnedCredits: 10,
      status: "IN_PROGRESS",
      completedAt: null,
      calculatedAt: null,
    };
    const withUndefined = basePayload();
    withUndefined.courseProgressSnapshot = {
      finalGrade: 15,
      earnedCredits: 10,
      status: "IN_PROGRESS",
      completedAt: undefined as unknown as null,
      calculatedAt: null,
    };

    const nullStr = canonicalTranscriptString(withNull);
    const undefStr = canonicalTranscriptString(withUndefined);
    const count = (s: string, sub: string) => s.split(sub).length - 1;

    expect(nullStr).not.toBe(undefStr);
    // the null variant keeps courseProgress.completedAt; the undefined variant omits it,
    // so `completedAt` appears exactly one fewer time (levels contribute equally to both).
    expect(count(undefStr, '"completedAt"')).toBe(count(nullStr, '"completedAt"') - 1);
    expect(nullStr).toContain('"completedAt":null');
  });

  it("#19 array order is significant", () => {
    const a = basePayload();
    const b = basePayload();
    b.levels = [...a.levels].reverse();
    expect(canonicalTranscriptString(b)).not.toBe(canonicalTranscriptString(a));
  });
});

describe("canonical payload — content/envelope split", () => {
  it("excludes snapshotDate, generatedBy and metadata from the checksum", () => {
    const a = basePayload();
    const b = basePayload();
    b.snapshotDate = D("2027-01-01T00:00:00.000Z"); // different day
    b.metadata = { ...b.metadata, generatedBy: "someone-else", subjectCount: 999 };

    // identical academic content ⇒ identical checksum despite envelope differences
    expect(transcriptContentChecksum(b)).toBe(transcriptContentChecksum(a));

    const content = toCanonicalTranscriptContent(a) as Record<string, unknown>;
    expect(content).not.toHaveProperty("snapshotDate");
    expect(content).not.toHaveProperty("metadata");
    // detailLevel IS included (it is content-relevant)
    expect(content).toHaveProperty("detailLevel", TranscriptDetailLevel.DETAILED);
  });

  it("SUMMARY vs DETAILED produce different checksums for the same source data", () => {
    const summary = basePayload();
    summary.metadata = { ...summary.metadata, detailLevel: TranscriptDetailLevel.SUMMARY };
    const detailed = basePayload(); // DETAILED
    expect(transcriptContentChecksum(summary)).not.toBe(transcriptContentChecksum(detailed));
  });
});
