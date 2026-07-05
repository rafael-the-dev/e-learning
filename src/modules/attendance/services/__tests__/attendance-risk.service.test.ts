import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_ATTENDANCE_POLICY } from "@/modules/attendance/types";
import type { EffectiveAttendancePolicy, StudentSubjectAttendanceSummary } from "@/modules/attendance/types";

// =============================================================================
// Attendance risk service — source-of-truth tests (Fix C1).
//
// The risk service must read the PERSISTED StudentSubjectAttendanceSummary and
// NEVER recompute from raw records via the retired legacy calculator. These
// tests fake only I/O (db, events, summary repo, policy resolver); the risk
// decision logic runs for real.
// =============================================================================

const store = vi.hoisted(() => ({
  session: null as null | { classGroupId: string | null; levelSubjectId: string; subjectId: string },
  enrollments: [] as { id: string; studentId: string; classGroupId: string | null; student: { firstName: string; lastName: string } }[],
  levelSubject: null as null | { minimumAttendancePercentage: number | null; attendancePolicyId: string | null; subject: { name: string } | null },
  policy: null as null | EffectiveAttendancePolicy,
  summaries: new Map<string, StudentSubjectAttendanceSummary>(),
  domainEventCount: 0,
}));

const publish = vi.fn();
const findSummary = vi.fn();
const loadPolicy = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    attendanceSession: { findFirst: async () => store.session },
    enrollment: { findMany: async () => store.enrollments },
    levelSubject: { findFirst: async () => store.levelSubject },
    domainEvent: { count: async () => store.domainEventCount },
  }),
}));

vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: (...a: unknown[]) => publish(...a) },
}));

vi.mock("@/modules/attendance/repositories/student-subject-attendance-summary.repository", () => ({
  findSummaryByEnrollmentAndSubject: (...a: unknown[]) => findSummary(...a),
}));

vi.mock("@/modules/attendance/services/attendance-policy.resolver", () => ({
  loadEffectiveAttendancePolicy: (...a: unknown[]) => loadPolicy(...a),
}));

// The legacy calculator must not be imported/called by this service. We spy on
// it so any accidental use is loudly visible in tests.
const legacyCalc = vi.fn();
vi.mock("@/modules/attendance/services/attendance-calculator.service", () => ({
  calculateStudentSubjectAttendance: (...a: unknown[]) => legacyCalc(...a),
  calculateEnrollmentAttendanceSummary: (...a: unknown[]) => legacyCalc(...a),
  checkMinimumAttendanceRequirement: (...a: unknown[]) => legacyCalc(...a),
}));

import { evaluateAttendanceRiskForSession } from "../attendance-risk.service";

const ORG = "org-A";
const LS = "ls-1";

function effPolicy(over: Partial<EffectiveAttendancePolicy> = {}): EffectiveAttendancePolicy {
  return { ...DEFAULT_ATTENDANCE_POLICY, source: "FALLBACK", policyId: null, ...over };
}

function makeSummary(over: Partial<StudentSubjectAttendanceSummary> = {}): StudentSubjectAttendanceSummary {
  return {
    id: "sum-1",
    organizationId: ORG,
    enrollmentId: "enr-1",
    studentId: "stu-1",
    levelSubjectId: LS,
    attendancePolicyId: null,
    totalSessions: 10,
    totalScheduledMinutes: 600,
    totalPresentMinutes: 480,
    totalAbsentMinutes: 120,
    totalLateMinutes: 0,
    totalExcusedMinutes: 0,
    attendancePercentage: 80,
    status: "SUFFICIENT",
    calculatedAt: new Date("2026-07-03"),
    ...over,
  };
}

beforeEach(() => {
  store.session = { classGroupId: "cg-1", levelSubjectId: LS, subjectId: "subj-1" };
  store.enrollments = [
    { id: "enr-1", studentId: "stu-1", classGroupId: "cg-1", student: { firstName: "Ana", lastName: "Silva" } },
  ];
  store.levelSubject = { minimumAttendancePercentage: 75, attendancePolicyId: null, subject: { name: "Matemática" } };
  store.policy = effPolicy({ atRiskBufferPercentage: 5 });
  store.summaries = new Map();
  store.domainEventCount = 0;
  publish.mockClear();
  loadPolicy.mockClear();
  legacyCalc.mockClear();
  findSummary.mockReset();
  findSummary.mockImplementation(async (enrollmentId: string, levelSubjectId: string) =>
    store.summaries.get(`${enrollmentId}|${levelSubjectId}`) ?? null
  );
  loadPolicy.mockImplementation(async () => store.policy);
});

