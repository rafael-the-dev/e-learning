import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// ── module mocks (hoisted) ───────────────────────────────────────────────────
const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => h.db),
}));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({ can: () => true }),
}));

import { NotFoundError, NotImplementedError, ValidationError } from "@/shared/lib/command";
import { TranscriptDetailLevel, TranscriptType } from "@/modules/transcripts/constants";
import * as builderService from "../../services/transcript-snapshot-builder.service";
import { transcriptContentChecksum } from "../../services/transcript-canonical-payload.service";
import type { ServiceContext } from "@/shared/types/common";
import type { GenerateTranscriptSnapshotSchema } from "@/modules/transcripts/schemas/transcript.schema";
import { GenerateTranscriptSnapshotCommand } from "../generate-transcript-snapshot.command";

// =============================================================================
// GenerateTranscriptSnapshotCommand — TESTS (Phase 4, spec §TESTS 1–20 + guards)
// Real Builder + real repositories run against the in-memory fake DB (with true
// rollback semantics). Only @/server/db and rbac are mocked.
// =============================================================================

const ORG = "org-A";
const OTHER_ORG = "org-B";
const STUDENT = "s-1";
const ENR = "enr-1";
const CL1 = "cl-1";
const LS_A = "ls-a";
const LS_B = "ls-b";
const D = (iso: string) => new Date(iso);
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };

function seedFixture(db: FakeDb, organizationId = ORG) {
  seed(db, "student", {
    id: STUDENT, organizationId, code: "AL-001", firstName: "Ana", lastName: "Silva",
    email: "ana@x.pt", dateOfBirth: D("2000-01-01"), idType: "BI", idNumber: "123",
    status: "ACTIVE", deletedAt: null,
  });
  seed(db, "enrollment", {
    id: ENR, organizationId, studentId: STUDENT, courseId: "c-1", courseLevelId: CL1,
    academicYearId: "ay-1", academicTermId: "at-1", enrollmentNumber: "E-001",
    status: "ACTIVE", deletedAt: null,
    course: { id: "c-1", name: "Ligeiros B", code: "B", totalHours: 220, category: { id: "cat-1", name: "Automóvel" } },
  });
  seed(db, "studentCourseProgress", {
    id: "cp-1", organizationId, enrollmentId: ENR, studentId: STUDENT, courseId: "c-1",
    finalGrade: 15.5, earnedCredits: 20, status: "IN_PROGRESS", completedAt: null, calculatedAt: D("2026-06-01"),
  });
  seed(db, "studentLevelProgress", {
    id: "lp-1", organizationId, enrollmentId: ENR, studentId: STUDENT, courseId: "c-1", courseLevelId: CL1,
    finalGrade: 15, earnedCredits: 10, status: "COMPLETED", completedAt: D("2026-05-01"),
    calculatedAt: D("2026-05-01"), createdAt: D("2026-01-15"),
    courseLevel: { id: CL1, name: "Nível 1", code: "N1", order: 1, totalHours: 100 },
  });
  seed(db, "studentSubjectProgress", {
    id: "sp-a", organizationId, enrollmentId: ENR, studentId: STUDENT, levelSubjectId: LS_A,
    finalGrade: 14, attendancePercentage: 82, status: "PASSED", completedAt: D("2026-04-20"),
    levelSubject: {
      id: LS_A, courseLevelId: CL1, order: 1, minimumPassingGrade: 10, minimumAttendancePercentage: 75,
      credits: 4, workloadHours: 40, isRequired: true, attendancePolicyId: "pol-1",
      subject: { id: "sub-a", name: "Código", code: "COD" },
    },
  });
  seed(db, "studentSubjectProgress", {
    id: "sp-b", organizationId, enrollmentId: ENR, studentId: STUDENT, levelSubjectId: LS_B,
    finalGrade: 8, attendancePercentage: 60, status: "FAILED", completedAt: null,
    levelSubject: {
      id: LS_B, courseLevelId: CL1, order: 2, minimumPassingGrade: 10, minimumAttendancePercentage: 75,
      credits: 6, workloadHours: 60, isRequired: true, attendancePolicyId: "pol-1",
      subject: { id: "sub-b", name: "Condução", code: "CON" },
    },
  });
  // GRADED assessments for subject A (+ one CANCELLED that must be excluded)
  seed(db, "studentAssessmentResult", {
    id: "ar-1", organizationId, enrollmentId: ENR, studentId: STUDENT, levelSubjectId: LS_A, subjectId: "sub-a",
    assessmentComponentId: "ac-1", assessmentEventId: null, sourceType: "CONTINUOUS",
    grade: 14, maxGrade: 20, normalizedGrade: 14, status: "GRADED", gradedAt: D("2026-03-10"),
    assessmentComponent: { id: "ac-1", name: "Teste", componentType: "TEST", order: 2 }, assessmentEvent: null,
  });
  seed(db, "studentAssessmentResult", {
    id: "ar-2", organizationId, enrollmentId: ENR, studentId: STUDENT, levelSubjectId: LS_A, subjectId: "sub-a",
    assessmentComponentId: "ac-2", assessmentEventId: "ae-1", sourceType: "SCHEDULED_EVENT",
    grade: 16, maxGrade: 20, normalizedGrade: 16, status: "GRADED", gradedAt: D("2026-04-10"),
    assessmentComponent: { id: "ac-2", name: "Exame", componentType: "FINAL_EXAM", order: 1 },
    assessmentEvent: { id: "ae-1", title: "Exame Final" },
  });
  seed(db, "studentAssessmentResult", {
    id: "ar-x", organizationId, enrollmentId: ENR, studentId: STUDENT, levelSubjectId: LS_A, subjectId: "sub-a",
    assessmentComponentId: "ac-x", assessmentEventId: null, sourceType: "CONTINUOUS",
    grade: 3, maxGrade: 20, normalizedGrade: 3, status: "CANCELLED", gradedAt: D("2026-03-01"),
    assessmentComponent: { id: "ac-x", name: "Anulado", componentType: "TEST", order: 5 }, assessmentEvent: null,
  });
  // subject attendance for A only
  seed(db, "studentSubjectAttendanceSummary", {
    id: "sas-a", organizationId, enrollmentId: ENR, studentId: STUDENT, levelSubjectId: LS_A, attendancePolicyId: "pol-1",
    totalSessions: 10, totalScheduledMinutes: 600, totalPresentMinutes: 480, attendancePercentage: 77,
    status: "SUFFICIENT", calculatedAt: D("2026-05-01"),
    attendancePolicy: { id: "pol-1", name: "Padrão" }, levelSubject: { minimumAttendancePercentage: 75 },
  });
  seed(db, "studentPeriodAttendanceSummary", {
    id: "pas-1", organizationId, enrollmentId: ENR, studentId: STUDENT, courseId: "c-1", courseLevelId: CL1,
    academicYearId: "ay-1", academicTermId: "at-1", totalSessions: 40, totalScheduledMinutes: 2400,
    totalPresentMinutes: 1900, attendancePercentage: 79, status: "AT_RISK", calculatedAt: D("2026-05-02"),
  });
}

