import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "./_fake-db";

import * as periodRepo from "../exam-period.repository";
import * as roomRepo from "../exam-room.repository";
import * as sessionRepo from "../exam-session.repository";
import * as attemptRepo from "../exam-attempt.repository";
import * as candidateRepo from "../exam-candidate.repository";
import * as attendanceRepo from "../exam-attendance.repository";
import * as resultRepo from "../exam-result.repository";
import * as revisionRepo from "../exam-result-revision.repository";
import * as appealRepo from "../exam-appeal.repository";
import * as publicationRepo from "../exam-publication.repository";
import * as incidentRepo from "../exam-incident.repository";
import * as invigilatorRepo from "../exam-invigilator-assignment.repository";
import * as eventRepo from "../exam-event.repository";

// =============================================================================
// EXAMINATION REPOSITORIES — BEHAVIOURAL TESTS (Phase 2)
// -----------------------------------------------------------------------------
// The fake in `_fake-db.ts` FILTERS by the `where` clause, so tenant-isolation and
// status/soft-delete filters are proven behaviourally (not merely asserted on the
// query shape). Every call passes the fake as the `client` argument, so no module
// mock and no real DB connection is needed.
// =============================================================================

const ORG = "org-A";
const OTHER = "org-B";

function db(): { fake: FakeDb; client: ReturnType<typeof asClient> } {
  const fake = makeFakeDb();
  return { fake, client: asClient(fake) };
}

// ─── ExamPeriod ───────────────────────────────────────────────────────────────

describe("exam-period.repository", () => {
  it("create persists organizationId and returns the record", async () => {
    const { fake, client } = db();
    const rec = await periodRepo.createExamPeriod(
      {
        organizationId: ORG,
        name: "Época Normal",
        academicYear: "2026",
        startsAt: new Date("2026-06-01"),
        endsAt: new Date("2026-06-30"),
        status: "DRAFT",
      },
      client
    );
    expect(rec.organizationId).toBe(ORG);
    expect(fake.examPeriod.__store[0].organizationId).toBe(ORG);
  });

  it("findExamPeriodById is tenant-scoped (foreign org → null)", async () => {
    const { fake, client } = db();
    const r = seed(fake, "examPeriod", { organizationId: ORG, name: "P", academicYear: "2026", status: "OPEN" });
    expect((await periodRepo.findExamPeriodById({ organizationId: ORG, id: r.id as string }, client))?.id).toBe(r.id);
    expect(await periodRepo.findExamPeriodById({ organizationId: OTHER, id: r.id as string }, client)).toBeNull();
  });

  it("list excludes soft-deleted by default and supports filters; count mirrors", async () => {
    const { fake, client } = db();
    seed(fake, "examPeriod", { organizationId: ORG, academicYear: "2026", status: "OPEN" });
    seed(fake, "examPeriod", { organizationId: ORG, academicYear: "2025", status: "OPEN" });
    seed(fake, "examPeriod", { organizationId: ORG, academicYear: "2026", status: "OPEN", deletedAt: new Date() });
    seed(fake, "examPeriod", { organizationId: OTHER, academicYear: "2026", status: "OPEN" });

    const live = await periodRepo.listExamPeriods({ organizationId: ORG }, client);
    expect(live).toHaveLength(2);
    expect(await periodRepo.countExamPeriods({ organizationId: ORG, academicYear: "2026" }, client)).toBe(1);
    const withDeleted = await periodRepo.listExamPeriods({ organizationId: ORG, includeDeleted: true }, client);
    expect(withDeleted).toHaveLength(3);
  });

  it("updateExamPeriodMetadata returns count and patches columns; softDelete stamps deletedAt", async () => {
    const { fake, client } = db();
    const r = seed(fake, "examPeriod", { organizationId: ORG, status: "DRAFT", name: "Original" });
    // H1: metadata patches carry genuine metadata only (never lifecycle `status`).
    const upd = await periodRepo.updateExamPeriodMetadata(
      { organizationId: ORG, id: r.id as string, patch: { name: "Época Renomeada" } },
      client
    );
    expect(upd.count).toBe(1);
    expect(fake.examPeriod.__store[0].name).toBe("Época Renomeada");

    const del = await periodRepo.softDeleteExamPeriod({ organizationId: ORG, id: r.id as string }, client);
    expect(del.count).toBe(1);
    expect(fake.examPeriod.__store[0].deletedAt).toBeInstanceOf(Date);
    // A second soft delete is a no-op (already deleted).
    expect((await periodRepo.softDeleteExamPeriod({ organizationId: ORG, id: r.id as string }, client)).count).toBe(0);
  });

  it("updateMetadata across tenants does not touch a foreign row", async () => {
    const { fake, client } = db();
    const r = seed(fake, "examPeriod", { organizationId: ORG, status: "DRAFT", name: "Original" });
    const res = await periodRepo.updateExamPeriodMetadata(
      { organizationId: OTHER, id: r.id as string, patch: { name: "Época Renomeada" } },
      client
    );
    expect(res.count).toBe(0);
    expect(fake.examPeriod.__store[0].name).toBe("Original");
  });
});

