import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { ExamSessionStatus, ExamResultStatus, ExamAppealStatus, ExamCandidateStatus } from "@/modules/examinations/constants";
import {
  computeAppealAllowedActions,
  computeAttendanceAllowedActions,
  computeCandidateAllowedActions,
  computePublicationAllowedActions,
  computeResultAllowedActions,
  computeResultIntegrationActions,
  computeRoomAllowedActions,
  resolveAppealCaps,
  resolveAttendanceCaps,
  resolveCandidateCaps,
  resolveIntegrationCaps,
  resolvePublicationCaps,
  resolveResultCaps,
  resolveRoomCaps,
} from "../examination-portal.mapper";

// Increment-2 allowedActions truth tables (PURE — permission × status).

function ctx(granted: Permission[]): AuthContext {
  const set = new Set<string>(granted);
  return {
    userId: "u",
    organizationId: "o",
    roles: [],
    ability: {
      can: (p: Permission) => set.has(p),
      canAll: (ps: Permission[]) => ps.every((p) => set.has(p)),
      canAny: (ps: Permission[]) => ps.some((p) => set.has(p)),
    },
  } as AuthContext;
}

describe("room actions", () => {
  const caps = resolveRoomCaps(ctx([PERMISSIONS.EXAMS_SCHEDULE]));
  it("ACTIVE, no future sessions → edit + archive", () => {
    expect(computeRoomAllowedActions("ACTIVE", false, caps)).toEqual({ canEdit: true, canArchive: true });
  });
  it("ACTIVE with future sessions → archive blocked", () => {
    expect(computeRoomAllowedActions("ACTIVE", true, caps).canArchive).toBe(false);
  });
  it("ARCHIVED → nothing", () => {
    expect(computeRoomAllowedActions("ARCHIVED", false, caps)).toEqual({ canEdit: false, canArchive: false });
  });
  it("no exams.schedule → nothing", () => {
    const none = resolveRoomCaps(ctx([]));
    expect(computeRoomAllowedActions("ACTIVE", false, none)).toEqual({ canEdit: false, canArchive: false });
  });
});

describe("candidate actions", () => {
  const caps = resolveCandidateCaps(
    ctx([PERMISSIONS.EXAMS_REGISTER_CANDIDATES, PERMISSIONS.EXAMS_MARK_ATTENDANCE, PERMISSIONS.EXAMS_ENTER_RESULTS, PERMISSIONS.EXAMS_VIEW])
  );
  it("REGISTERED + IN_PROGRESS + no attendance → can mark; can withdraw/disqualify", () => {
    const a = computeCandidateAllowedActions(ExamCandidateStatus.REGISTERED, ExamSessionStatus.IN_PROGRESS, false, false, caps);
    expect(a.canMarkAttendance).toBe(true);
    expect(a.canWithdraw).toBe(true);
    expect(a.canDisqualify).toBe(true);
    expect(a.canEnterResult).toBe(false); // no attendance yet
  });
  it("attendance present → can enter result (once, no existing result)", () => {
    const a = computeCandidateAllowedActions(ExamCandidateStatus.REGISTERED, ExamSessionStatus.COMPLETED, true, false, caps);
    expect(a.canEnterResult).toBe(true);
  });
  it("WITHDRAWN → no lifecycle actions", () => {
    const a = computeCandidateAllowedActions(ExamCandidateStatus.WITHDRAWN, ExamSessionStatus.IN_PROGRESS, false, false, caps);
    expect(a.canWithdraw).toBe(false);
    expect(a.canDisqualify).toBe(false);
  });
});

describe("attendance actions", () => {
  const caps = resolveAttendanceCaps(ctx([PERMISSIONS.EXAMS_MARK_ATTENDANCE, PERMISSIONS.EXAMS_CORRECT_ATTENDANCE]));
  it("registered, unmarked, LOCKED → can mark, not correct", () => {
    const a = computeAttendanceAllowedActions(ExamCandidateStatus.REGISTERED, ExamSessionStatus.LOCKED, false, caps);
    expect(a.canMark).toBe(true);
    expect(a.canCorrect).toBe(false);
  });
  it("marked, COMPLETED → can correct, not mark", () => {
    const a = computeAttendanceAllowedActions(ExamCandidateStatus.REGISTERED, ExamSessionStatus.COMPLETED, true, caps);
    expect(a.canMark).toBe(false);
    expect(a.canCorrect).toBe(true);
  });
});