describe("evaluateAttendanceRiskForSession — source of truth", () => {
  it("reads the persisted summary and never calls the legacy calculator", async () => {
    store.summaries.set(`enr-1|${LS}`, makeSummary({ attendancePercentage: 80, status: "SUFFICIENT" }));

    await evaluateAttendanceRiskForSession("sess-1", ORG);

    expect(findSummary).toHaveBeenCalledWith("enr-1", LS, ORG);
    expect(legacyCalc).not.toHaveBeenCalled();
  });

  it("emits BELOW_REQUIRED straight from the persisted summary status", async () => {
    // Percentage (80) is ABOVE the minimum (75), but the persisted summary says
    // BELOW_REQUIRED (e.g. after applying policy semantics). The status wins.
    store.summaries.set(`enr-1|${LS}`, makeSummary({ attendancePercentage: 80, status: "BELOW_REQUIRED" }));

    await evaluateAttendanceRiskForSession("sess-1", ORG);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({
      eventType: "attendance.student_below_required",
      payload: { studentId: "stu-1", levelSubjectId: LS, currentPercentage: 80 },
    });
  });

  it("emits AT_RISK when SUFFICIENT but within the policy at-risk buffer of the minimum", async () => {
    // min 75, buffer 5 → at-risk band [75, 80). 78 is SUFFICIENT but at-risk.
    store.summaries.set(`enr-1|${LS}`, makeSummary({ attendancePercentage: 78, status: "SUFFICIENT" }));

    await evaluateAttendanceRiskForSession("sess-1", ORG);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({ eventType: "attendance.student_at_risk" });
  });

  it("uses the policy atRiskBufferPercentage for the at-risk threshold", async () => {
    // Widen the buffer to 10 → at-risk band [75, 85). 82 becomes at-risk.
    store.policy = effPolicy({ atRiskBufferPercentage: 10 });
    store.summaries.set(`enr-1|${LS}`, makeSummary({ attendancePercentage: 82, status: "SUFFICIENT" }));

    await evaluateAttendanceRiskForSession("sess-1", ORG);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({ eventType: "attendance.student_at_risk" });
  });

  it("emits nothing when SUFFICIENT and comfortably above the buffer", async () => {
    store.summaries.set(`enr-1|${LS}`, makeSummary({ attendancePercentage: 95, status: "SUFFICIENT" }));

    await evaluateAttendanceRiskForSession("sess-1", ORG);

    expect(publish).not.toHaveBeenCalled();
  });

  it("emits no risk signal when the summary is missing (no on-read recalculation)", async () => {
    // No summary row at all → needsRecalculation territory. Never fabricate.
    await evaluateAttendanceRiskForSession("sess-1", ORG);

    expect(publish).not.toHaveBeenCalled();
    expect(legacyCalc).not.toHaveBeenCalled();
  });

  it("emits no risk signal for a NOT_STARTED summary (null percentage)", async () => {
    store.summaries.set(`enr-1|${LS}`, makeSummary({ attendancePercentage: null, status: "NOT_STARTED" }));

    await evaluateAttendanceRiskForSession("sess-1", ORG);

    expect(publish).not.toHaveBeenCalled();
  });

  it("is idempotent — suppresses a duplicate BELOW_REQUIRED when a recent event exists", async () => {
    store.summaries.set(`enr-1|${LS}`, makeSummary({ status: "BELOW_REQUIRED" }));
    store.domainEventCount = 1; // hasRecentEvent → true

    await evaluateAttendanceRiskForSession("sess-1", ORG);

    expect(publish).not.toHaveBeenCalled();
  });

  it("returns early (no summary reads) when the subject has no minimum threshold", async () => {
    store.levelSubject = { minimumAttendancePercentage: null, attendancePolicyId: null, subject: { name: "X" } };

    await evaluateAttendanceRiskForSession("sess-1", ORG);

    expect(findSummary).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("evaluateAttendanceRiskForSession — Fix H2: a justification cannot worsen risk", () => {
  // The risk engine is a PURE function of the persisted summary (percentage +
  // status). Because the weighting fix guarantees a justification never lowers
  // the summary, feeding the improved (post-justification) summary can only yield
  // an equal-or-less-severe risk signal — never a worse one.

  it("below_required BEFORE justification → nothing AFTER a justification lifts it clear", async () => {
    // Pre-justification: BELOW_REQUIRED → emits below_required.
    store.summaries.set(`enr-1|${LS}`, makeSummary({ attendancePercentage: 60, status: "BELOW_REQUIRED" }));
    await evaluateAttendanceRiskForSession("sess-1", ORG);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({ eventType: "attendance.student_below_required" });

    // Post-justification: summary recomputed to SUFFICIENT and comfortably above
    // the at-risk band (min 75, buffer 5 → band [75,80)). No worse signal — none at all.
    publish.mockClear();
    store.summaries.set(`enr-1|${LS}`, makeSummary({ attendancePercentage: 95, status: "SUFFICIENT" }));
    await evaluateAttendanceRiskForSession("sess-1", ORG);
    expect(publish).not.toHaveBeenCalled();
  });

  it("never emits below_required for a summary the weighting fix raised to SUFFICIENT", async () => {
    // A justified-LATE summary: SUFFICIENT at exactly the minimum (75). The engine
    // must not manufacture a below_required from the raw percentage.
    store.summaries.set(`enr-1|${LS}`, makeSummary({ attendancePercentage: 75, status: "SUFFICIENT" }));
    await evaluateAttendanceRiskForSession("sess-1", ORG);
    const belowCalls = publish.mock.calls.filter(
      (c) => (c[0] as { eventType: string }).eventType === "attendance.student_below_required"
    );
    expect(belowCalls).toHaveLength(0);
  });
});