// ─── ExamRoom ───────────────────────────────────────────────────────────────

describe("exam-room.repository", () => {
  it("create + findExamRoomByCode excludes soft-deleted and is tenant-scoped", async () => {
    const { fake, client } = db();
    await roomRepo.createExamRoom({ organizationId: ORG, name: "Sala 1", capacity: 30, code: "S1" }, client);
    expect((await roomRepo.findExamRoomByCode({ organizationId: ORG, code: "S1" }, client))?.code).toBe("S1");
    expect(await roomRepo.findExamRoomByCode({ organizationId: OTHER, code: "S1" }, client)).toBeNull();

    seed(fake, "examRoom", { organizationId: ORG, name: "Old", capacity: 10, code: "S2", deletedAt: new Date() });
    expect(await roomRepo.findExamRoomByCode({ organizationId: ORG, code: "S2" }, client)).toBeNull();
  });

  it("list filters by branch/status and softDelete works", async () => {
    const { fake, client } = db();
    seed(fake, "examRoom", { organizationId: ORG, branchId: "b1", status: "ACTIVE", capacity: 1 });
    seed(fake, "examRoom", { organizationId: ORG, branchId: "b2", status: "INACTIVE", capacity: 1 });
    expect(await roomRepo.listExamRooms({ organizationId: ORG, branchId: "b1" }, client)).toHaveLength(1);
    expect(await roomRepo.countExamRooms({ organizationId: ORG, status: "ACTIVE" }, client)).toBe(1);

    const r = seed(fake, "examRoom", { organizationId: ORG, capacity: 5 });
    expect((await roomRepo.softDeleteExamRoom({ organizationId: ORG, id: r.id as string }, client)).count).toBe(1);
  });
});

// ─── ExamSession + conflict helpers ─────────────────────────────────────────

