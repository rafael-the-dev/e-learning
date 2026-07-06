import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";
import { NotFoundError, NotImplementedError, ValidationError } from "@/shared/lib/command";
import { TranscriptDetailLevel, TranscriptType } from "@/modules/transcripts/constants";
import type { BuildTranscriptSnapshotInput } from "@/modules/transcripts/types";
import { buildTranscriptSnapshot } from "../transcript-snapshot-builder.service";

// =============================================================================
// TRANSCRIPT SNAPSHOT BUILDER — TESTS (Phase 3, spec §13)
// Uses the Phase-2 in-memory fake DB (which actually filters by `where`) as the
// source-repository client, so no real DB and no module mocks are needed.
// =============================================================================

const ORG = "org-A";
const OTHER_ORG = "org-B";
const STUDENT = "s-1";
const ENR = "enr-1";
const CL1 = "cl-1";
const CL2 = "cl-2";
const LS_CODIGO = "ls-codigo";
const LS_CONDUCAO = "ls-conducao";

const D = (iso: string) => new Date(iso);

/** Seed a two-level course transcript fixture. Rows are seeded out of natural
 *  order so the builder's own deterministic sort is what's being verified. */
function seedFixture(db: FakeDb, organizationId = ORG) {
  seed(db, "student", {
    id: STUDENT,
    organizationId,
    code: "AL-001",
    firstName: "Ana",
    lastName: "Silva",
    email: "ana@x.pt",
    dateOfBirth: D("2000-01-01"),
    idType: "BI",
    idNumber: "123456",
    status: "ACTIVE",
    deletedAt: null,
  });

  seed(db, "enrollment", {
    id: ENR,
    organizationId,
    studentId: STUDENT,
    courseId: "c-1",
    courseLevelId: CL1,
    academicYearId: "ay-1",
    academicTermId: "at-1",
    enrollmentNumber: "E-001",
    status: "ACTIVE",
    deletedAt: null,
    course: {
      id: "c-1",
      name: "Ligeiros B",
      code: "B",
      totalHours: 220,
      category: { id: "cat-1", name: "Automóvel" },
    },
  });

  seed(db, "studentCourseProgress", {
    id: "cp-1",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    courseId: "c-1",
    finalGrade: 15.5,
    earnedCredits: 20,
    status: "IN_PROGRESS",
    completedAt: null,
    calculatedAt: D("2026-06-01"),
  });

  // Levels seeded reversed (order 2 before order 1) to prove sort-by-levelOrder.
  seed(db, "studentLevelProgress", {
    id: "lp-2",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    courseId: "c-1",
    courseLevelId: CL2,
    finalGrade: null,
    earnedCredits: null,
    status: "IN_PROGRESS",
    completedAt: null,
    calculatedAt: null,
    createdAt: D("2026-03-01"),
    courseLevel: { id: CL2, name: "Nível 2", code: "N2", order: 2, totalHours: 120 },
  });
  seed(db, "studentLevelProgress", {
    id: "lp-1",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    courseId: "c-1",
    courseLevelId: CL1,
    finalGrade: 15,
    earnedCredits: 10,
    status: "COMPLETED",
    completedAt: D("2026-05-01"),
    calculatedAt: D("2026-05-01"),
    createdAt: D("2026-01-15"),
    courseLevel: { id: CL1, name: "Nível 1", code: "N1", order: 1, totalHours: 100 },
  });

  // Subjects (both in level 1) seeded reversed (order 2 before order 1).
  seed(db, "studentSubjectProgress", {
    id: "sp-codigo",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    levelSubjectId: LS_CODIGO,
    finalGrade: 14,
    attendancePercentage: 82, // stored on progress; must be copied verbatim
    status: "PASSED",
    completedAt: D("2026-04-20"),
    levelSubject: {
      id: LS_CODIGO,
      courseLevelId: CL1,
      order: 2,
      minimumPassingGrade: 10,
      minimumAttendancePercentage: 75,
      credits: 4,
      workloadHours: 40,
      isRequired: true,
      attendancePolicyId: "pol-1",
      subject: { id: "sub-codigo", name: "Código", code: "COD" },
    },
  });
  seed(db, "studentSubjectProgress", {
    id: "sp-conducao",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    levelSubjectId: LS_CONDUCAO,
    finalGrade: 8, // a FAILING grade — must NOT be re-derived/normalised
    attendancePercentage: 60,
    status: "FAILED",
    completedAt: null,
    levelSubject: {
      id: LS_CONDUCAO,
      courseLevelId: CL1,
      order: 1,
      minimumPassingGrade: 10,
      minimumAttendancePercentage: 75,
      credits: 6, // credits copied UNCONDITIONALLY even though the subject FAILED
      workloadHours: 60,
      isRequired: true,
      attendancePolicyId: "pol-1",
      subject: { id: "sub-conducao", name: "Condução", code: "CON" },
    },
  });

  // Assessment results for Código (DETAILED only). Component orders 2/1/3 to
  // prove sort-by-component-order; plus non-official rows that must be excluded.
  seed(db, "studentAssessmentResult", {
    id: "ar-teste",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    levelSubjectId: LS_CODIGO,
    subjectId: "sub-codigo",
    assessmentComponentId: "ac-teste",
    assessmentEventId: null,
    sourceType: "CONTINUOUS",
    grade: 14,
    maxGrade: 20,
    normalizedGrade: 14,
    status: "GRADED",
    gradedAt: D("2026-03-10"),
    assessmentComponent: { id: "ac-teste", name: "Teste", componentType: "TEST", order: 2 },
    assessmentEvent: null,
  });
  seed(db, "studentAssessmentResult", {
    id: "ar-exame",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    levelSubjectId: LS_CODIGO,
    subjectId: "sub-codigo",
    assessmentComponentId: "ac-exame",
    assessmentEventId: "ae-1",
    sourceType: "SCHEDULED_EVENT",
    grade: 16,
    maxGrade: 20,
    normalizedGrade: 16,
    status: "GRADED",
    gradedAt: D("2026-04-10"),
    assessmentComponent: { id: "ac-exame", name: "Exame", componentType: "FINAL_EXAM", order: 1 },
    assessmentEvent: { id: "ae-1", title: "Exame Final" },
  });
  seed(db, "studentAssessmentResult", {
    id: "ar-recup",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    levelSubjectId: LS_CODIGO,
    subjectId: "sub-codigo",
    assessmentComponentId: "ac-recup",
    assessmentEventId: null,
    sourceType: "RECOVERY",
    grade: 11,
    maxGrade: 20,
    normalizedGrade: 11,
    status: "GRADED",
    gradedAt: D("2026-05-05"),
    assessmentComponent: { id: "ac-recup", name: "Recuperação", componentType: "RECOVERY", order: 3 },
    assessmentEvent: null,
  });
  seed(db, "studentAssessmentResult", {
    id: "ar-cancelled",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    levelSubjectId: LS_CODIGO,
    subjectId: "sub-codigo",
    assessmentComponentId: "ac-x",
    assessmentEventId: null,
    sourceType: "CONTINUOUS",
    grade: 3,
    maxGrade: 20,
    normalizedGrade: 3,
    status: "CANCELLED", // excluded
    gradedAt: D("2026-03-01"),
    assessmentComponent: { id: "ac-x", name: "Anulado", componentType: "TEST", order: 5 },
    assessmentEvent: null,
  });
  seed(db, "studentAssessmentResult", {
    id: "ar-draft",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    levelSubjectId: LS_CODIGO,
    subjectId: "sub-codigo",
    assessmentComponentId: "ac-y",
    assessmentEventId: null,
    sourceType: "CONTINUOUS",
    grade: 0,
    maxGrade: 20,
    normalizedGrade: 0,
    status: "DRAFT", // excluded
    gradedAt: null,
    assessmentComponent: { id: "ac-y", name: "Rascunho", componentType: "TEST", order: 6 },
    assessmentEvent: null,
  });

  // Subject attendance summary for Código only (Condução has none → null).
  // present/scheduled deliberately imply 80% while the stored percentage is 77
  // — proves the builder copies the stored value and does NOT recompute.
  seed(db, "studentSubjectAttendanceSummary", {
    id: "sas-codigo",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    levelSubjectId: LS_CODIGO,
    attendancePolicyId: "pol-1",
    totalSessions: 10,
    totalScheduledMinutes: 600,
    totalPresentMinutes: 480,
    attendancePercentage: 77,
    status: "SUFFICIENT",
    calculatedAt: D("2026-05-01"),
    attendancePolicy: { id: "pol-1", name: "Padrão" },
    levelSubject: { minimumAttendancePercentage: 75 },
  });

  seed(db, "studentPeriodAttendanceSummary", {
    id: "pas-1",
    organizationId,
    enrollmentId: ENR,
    studentId: STUDENT,
    courseId: "c-1",
    courseLevelId: CL1,
    academicYearId: "ay-1",
    academicTermId: "at-1",
    totalSessions: 40,
    totalScheduledMinutes: 2400,
    totalPresentMinutes: 1900,
    attendancePercentage: 79,
    status: "AT_RISK",
    calculatedAt: D("2026-05-02"),
  });
}