describe("result actions", () => {
  const caps = resolveResultCaps(
    ctx([
      PERMISSIONS.EXAMS_ENTER_RESULTS,
      PERMISSIONS.EXAMS_SUBMIT_RESULTS,
      PERMISSIONS.EXAMS_REVIEW_RESULTS,
      PERMISSIONS.EXAMS_APPROVE_RESULTS,
      PERMISSIONS.EXAMS_RETURN_RESULTS_FOR_CORRECTION,
      PERMISSIONS.EXAMS_INTEGRATE_RESULTS,
    ])
  );
  it("no result + IN_PROGRESS → canCreate", () => {
    expect(computeResultAllowedActions(null, ExamSessionStatus.IN_PROGRESS, caps).canCreate).toBe(true);
  });
  it("DRAFT + COMPLETED → edit + submit", () => {
    const a = computeResultAllowedActions(ExamResultStatus.DRAFT, ExamSessionStatus.COMPLETED, caps);
    expect(a.canEdit).toBe(true);
    expect(a.canSubmit).toBe(true);
  });
  it("SUBMITTED → review + return; not approve", () => {
    const a = computeResultAllowedActions(ExamResultStatus.SUBMITTED, ExamSessionStatus.COMPLETED, caps);
    expect(a.canReview).toBe(true);
    expect(a.canReturnForCorrection).toBe(true);
    expect(a.canApprove).toBe(false);
  });
  it("PUBLISHED → integrate + reconcile; immutable content", () => {
    const a = computeResultAllowedActions(ExamResultStatus.PUBLISHED, ExamSessionStatus.PUBLISHED, caps);
    expect(a.canIntegrate).toBe(true);
    expect(a.canReconcile).toBe(true);
    expect(a.canEdit).toBe(false);
    expect(a.canSubmit).toBe(false);
  });
});

describe("publication actions", () => {
  const caps = resolvePublicationCaps(ctx([PERMISSIONS.EXAMS_PUBLISH_RESULTS, PERMISSIONS.EXAMS_RETRACT_PUBLICATION]));
  it("ready + COMPLETED + no active pub → canPublish", () => {
    expect(computePublicationAllowedActions(true, ExamSessionStatus.COMPLETED, false, false, caps).canPublish).toBe(true);
  });
  it("not ready → cannot publish", () => {
    expect(computePublicationAllowedActions(false, ExamSessionStatus.COMPLETED, false, false, caps).canPublish).toBe(false);
  });
  it("PUBLISHED + active + not consumed → canRetract", () => {
    expect(computePublicationAllowedActions(false, ExamSessionStatus.PUBLISHED, true, false, caps).canRetract).toBe(true);
  });
  it("consumed → cannot retract", () => {
    expect(computePublicationAllowedActions(false, ExamSessionStatus.PUBLISHED, true, true, caps).canRetract).toBe(false);
  });
});

describe("appeal actions", () => {
  const caps = resolveAppealCaps(
    ctx([PERMISSIONS.EXAMS_REVIEW_APPEAL, PERMISSIONS.EXAMS_APPROVE_APPEAL, PERMISSIONS.EXAMS_REJECT_APPEAL])
  );
  it("PENDING → canReview only", () => {
    const a = computeAppealAllowedActions(ExamAppealStatus.PENDING, caps);
    expect(a).toEqual({ canReview: true, canApprove: false, canReject: false });
  });
  it("UNDER_REVIEW → approve + reject", () => {
    const a = computeAppealAllowedActions(ExamAppealStatus.UNDER_REVIEW, caps);
    expect(a.canApprove).toBe(true);
    expect(a.canReject).toBe(true);
    expect(a.canReview).toBe(false);
  });
  it("APPROVED/REJECTED → nothing", () => {
    expect(computeAppealAllowedActions(ExamAppealStatus.APPROVED, caps)).toEqual({ canReview: false, canApprove: false, canReject: false });
  });
});

describe("integration per-result actions", () => {
  const caps = resolveIntegrationCaps(ctx([PERMISSIONS.EXAMS_INTEGRATE_RESULTS]));
  it("MISSING + supported → integrate only", () => {
    expect(computeResultIntegrationActions("MISSING", true, caps)).toEqual({ canIntegrate: true, canReconcile: false });
  });
  it("STALE + supported → reconcile only", () => {
    expect(computeResultIntegrationActions("STALE", true, caps)).toEqual({ canIntegrate: false, canReconcile: true });
  });
  it("UNSUPPORTED → neither", () => {
    expect(computeResultIntegrationActions("UNSUPPORTED", false, caps)).toEqual({ canIntegrate: false, canReconcile: false });
  });
  it("CURRENT → neither", () => {
    expect(computeResultIntegrationActions("CURRENT", true, caps)).toEqual({ canIntegrate: false, canReconcile: false });
  });
});