describe("exam-session.repository", () => {
  const base = {
    organizationId: ORG,
    periodId: "per-1",
    levelSubjectId: "ls-1",
    title: "Exame",
    capacity: 40,
    status: "SCHEDULED",
  };

  it("create + tenant-scoped find + list filters", async () => {
    const { client } = db();
    const rec = await sessionRepo.createExamSession(
      { ...base, startsAt: new Date("2026-06-10T09:00:00Z"), endsAt: new Date("2026-06-10T11:00:00Z") },
      client
    );
    expect(rec.organizationId).toBe(ORG);
    expect(await sessionRepo.findExamSessionById({ organizationId: OTHER, id: rec.id }, client)).toBeNull();
    expect(await sessionRepo.listExamSessions({ organizationId: ORG, periodId: "per-1" }, client)).toHaveLength(1);
    expect(await sessionRepo.countExamSessions({ organizationId: ORG, status: "SCHEDULED" }, client)).toBe(1);
  });

  it("listSessionsInTimeRange returns overlaps, excluding CANCELLED and deleted", async () => {
    const { fake, client } = db();
    const overlap = { organizationId: ORG, status: "SCHEDULED", startsAt: new Date("2026-06-10T09:30:00Z"), endsAt: new Date("2026-06-10T10:30:00Z") };
    const before = { organizationId: ORG, status: "SCHEDULED", startsAt: new Date("2026-06-10T06:00:00Z"), endsAt: new Date("2026-06-10T08:00:00Z") };
    const cancelled = { organizationId: ORG, status: "CANCELLED", startsAt: new Date("2026-06-10T09:30:00Z"), endsAt: new Date("2026-06-10T10:30:00Z") };
    const deleted = { organizationId: ORG, status: "SCHEDULED", startsAt: new Date("2026-06-10T09:30:00Z"), endsAt: new Date("2026-06-10T10:30:00Z"), deletedAt: new Date() };
    seed(fake, "examSession", overlap);
    seed(fake, "examSession", before);
    seed(fake, "examSession", cancelled);
    seed(fake, "examSession", deleted);

    const hits = await sessionRepo.listSessionsInTimeRange(
      { organizationId: ORG, startsAt: new Date("2026-06-10T09:00:00Z"), endsAt: new Date("2026-06-10T11:00:00Z") },
      client
    );
    expect(hits).toHaveLength(1);
  });

  it("listSessionsByRoomInTimeRange scopes to the room", async () => {
    const { fake, client } = db();
    seed(fake, "examSession", { organizationId: ORG, status: "SCHEDULED", roomId: "r1", startsAt: new Date("2026-06-10T09:30:00Z"), endsAt: new Date("2026-06-10T10:30:00Z") });
    seed(fake, "examSession", { organizationId: ORG, status: "SCHEDULED", roomId: "r2", startsAt: new Date("2026-06-10T09:30:00Z"), endsAt: new Date("2026-06-10T10:30:00Z") });
    const hits = await sessionRepo.listSessionsByRoomInTimeRange(
      { organizationId: ORG, roomId: "r1", startsAt: new Date("2026-06-10T09:00:00Z"), endsAt: new Date("2026-06-10T11:00:00Z") },
      client
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].roomId).toBe("r1");
  });

  it("listSessionsByInvigilatorInTimeRange reads assignments then overlapping sessions", async () => {
    const { fake, client } = db();
    const s1 = seed(fake, "examSession", { organizationId: ORG, status: "SCHEDULED", startsAt: new Date("2026-06-10T09:30:00Z"), endsAt: new Date("2026-06-10T10:30:00Z") });
    seed(fake, "examSession", { organizationId: ORG, status: "SCHEDULED", startsAt: new Date("2026-06-11T09:30:00Z"), endsAt: new Date("2026-06-11T10:30:00Z") });
    seed(fake, "examInvigilatorAssignment", { organizationId: ORG, examSessionId: s1.id, teacherId: "t1", role: "CHIEF" });

    const hits = await sessionRepo.listSessionsByInvigilatorInTimeRange(
      { organizationId: ORG, teacherId: "t1", startsAt: new Date("2026-06-10T09:00:00Z"), endsAt: new Date("2026-06-10T11:00:00Z") },
      client
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(s1.id);

    // No pointer supplied → empty (no decision made).
    expect(await sessionRepo.listSessionsByInvigilatorInTimeRange({ organizationId: ORG, startsAt: new Date(), endsAt: new Date() }, client)).toEqual([]);
  });
});

// ─── ExamAttempt ───────────────────────────────────────────────────────────────

