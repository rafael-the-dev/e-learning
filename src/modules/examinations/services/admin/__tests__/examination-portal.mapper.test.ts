import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { ExamPeriodStatus, ExamSessionStatus } from "@/modules/examinations/constants";
import {
  computePeriodAllowedActions,
  computeSessionAllowedActions,
  resolvePeriodCaps,
  resolveSessionCaps,
} from "../examination-portal.mapper";

// =============================================================================
// PHASE 12 — allowedActions mapper (PURE) — permission × status truth table
// =============================================================================

/** Minimal AuthContext whose ability grants exactly `granted`. */
function ctx(granted: Permission[]): AuthContext {
  const set = new Set<string>(granted);
  return {
    userId: "u-1",
    organizationId: "org-1",
    roles: [],
    ability: {
      can: (p: Permission) => set.has(p),
      canAll: (ps: Permission[]) => ps.every((p) => set.has(p)),
      canAny: (ps: Permission[]) => ps.some((p) => set.has(p)),
    },
  } as AuthContext;
}

describe("period allowedActions", () => {
  const caps = resolvePeriodCaps(ctx([PERMISSIONS.EXAMS_SCHEDULE]));

  it("DRAFT → only canOpen + canCancel", () => {
    expect(computePeriodAllowedActions(ExamPeriodStatus.DRAFT, caps)).toEqual({
      canOpen: true,
      canLock: false,
      canComplete: false,
      canCancel: true,
    });
  });

  it("OPEN → canLock + canCancel", () => {
    const a = computePeriodAllowedActions(ExamPeriodStatus.OPEN, caps);
    expect(a.canLock).toBe(true);
    expect(a.canOpen).toBe(false);
    expect(a.canCancel).toBe(true);
  });

  it("LOCKED → canComplete + canCancel", () => {
    const a = computePeriodAllowedActions(ExamPeriodStatus.LOCKED, caps);
    expect(a.canComplete).toBe(true);
    expect(a.canCancel).toBe(true);
  });

  it("COMPLETED / CANCELLED → nothing (terminal)", () => {
    for (const s of [ExamPeriodStatus.COMPLETED, ExamPeriodStatus.CANCELLED]) {
      expect(computePeriodAllowedActions(s, caps)).toEqual({
        canOpen: false,
        canLock: false,
        canComplete: false,
        canCancel: false,
      });
    }
  });

  it("without exams.schedule → every flag false regardless of status", () => {
    const noCaps = resolvePeriodCaps(ctx([]));
    const a = computePeriodAllowedActions(ExamPeriodStatus.DRAFT, noCaps);
    expect(Object.values(a).every((v) => v === false)).toBe(true);
  });
});

describe("session allowedActions", () => {
  const fullCaps = resolveSessionCaps(
    ctx([
      PERMISSIONS.EXAMS_SCHEDULE,
      PERMISSIONS.EXAMS_REGISTER_CANDIDATES,
      PERMISSIONS.EXAMS_MARK_ATTENDANCE,
      PERMISSIONS.EXAMS_ENTER_RESULTS,
      PERMISSIONS.EXAMS_PUBLISH_RESULTS,
      PERMISSIONS.EXAMS_RETRACT_PUBLICATION,
      PERMISSIONS.EXAMS_INTEGRATE_RESULTS,
    ])
  );

  it("SCHEDULED → canLock + canRegisterCandidate + canCancel", () => {
    const a = computeSessionAllowedActions(ExamSessionStatus.SCHEDULED, fullCaps);
    expect(a.canLock).toBe(true);
    expect(a.canRegisterCandidate).toBe(true);
    expect(a.canCancel).toBe(true);
    expect(a.canStart).toBe(false);
    expect(a.canMarkAttendance).toBe(false);
  });

  it("IN_PROGRESS → canComplete + canMarkAttendance + canEnterResults", () => {
    const a = computeSessionAllowedActions(ExamSessionStatus.IN_PROGRESS, fullCaps);
    expect(a.canComplete).toBe(true);
    expect(a.canMarkAttendance).toBe(true);
    expect(a.canEnterResults).toBe(true);
    expect(a.canCancel).toBe(false); // IN_PROGRESS is not cancellable
  });

  it("PUBLISHED → canRetract + canIntegrate only", () => {
    const a = computeSessionAllowedActions(ExamSessionStatus.PUBLISHED, fullCaps);
    expect(a.canRetract).toBe(true);
    expect(a.canIntegrate).toBe(true);
    expect(a.canPublish).toBe(false);
    expect(a.canEnterResults).toBe(false);
  });

  it("CANCELLED → no binding, no lifecycle", () => {
    const a = computeSessionAllowedActions(ExamSessionStatus.CANCELLED, fullCaps);
    expect(a.canBindGradeComponent).toBe(false);
    expect(a.canIntegrate).toBe(false);
    expect(Object.values(a).every((v) => v === false)).toBe(true);
  });

  it("integrate requires exams.integrateResults even when PUBLISHED", () => {
    const noIntegrate = resolveSessionCaps(ctx([PERMISSIONS.EXAMS_SCHEDULE]));
    const a = computeSessionAllowedActions(ExamSessionStatus.PUBLISHED, noIntegrate);
    expect(a.canIntegrate).toBe(false);
    expect(a.canBindGradeComponent).toBe(false);
  });
});