function input(overrides: Partial<BuildTranscriptSnapshotInput> = {}): BuildTranscriptSnapshotInput {
  return {
    organizationId: ORG,
    studentId: STUDENT,
    enrollmentId: ENR,
    transcriptType: TranscriptType.COURSE_TRANSCRIPT,
    detailLevel: TranscriptDetailLevel.DETAILED,
    snapshotDate: D("2026-06-15T00:00:00.000Z"),
    ...overrides,
  };
}

let db: FakeDb;
beforeEach(() => {
  db = makeFakeDb();
});

describe("buildTranscriptSnapshot — COURSE_TRANSCRIPT (tests #1–#7)", () => {
  it("#1 builds a snapshot from source data with frozen envelope", async () => {
    seedFixture(db);
    const payload = await buildTranscriptSnapshot(input(), asClient(db));

    expect(payload.transcriptType).toBe(TranscriptType.COURSE_TRANSCRIPT);
    expect(payload.scope).toMatchObject({ enrollmentId: ENR, courseId: "c-1" });
    expect(payload.snapshotDate).toEqual(D("2026-06-15T00:00:00.000Z"));
    expect(payload.levels).toHaveLength(2);
    expect(payload.metadata).toMatchObject({
      detailLevel: "DETAILED",
      levelCount: 2,
      subjectCount: 2,
      assessmentCount: 3,
      periodAttendanceCount: 1,
    });
  });

  it("#2 copies progress values verbatim (course/level/subject)", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));

    expect(p.courseProgressSnapshot).toMatchObject({ finalGrade: 15.5, earnedCredits: 20, status: "IN_PROGRESS" });

    const level1 = p.levels.find((l) => l.courseLevelId === CL1)!;
    expect(level1).toMatchObject({ finalGrade: 15, status: "COMPLETED", earnedCredits: 10 });

    const codigo = level1.subjects.find((s) => s.subjectName === "Código")!;
    const conducao = level1.subjects.find((s) => s.subjectName === "Condução")!;
    expect(codigo).toMatchObject({ finalGrade: 14, status: "PASSED" });
    expect(conducao).toMatchObject({ finalGrade: 8, status: "FAILED" });
  });

  it("#3 does not recalculate grades (a FAILED subject keeps its stored grade/status)", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));
    const conducao = p.levels
      .flatMap((l) => l.subjects)
      .find((s) => s.subjectName === "Condução")!;
    // grade 8 < minimumPassingGrade 10, yet status is copied ("FAILED"), not re-derived,
    // and the grade is not clamped/normalised.
    expect(conducao.finalGrade).toBe(8);
    expect(conducao.status).toBe("FAILED");
    expect(conducao.minimumPassingGrade).toBe(10);
  });

  it("#4 does not recalculate attendance (copies stored percentages, ignores minutes)", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));
    const codigo = p.levels.flatMap((l) => l.subjects).find((s) => s.subjectName === "Código")!;
    // subjectProgress.attendancePercentage copied verbatim
    expect(codigo.attendancePercentage).toBe(82);
    // summary percentage 77 copied verbatim even though 480/600 = 80%
    expect(codigo.attendance).not.toBeNull();
    expect(codigo.attendance!.attendancePercentage).toBe(77);
    expect(codigo.attendance!.totalPresentMinutes).toBe(480);
    expect(codigo.attendance!.totalScheduledMinutes).toBe(600);
    // period attendance copied verbatim
    expect(p.periodAttendances[0].attendancePercentage).toBe(79);
  });

  it("#5 copies credits unconditionally from LevelSubject.credits (even when FAILED)", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));
    const conducao = p.levels.flatMap((l) => l.subjects).find((s) => s.subjectName === "Condução")!;
    expect(conducao.status).toBe("FAILED");
    expect(conducao.earnedCredits).toBe(6); // identity credits, not derived from pass/fail
  });

  it("#6 freezes student/course/level/subject identity into the payload", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));

    expect(p.studentSnapshot).toMatchObject({
      studentId: STUDENT,
      studentCode: "AL-001",
      firstName: "Ana",
      lastName: "Silva",
      fullName: "Ana Silva",
      idNumber: "123456",
    });
    expect(p.courseSnapshot).toMatchObject({
      courseName: "Ligeiros B",
      courseCode: "B",
      category: "Automóvel",
      categoryId: "cat-1",
    });
    const level1 = p.levels.find((l) => l.courseLevelId === CL1)!;
    expect(level1).toMatchObject({ levelName: "Nível 1", levelCode: "N1", levelOrder: 1 });
    expect(level1.subjects.map((s) => s.subjectName)).toContain("Código");
  });

  it("#7 orders levels, subjects and assessments deterministically", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));

    // levels by levelOrder asc
    expect(p.levels.map((l) => l.levelOrder)).toEqual([1, 2]);

    // subjects by subjectOrder asc (Condução order 1 before Código order 2)
    const level1 = p.levels[0];
    expect(level1.subjects.map((s) => s.subjectName)).toEqual(["Condução", "Código"]);

    // assessments by component order asc (Exame 1, Teste 2, Recuperação 3)
    const codigo = level1.subjects.find((s) => s.subjectName === "Código")!;
    expect(codigo.assessments!.map((a) => a.componentName)).toEqual(["Exame", "Teste", "Recuperação"]);
  });

  it("startedAt is derived from level progress createdAt (documented derivation)", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));
    const level1 = p.levels.find((l) => l.courseLevelId === CL1)!;
    expect(level1.startedAt).toEqual(D("2026-01-15"));
  });
});