describe("exam-attempt.repository", () => {
  it("create + findAttemptByEnrollmentSubjectNumber tenant-scoped", async () => {
    const { client } = db();
    await attemptRepo.createExamAttempt(
      { organizationId: ORG, studentId: "s1", enrollmentId: "e1", levelSubjectId: "ls1", attemptNumber: 1 },
      client
    );
    const found = await attemptRepo.findAttemptByEnrollmentSubjectNumber(
      { organizationId: ORG, enrollmentId: "e1", levelSubjectId: "ls1", attemptNumber: 1 },
      client
    );
    expect(found?.attemptNumber).toBe(1);
    expect(
      await attemptRepo.findAttemptByEnrollmentSubjectNumber(
        { organizationId: OTHER, enrollmentId: "e1", levelSubjectId: "ls1", attemptNumber: 1 },
        client
      )
    ).toBeNull();
  });

  it("getNextAttemptNumberCandidate returns max+1, or 1 when none, ignoring deleted", async () => {
    const { fake, client } = db();
    expect(
      await attemptRepo.getNextAttemptNumberCandidate({ organizationId: ORG, enrollmentId: "e1", levelSubjectId: "ls1" }, client)
    ).toBe(1);

    seed(fake, "examAttempt", { organizationId: ORG, enrollmentId: "e1", levelSubjectId: "ls1", attemptNumber: 1 });
    seed(fake, "examAttempt", { organizationId: ORG, enrollmentId: "e1", levelSubjectId: "ls1", attemptNumber: 2 });
    seed(fake, "examAttempt", { organizationId: ORG, enrollmentId: "e1", levelSubjectId: "ls1", attemptNumber: 9, deletedAt: new Date() });
    expect(
      await attemptRepo.getNextAttemptNumberCandidate({ organizationId: ORG, enrollmentId: "e1", levelSubjectId: "ls1" }, client)
    ).toBe(3);
  });

  it("list filters + softDelete", async () => {
    const { fake, client } = db();
    seed(fake, "examAttempt", { organizationId: ORG, studentId: "s1", enrollmentId: "e1", levelSubjectId: "ls1", attemptNumber: 1, status: "OPEN" });
    expect(await attemptRepo.listExamAttempts({ organizationId: ORG, studentId: "s1" }, client)).toHaveLength(1);
    expect(await attemptRepo.countExamAttempts({ organizationId: ORG, status: "OPEN" }, client)).toBe(1);
    const r = seed(fake, "examAttempt", { organizationId: ORG, studentId: "s1", enrollmentId: "e1", levelSubjectId: "ls1", attemptNumber: 2 });
    expect((await attemptRepo.softDeleteExamAttempt({ organizationId: ORG, id: r.id as string }, client)).count).toBe(1);
  });
});

// ─── ExamCandidate ───────────────────────────────────────────────────────────────

describe("exam-candidate.repository", () => {
  it("create + findCandidateBySessionStudent + lists by session/attempt", async () => {
    const { client } = db();
    const c = await candidateRepo.createExamCandidate(
      { organizationId: ORG, examSessionId: "ses1", examAttemptId: "att1", studentId: "s1", enrollmentId: "e1" },
      client
    );
    expect(c.organizationId).toBe(ORG);
    expect((await candidateRepo.findCandidateBySessionStudent({ organizationId: ORG, examSessionId: "ses1", studentId: "s1" }, client))?.id).toBe(c.id);
    expect(await candidateRepo.findCandidateBySessionStudent({ organizationId: OTHER, examSessionId: "ses1", studentId: "s1" }, client)).toBeNull();
    expect(await candidateRepo.listCandidatesBySession({ organizationId: ORG, examSessionId: "ses1" }, client)).toHaveLength(1);
    expect(await candidateRepo.listCandidatesByAttempt({ organizationId: ORG, examAttemptId: "att1" }, client)).toHaveLength(1);
  });

  it("eligibilitySnapshot stored raw; update + softDelete", async () => {
    const { fake, client } = db();
    const snapshot = JSON.stringify({ financialClearance: true });
    const c = await candidateRepo.createExamCandidate(
      { organizationId: ORG, examSessionId: "ses1", examAttemptId: "att1", studentId: "s1", enrollmentId: "e1", eligibilitySnapshot: snapshot },
      client
    );
    expect(c.eligibilitySnapshot).toBe(snapshot); // raw string, never parsed

    expect(
      (await candidateRepo.updateExamCandidateMetadata({ organizationId: ORG, id: c.id, patch: { assignedSeat: "A1" } }, client)).count
    ).toBe(1);
    expect(fake.examCandidate.__store[0].assignedSeat).toBe("A1");
    expect((await candidateRepo.softDeleteExamCandidate({ organizationId: ORG, id: c.id }, client)).count).toBe(1);
  });
});