function input(overrides: Partial<GenerateTranscriptSnapshotSchema> = {}): GenerateTranscriptSnapshotSchema {
  return {
    studentId: STUDENT,
    enrollmentId: ENR,
    transcriptType: TranscriptType.COURSE_TRANSCRIPT,
    detailLevel: TranscriptDetailLevel.DETAILED,
    snapshotDate: D("2026-06-15T00:00:00.000Z"),
    ...overrides,
  } as GenerateTranscriptSnapshotSchema;
}

function run(overrides: Partial<GenerateTranscriptSnapshotSchema> = {}) {
  return new GenerateTranscriptSnapshotCommand(input(overrides), ctx).run();
}

const store = (name: string) => h.db[name].__store;

beforeEach(() => {
  h.db = makeFakeDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GenerateTranscriptSnapshotCommand — supported types (#1–#4)", () => {
  it("#1 generates a COURSE_TRANSCRIPT DRAFT (root + version + snapshot rows)", async () => {
    seedFixture(h.db);
    const { transcript, version } = await run();

    expect(transcript.status).toBe("DRAFT");
    expect(transcript.transcriptType).toBe(TranscriptType.COURSE_TRANSCRIPT);
    expect(version.status).toBe("DRAFT");
    expect(version.versionNumber).toBe(1);
    expect(version.issuedAt).toBeNull();
    expect(version.supersededAt).toBeNull();
    expect(version.revokedAt).toBeNull();

    expect(store("academicTranscript")).toHaveLength(1);
    expect(store("academicTranscriptVersion")).toHaveLength(1);
    expect(store("academicTranscriptLevel")).toHaveLength(1);
    expect(store("academicTranscriptSubject")).toHaveLength(2);
    expect(store("academicTranscriptAssessment")).toHaveLength(2); // GRADED only
    expect(store("academicTranscriptAttendance")).toHaveLength(2); // 1 subject + 1 period
  });

  it("#2 generates a LEVEL_TRANSCRIPT scoped to one level", async () => {
    seedFixture(h.db);
    const { transcript } = await run({ transcriptType: TranscriptType.LEVEL_TRANSCRIPT, scopeRef: CL1 });
    expect(transcript.transcriptType).toBe(TranscriptType.LEVEL_TRANSCRIPT);
    expect(transcript.scopeCourseLevelId).toBe(CL1);
    expect(store("academicTranscriptLevel")).toHaveLength(1);
  });

  it("#3 generates a SUBJECT_REPORT scoped to one subject", async () => {
    seedFixture(h.db);
    const { transcript } = await run({ transcriptType: TranscriptType.SUBJECT_REPORT, scopeRef: LS_B });
    expect(transcript.scopeLevelSubjectId).toBe(LS_B);
    expect(store("academicTranscriptSubject")).toHaveLength(1);
    expect((store("academicTranscriptSubject")[0] as { levelSubjectId: string }).levelSubjectId).toBe(LS_B);
  });

  it("#4 generates a CERTIFICATE_SUPPORT DRAFT (facts only, no eligibility decision)", async () => {
    seedFixture(h.db);
    const { transcript, version } = await run({ transcriptType: TranscriptType.CERTIFICATE_SUPPORT });
    expect(transcript.transcriptType).toBe(TranscriptType.CERTIFICATE_SUPPORT);
    expect(transcript.status).toBe("DRAFT");
    expect(version.status).toBe("DRAFT");
  });
});

describe("GenerateTranscriptSnapshotCommand — unsupported types + errors (#5, #16–#18)", () => {
  it("#5 FULL_ACADEMIC_HISTORY throws NotImplementedError", async () => {
    seedFixture(h.db);
    await expect(
      run({ transcriptType: TranscriptType.FULL_ACADEMIC_HISTORY, enrollmentId: null })
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
  it("#5 TERM_REPORT throws NotImplementedError", async () => {
    seedFixture(h.db);
    await expect(run({ transcriptType: TranscriptType.TERM_REPORT })).rejects.toBeInstanceOf(NotImplementedError);
  });
  it("#16 missing student throws NotFoundError", async () => {
    seedFixture(h.db);
    store("student").length = 0;
    await expect(run()).rejects.toBeInstanceOf(NotFoundError);
  });
  it("#17 missing enrollment throws NotFoundError", async () => {
    seedFixture(h.db);
    store("enrollment").length = 0;
    await expect(run()).rejects.toBeInstanceOf(NotFoundError);
  });
  it("#18 missing source (whole other org) throws NotFoundError", async () => {
    seedFixture(h.db, OTHER_ORG);
    await expect(run()).rejects.toBeInstanceOf(NotFoundError);
  });
  it("COURSE_TRANSCRIPT without enrollmentId throws ValidationError", async () => {
    await expect(run({ enrollmentId: null })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("GenerateTranscriptSnapshotCommand — checksum + builder (#7, #8, #14)", () => {
  it("#7 persists the checksum computed from the canonical payload", async () => {
    seedFixture(h.db);
    const { version } = await run();
    expect(version.checksum).toMatch(/^[0-9a-f]{64}$/);

    // Recompute independently from a fresh deterministic build → must match.
    const rebuilt = await builderService.buildTranscriptSnapshot(
      {
        organizationId: ORG, studentId: STUDENT, enrollmentId: ENR, courseId: null,
        transcriptType: TranscriptType.COURSE_TRANSCRIPT, scopeRef: null,
        detailLevel: TranscriptDetailLevel.DETAILED, snapshotDate: D("2026-06-15T00:00:00.000Z"),
        generatedBy: ctx.userId,
      },
      asClient(h.db)
    );
    expect(version.checksum).toBe(transcriptContentChecksum(rebuilt));
  });

  it("#8 invokes the Snapshot Builder exactly once", async () => {
    seedFixture(h.db);
    const spy = vi.spyOn(builderService, "buildTranscriptSnapshot");
    await run();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("#14 does not mutate the Builder payload during persistence", async () => {
    seedFixture(h.db);
    const original = builderService.buildTranscriptSnapshot;
    let captured: unknown;
    let clone: unknown;
    vi.spyOn(builderService, "buildTranscriptSnapshot").mockImplementation(async (...args) => {
      const payload = await original(...args);
      captured = payload;
      clone = structuredClone(payload);
      return payload;
    });
    await run();
    expect(captured).toEqual(clone); // unchanged after all snapshot writes
  });
});

describe("GenerateTranscriptSnapshotCommand — persistence order + immutability (#9, #13)", () => {
  it("#9/#13 inserts snapshot rows in order Level → Subject → Assessment → Attendance", async () => {
    seedFixture(h.db);
    const models = [
      "academicTranscript",
      "academicTranscriptVersion",
      "academicTranscriptLevel",
      "academicTranscriptSubject",
      "academicTranscriptAssessment",
      "academicTranscriptAttendance",
    ];
    const callLog: string[] = [];
    for (const name of models) {
      const model = h.db[name];
      const orig = model.create.bind(model);
      model.create = async (args: Parameters<typeof orig>[0]) => {
        callLog.push(name);
        return orig(args);
      };
    }

    await run();

    const firstSeen = models.filter((m) => callLog.includes(m));
    expect(firstSeen).toEqual(models); // root, version, then Level→Subject→Assessment→Attendance
    // snapshot rows actually inserted
    expect(store("academicTranscriptLevel").length).toBeGreaterThan(0);
    expect(store("academicTranscriptAssessment").length).toBeGreaterThan(0);
  });
});

describe("GenerateTranscriptSnapshotCommand — root aggregate + versions (#10, #11, #12)", () => {
  it("#10/#11 reuses the single root and appends a new DRAFT version", async () => {
    seedFixture(h.db);
    const first = await run();
    const second = await run();

    expect(store("academicTranscript")).toHaveLength(1); // no duplicate root
    expect(first.transcript.id).toBe(second.transcript.id);
    expect(store("academicTranscriptVersion")).toHaveLength(2);
    expect(first.version.versionNumber).toBe(1);
    expect(second.version.versionNumber).toBe(2);
    expect(second.version.status).toBe("DRAFT");
  });

  it("#12 leaves an existing ISSUED version untouched", async () => {
    seedFixture(h.db);
    const first = await run();
    // simulate a prior issue: flip v1 to ISSUED directly in the store
    const v1 = store("academicTranscriptVersion")[0] as { id: string; status: string; versionNumber: number };
    v1.status = "ISSUED";

    const second = await run();
    const issued = store("academicTranscriptVersion").find(
      (v) => (v as { id: string }).id === first.version.id
    ) as { status: string };
    expect(issued.status).toBe("ISSUED"); // untouched
    expect(second.version.status).toBe("DRAFT");
    expect(second.version.versionNumber).toBe(2);
  });
});

describe("GenerateTranscriptSnapshotCommand — transaction rollback (#6, #15)", () => {
  it("#6/#15 rolls back everything when a snapshot write fails (zero rows)", async () => {
    seedFixture(h.db);
    // Poison the LAST write (attendance) so earlier rows are already inserted.
    const attendance = h.db.academicTranscriptAttendance;
    attendance.create = async () => {
      throw new Error("boom: attendance insert failed");
    };

    await expect(run()).rejects.toThrow(/boom/);

    expect(store("academicTranscript")).toHaveLength(0);
    expect(store("academicTranscriptVersion")).toHaveLength(0);
    expect(store("academicTranscriptLevel")).toHaveLength(0);
    expect(store("academicTranscriptSubject")).toHaveLength(0);
    expect(store("academicTranscriptAssessment")).toHaveLength(0);
    expect(store("academicTranscriptAttendance")).toHaveLength(0);
    // source rows survive (they were seeded outside the transaction)
    expect(store("student")).toHaveLength(1);
  });
});

// =============================================================================
// ARCHITECTURE GUARDS (#19, #20 + import guards) — static source assertions
// =============================================================================

const CMD_SRC = readFileSync(
  join(process.cwd(), "src", "modules", "transcripts", "commands", "generate-transcript-snapshot.command.ts"),
  "utf8"
);

describe("architecture guards — command stays in Phase-4 scope", () => {
  // Symbol guards (later-phase commands, events, audit) + import-path guards
  // (PDF/export/notification/certificate/diploma/react/next modules). Import-path
  // form avoids false positives on the legitimate CERTIFICATE_SUPPORT constant and
  // the `export` keyword.
  const FORBIDDEN: Array<[string, RegExp]> = [
    ["IssueTranscriptCommand", /IssueTranscriptCommand/],
    ["RevokeTranscriptCommand", /RevokeTranscriptCommand/],
    ["SupersedeTranscriptCommand", /SupersedeTranscriptCommand/],
    ["transcript number allocation", /allocateTranscriptNumber|transcript-number/],
    ["PDF / exporter import", /from ["'][^"']*(pdf|export)/i],
    ["notification import", /from ["'][^"']*notification/i],
    ["certificate / diploma import", /from ["'][^"']*(certificate|diploma)/i],
    ["React import", /from ["']react(-dom)?["']/],
    ["Next UI import", /from ["']next\//],
    ["#19 events", /eventPublisher|EventPublisher|publishDomainEvent/],
    ["#20 audit", /auditService|AuditService|recordAudit/],
  ];
  for (const [label, pattern] of FORBIDDEN) {
    it(`does not reference ${label}`, () => {
      expect(CMD_SRC).not.toMatch(pattern);
    });
  }

  it("does not perform snapshot updates/deletes (append-only persistence)", () => {
    expect(CMD_SRC).not.toMatch(/updateVersion|markVersion|updateTranscriptMetadata|softDelete/);
    expect(CMD_SRC).not.toMatch(/\.delete\s*\(|\.deleteMany\s*\(|\.update\s*\(/);
  });
});