describe("buildTranscriptSnapshot — SUMMARY vs DETAILED (tests #8–#11)", () => {
  it("#8 SUMMARY excludes assessment component rows", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(
      input({ detailLevel: TranscriptDetailLevel.SUMMARY }),
      asClient(db)
    );
    const subjects = p.levels.flatMap((l) => l.subjects);
    for (const s of subjects) expect(s.assessments).toBeUndefined();
    // but subject + period attendance are still present in SUMMARY
    const codigo = subjects.find((s) => s.subjectName === "Código")!;
    expect(codigo.attendance).not.toBeNull();
    expect(p.periodAttendances).toHaveLength(1);
    expect(p.metadata.assessmentCount).toBe(0);
  });

  it("#9/#10 DETAILED includes only GRADED results, excluding CANCELLED/DRAFT", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));
    const codigo = p.levels.flatMap((l) => l.subjects).find((s) => s.subjectName === "Código")!;
    expect(codigo.assessments).toHaveLength(3);
    for (const a of codigo.assessments!) expect(a.status).toBe("GRADED");
    expect(codigo.assessments!.map((a) => a.studentAssessmentResultId)).not.toContain("ar-cancelled");
    expect(codigo.assessments!.map((a) => a.studentAssessmentResultId)).not.toContain("ar-draft");
  });

  it("#11 includes a recovery result when sourceType=RECOVERY and status=GRADED", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));
    const codigo = p.levels.flatMap((l) => l.subjects).find((s) => s.subjectName === "Código")!;
    const recovery = codigo.assessments!.find((a) => a.sourceType === "RECOVERY")!;
    expect(recovery).toBeDefined();
    expect(recovery.isRecovery).toBe(true);
    expect(recovery.grade).toBe(11);
  });
});