// ─── ExamAttendance (no soft delete) ─────────────────────────────────────────

describe("exam-attendance.repository", () => {
  it("create + findAttendanceByCandidateId + update; exposes no soft delete", async () => {
    const { fake, client } = db();
    const a = await attendanceRepo.createExamAttendance(
      { organizationId: ORG, examCandidateId: "cand1", status: "PRESENT" },
      client
    );
    expect(a.organizationId).toBe(ORG);
    expect((await attendanceRepo.findAttendanceByCandidateId({ organizationId: ORG, examCandidateId: "cand1" }, client))?.id).toBe(a.id);
    expect(await attendanceRepo.findAttendanceByCandidateId({ organizationId: OTHER, examCandidateId: "cand1" }, client)).toBeNull();
    expect((await attendanceRepo.updateExamAttendanceMetadata({ organizationId: ORG, id: a.id, patch: { status: "LATE" } }, client)).count).toBe(1);
    expect(fake.examAttendance.__store[0].status).toBe("LATE");
    expect((attendanceRepo as Record<string, unknown>).softDeleteExamAttendance).toBeUndefined();
  });
});

// ─── ExamResult + current-official-result projection ─────────────────────────

describe("exam-result.repository", () => {
  const create = {
    organizationId: ORG,
    examCandidateId: "cand1",
    examAttemptId: "att1",
    studentId: "s1",
    enrollmentId: "e1",
    levelSubjectId: "ls1",
    maxScore: 100,
  };

  it("create maps Decimal columns to number and is tenant-scoped", async () => {
    const { client } = db();
    const r = await resultRepo.createExamResult({ ...create, score: 75.5, normalizedScore: 15.1 }, client);
    expect(r.score).toBe(75.5);
    expect(r.maxScore).toBe(100);
    expect(r.normalizedScore).toBe(15.1);
    expect(await resultRepo.findExamResultById({ organizationId: OTHER, id: r.id }, client)).toBeNull();
  });

  it("findResultByCandidateId + list/count filters", async () => {
    const { client } = db();
    const r = await resultRepo.createExamResult({ ...create, status: "PUBLISHED" }, client);
    expect((await resultRepo.findResultByCandidateId({ organizationId: ORG, examCandidateId: "cand1" }, client))?.id).toBe(r.id);
    expect(await resultRepo.listExamResults({ organizationId: ORG, status: "PUBLISHED" }, client)).toHaveLength(1);
    expect(await resultRepo.countExamResults({ organizationId: ORG, studentId: "s1" }, client)).toBe(1);
  });

  it("findCurrentOfficialResult assembles base + current revision when pointer set, null when absent", async () => {
    const { fake, client } = db();
    // No pointer → currentRevision null.
    const noRev = await resultRepo.createExamResult(create, client);
    const projNone = await resultRepo.findCurrentOfficialResult({ organizationId: ORG, examResultId: noRev.id }, client);
    expect(projNone?.result.id).toBe(noRev.id);
    expect(projNone?.currentRevision).toBeNull();

    // Pointer set → revision assembled (not recomputed).
    const rev = seed(fake, "examResultRevision", { organizationId: ORG, examResultId: "res-with-rev", revisionNumber: 2, reason: "appeal", sourceType: "APPEAL", status: "CURRENT", isCurrent: true, revisedScore: 80 });
    seed(fake, "examResult", { id: "res-with-rev", organizationId: ORG, examCandidateId: "c9", examAttemptId: "a9", studentId: "s9", enrollmentId: "e9", levelSubjectId: "ls9", maxScore: 100, status: "PUBLISHED", currentRevisionId: rev.id });
    const proj = await resultRepo.findCurrentOfficialResult({ organizationId: ORG, examResultId: "res-with-rev" }, client);
    expect(proj?.currentRevision?.id).toBe(rev.id);
    expect(proj?.currentRevision?.revisedScore).toBe(80);

    // Missing/foreign org → null.
    expect(await resultRepo.findCurrentOfficialResult({ organizationId: OTHER, examResultId: "res-with-rev" }, client)).toBeNull();
  });

  it("updateExamResultMetadata is a primitive patch returning count", async () => {
    const { fake, client } = db();
    const r = await resultRepo.createExamResult(create, client);
    // H1: the metadata patch carries genuine metadata only (remarks / resultChecksum);
    // score / status / review stamps are immutable here (E-6a).
    expect((await resultRepo.updateExamResultMetadata({ organizationId: ORG, id: r.id, patch: { remarks: "Observação do supervisor" } }, client)).count).toBe(1);
    expect(fake.examResult.__store[0].remarks).toBe("Observação do supervisor");
  });
});

// ─── ExamResultRevision (append-only + current flags) ────────────────────────

describe("exam-result-revision.repository", () => {
  it("create + listRevisionsByResult ordered by revisionNumber + findCurrent", async () => {
    const { client } = db();
    await revisionRepo.createExamResultRevision({ organizationId: ORG, examResultId: "res1", revisionNumber: 1, reason: "r1", sourceType: "CORRECTION", isCurrent: false }, client);
    await revisionRepo.createExamResultRevision({ organizationId: ORG, examResultId: "res1", revisionNumber: 2, reason: "r2", sourceType: "APPEAL", isCurrent: true }, client);
    const chain = await revisionRepo.listRevisionsByResult({ organizationId: ORG, examResultId: "res1" }, client);
    expect(chain.map((c) => c.revisionNumber)).toEqual([1, 2]);
    expect((await revisionRepo.findCurrentRevisionByResult({ organizationId: ORG, examResultId: "res1" }, client))?.revisionNumber).toBe(2);
  });

  it("markRevisionCurrent + clearCurrentRevisionForResult are thin primitives", async () => {
    const { fake, client } = db();
    const rev = seed(fake, "examResultRevision", { organizationId: ORG, examResultId: "res1", revisionNumber: 1, reason: "r", sourceType: "APPEAL", status: "APPROVED", isCurrent: true });
    expect((await revisionRepo.clearCurrentRevisionForResult({ organizationId: ORG, examResultId: "res1" }, client)).count).toBe(1);
    expect(fake.examResultRevision.__store[0].isCurrent).toBe(false);
    expect((await revisionRepo.markRevisionCurrent({ organizationId: ORG, id: rev.id as string }, client)).count).toBe(1);
    expect(fake.examResultRevision.__store[0].isCurrent).toBe(true);
    // foreign org cannot flip it
    expect((await revisionRepo.markRevisionCurrent({ organizationId: OTHER, id: rev.id as string }, client)).count).toBe(0);
  });
});

// ─── ExamAppeal ───────────────────────────────────────────────────────────────

describe("exam-appeal.repository", () => {
  it("create + tenant-scoped find + list/count", async () => {
    const { client } = db();
    const a = await appealRepo.createExamAppeal({ organizationId: ORG, examResultId: "res1", studentId: "s1", requestedById: "u1", reason: "unfair" }, client);
    expect(await appealRepo.findExamAppealById({ organizationId: OTHER, id: a.id }, client)).toBeNull();
    expect(await appealRepo.listExamAppeals({ organizationId: ORG, examResultId: "res1" }, client)).toHaveLength(1);
    expect(await appealRepo.countExamAppeals({ organizationId: ORG, studentId: "s1" }, client)).toBe(1);
    // H1: ExamAppeal exposes no mutable metadata — the patch is structurally empty
    // (lifecycle/decision changes go through the mark* primitives).
    expect((await appealRepo.updateExamAppealMetadata({ organizationId: ORG, id: a.id, patch: {} }, client)).count).toBe(1);
  });
});

// ─── ExamPublication ───────────────────────────────────────────────────────────