describe("buildTranscriptSnapshot — optional data + errors (tests #12–#14)", () => {
  it("#12 missing subject attendance yields null (not invented values)", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(input(), asClient(db));
    const conducao = p.levels.flatMap((l) => l.subjects).find((s) => s.subjectName === "Condução")!;
    expect(conducao.attendance).toBeNull();
  });

  it("optional course progress absent yields null courseProgressSnapshot", async () => {
    seedFixture(db);
    // wipe the single course-progress row
    db.studentCourseProgress.__store.length = 0;
    const p = await buildTranscriptSnapshot(input(), asClient(db));
    expect(p.courseProgressSnapshot).toBeNull();
  });

  it("#13 throws NotFoundError for a missing student", async () => {
    // enrollment present, student absent
    seedFixture(db);
    db.student.__store.length = 0;
    await expect(buildTranscriptSnapshot(input(), asClient(db))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("#13 throws NotFoundError for a missing enrollment", async () => {
    seedFixture(db);
    db.enrollment.__store.length = 0;
    await expect(buildTranscriptSnapshot(input(), asClient(db))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("#13 does not read another org's data (tenant isolation via source repo)", async () => {
    seedFixture(db, OTHER_ORG);
    // request under ORG, but all data belongs to OTHER_ORG → student not found
    await expect(buildTranscriptSnapshot(input(), asClient(db))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("#14 fails fast with NotImplementedError for FULL_ACADEMIC_HISTORY", async () => {
    await expect(
      buildTranscriptSnapshot(
        input({ transcriptType: TranscriptType.FULL_ACADEMIC_HISTORY, enrollmentId: null }),
        asClient(db)
      )
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("#14 fails fast with NotImplementedError for TERM_REPORT", async () => {
    await expect(
      buildTranscriptSnapshot(input({ transcriptType: TranscriptType.TERM_REPORT }), asClient(db))
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("#14 throws ValidationError for an unknown transcriptType", async () => {
    await expect(
      buildTranscriptSnapshot(input({ transcriptType: "NONSENSE" }), asClient(db))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when COURSE_TRANSCRIPT is missing enrollmentId", async () => {
    await expect(
      buildTranscriptSnapshot(input({ enrollmentId: null }), asClient(db))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for an unknown detailLevel", async () => {
    seedFixture(db);
    await expect(
      buildTranscriptSnapshot(
        input({ detailLevel: "FULL" as unknown as typeof TranscriptDetailLevel.SUMMARY }),
        asClient(db)
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("buildTranscriptSnapshot — scoped types (LEVEL_TRANSCRIPT / SUBJECT_REPORT)", () => {
  it("LEVEL_TRANSCRIPT keeps only the scoped courseLevel", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(
      input({ transcriptType: TranscriptType.LEVEL_TRANSCRIPT, scopeRef: CL1 }),
      asClient(db)
    );
    expect(p.levels.map((l) => l.courseLevelId)).toEqual([CL1]);
    expect(p.scope.courseLevelId).toBe(CL1);
  });

  it("SUBJECT_REPORT keeps only the scoped subject", async () => {
    seedFixture(db);
    const p = await buildTranscriptSnapshot(
      input({ transcriptType: TranscriptType.SUBJECT_REPORT, scopeRef: LS_CONDUCAO }),
      asClient(db)
    );
    const subjects = p.levels.flatMap((l) => l.subjects);
    expect(subjects).toHaveLength(1);
    expect(subjects[0].levelSubjectId).toBe(LS_CONDUCAO);
    expect(p.scope.levelSubjectId).toBe(LS_CONDUCAO);
  });

  it("LEVEL_TRANSCRIPT requires scopeRef", async () => {
    seedFixture(db);
    await expect(
      buildTranscriptSnapshot(input({ transcriptType: TranscriptType.LEVEL_TRANSCRIPT }), asClient(db))
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// =============================================================================
// ARCHITECTURE GUARDS (tests #21–#27) — the builder is pure, read-only, no writes
// =============================================================================

const BUILDER_SRC = readFileSync(
  join(process.cwd(), "src", "modules", "transcripts", "services", "transcript-snapshot-builder.service.ts"),
  "utf8"
);

describe("architecture guards — builder carries no writes / no engines (tests #21–#27)", () => {
  const FORBIDDEN: Array<[string, RegExp]> = [
    ["#21 GradeCalculationService", /GradeCalculation|grade-calculation/],
    ["#22 AttendanceCalculationEngine", /AttendanceCalculation|attendance-calculation|RecalculateAttendance/],
    ["#23 CourseCompletionEngine", /CourseCompletion|course-completion/],
    ["#24 eventPublisher/auditService", /eventPublisher|EventPublisher|publishDomainEvent|auditService|AuditService/],
    ["#26 transcript number allocator", /allocateTranscriptNumber|transcript-number/],
  ];
  for (const [label, pattern] of FORBIDDEN) {
    it(`${label} not referenced`, () => {
      expect(BUILDER_SRC).not.toMatch(pattern);
    });
  }

  it("#25 does not import write repositories (root/version/snapshot create/update)", () => {
    expect(BUILDER_SRC).not.toMatch(/academic-transcript\.repository/);
    expect(BUILDER_SRC).not.toMatch(/academic-transcript-version\.repository/);
    expect(BUILDER_SRC).not.toMatch(/academic-transcript-snapshot\.repository/);
    // the ONLY repository import allowed is the read-only source repository
    expect(BUILDER_SRC).toMatch(/academic-transcript-source\.repository/);
  });

  it("#27 does not write to the DB (no getDb, no create/update/delete calls)", () => {
    expect(BUILDER_SRC).not.toMatch(/getDb\s*\(/);
    expect(BUILDER_SRC).not.toMatch(/\.create\s*\(/);
    expect(BUILDER_SRC).not.toMatch(/\.createMany\s*\(/);
    expect(BUILDER_SRC).not.toMatch(/\.update\s*\(/);
    expect(BUILDER_SRC).not.toMatch(/\.updateMany\s*\(/);
    expect(BUILDER_SRC).not.toMatch(/\.delete\s*\(/);
    expect(BUILDER_SRC).not.toMatch(/\$transaction|\$queryRaw|\$executeRaw/);
  });
});