describe("exam-publication.repository", () => {
  it("create + listPublicationsBySession + list filters", async () => {
    const { client } = db();
    await publicationRepo.createExamPublication({ organizationId: ORG, examSessionId: "ses1", status: "PUBLISHED" }, client);
    expect(await publicationRepo.listPublicationsBySession({ organizationId: ORG, examSessionId: "ses1" }, client)).toHaveLength(1);
    expect(await publicationRepo.listPublicationsBySession({ organizationId: OTHER, examSessionId: "ses1" }, client)).toHaveLength(0);
    expect(await publicationRepo.listExamPublications({ organizationId: ORG, status: "PUBLISHED" }, client)).toHaveLength(1);
  });
});

// ─── ExamIncident ───────────────────────────────────────────────────────────────

describe("exam-incident.repository", () => {
  it("create stores raw description + list/count filters", async () => {
    const { client } = db();
    const i = await incidentRepo.createExamIncident(
      { organizationId: ORG, examSessionId: "ses1", type: "CHEATING", severity: "HIGH", description: "caught with notes" },
      client
    );
    expect(i.description).toBe("caught with notes");
    expect(await incidentRepo.findExamIncidentById({ organizationId: OTHER, id: i.id }, client)).toBeNull();
    expect(await incidentRepo.listExamIncidents({ organizationId: ORG, severity: "HIGH" }, client)).toHaveLength(1);
    expect(await incidentRepo.countExamIncidents({ organizationId: ORG, examSessionId: "ses1" }, client)).toBe(1);
  });
});

// ─── ExamInvigilatorAssignment ───────────────────────────────────────────────

describe("exam-invigilator-assignment.repository", () => {
  it("create + listAssignmentsBySession + list by teacher/user", async () => {
    const { client } = db();
    await invigilatorRepo.createInvigilatorAssignment({ organizationId: ORG, examSessionId: "ses1", teacherId: "t1", role: "CHIEF" }, client);
    expect(await invigilatorRepo.listAssignmentsBySession({ organizationId: ORG, examSessionId: "ses1" }, client)).toHaveLength(1);
    expect(await invigilatorRepo.listInvigilatorAssignments({ organizationId: ORG, teacherId: "t1" }, client)).toHaveLength(1);
    expect(await invigilatorRepo.listInvigilatorAssignments({ organizationId: OTHER, teacherId: "t1" }, client)).toHaveLength(0);
  });
});

// ─── ExamEvent (append-only) ─────────────────────────────────────────────────

describe("exam-event.repository", () => {
  it("create + listExamEventsByAggregate chronological + list filters + tenant scope", async () => {
    const { client } = db();
    await eventRepo.createExamEvent({ organizationId: ORG, aggregateType: "ExamSession", aggregateId: "ses1", eventType: "SESSION_SCHEDULED" }, client);
    await eventRepo.createExamEvent({ organizationId: ORG, aggregateType: "ExamSession", aggregateId: "ses1", eventType: "SESSION_LOCKED", metadata: JSON.stringify({ by: "u1" }) }, client);
    await eventRepo.createExamEvent({ organizationId: OTHER, aggregateType: "ExamSession", aggregateId: "ses1", eventType: "SESSION_SCHEDULED" }, client);

    const forAgg = await eventRepo.listExamEventsByAggregate({ organizationId: ORG, aggregateType: "ExamSession", aggregateId: "ses1" }, client);
    expect(forAgg).toHaveLength(2);
    expect(forAgg[1].metadata).toBe(JSON.stringify({ by: "u1" })); // raw string
    expect(await eventRepo.listExamEvents({ organizationId: ORG, eventType: "SESSION_LOCKED" }, client)).toHaveLength(1);
    // foreign tenant sees only its own
    expect(await eventRepo.listExamEvents({ organizationId: OTHER }, client)).toHaveLength(1);
  });

  it("exposes create + read only (no update/delete surface)", () => {
    const surface = eventRepo as Record<string, unknown>;
    expect(typeof surface.createExamEvent).toBe("function");
    expect(surface.updateExamEvent).toBeUndefined();
    expect(surface.deleteExamEvent).toBeUndefined();
    expect(surface.softDeleteExamEvent).toBeUndefined();
  });
});
