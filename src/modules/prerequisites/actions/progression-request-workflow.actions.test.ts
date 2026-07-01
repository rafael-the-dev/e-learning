import { describe, it, expect, vi, beforeEach } from "vitest";
import { PROGRESSION_OUTCOME } from "@/modules/prerequisites/types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  auditLog: vi.fn(),
  approveSvc: vi.fn(),
  rejectSvc: vi.fn(),
  ensurePending: vi.fn(),
  findPolicy: vi.fn(),
  evaluate: vi.fn(),
  promote: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/server/auth/context", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: h.auditLog },
}));
vi.mock("@/modules/prerequisites/services/review-progression-request.service", () => ({
  approveProgressionRequest: h.approveSvc,
  rejectProgressionRequest: h.rejectSvc,
}));
vi.mock("@/modules/prerequisites/repositories/level-progression-request.repository", () => ({
  ensurePendingProgressionRequest: h.ensurePending,
}));
vi.mock("@/modules/prerequisites/repositories/level-progression-policy.repository", () => ({
  findPolicyByTransition: h.findPolicy,
  createProgressionPolicy: vi.fn(),
  updateProgressionPolicy: vi.fn(),
}));
vi.mock("@/modules/prerequisites/engines/level-progression.engine", () => ({
  evaluateLevelProgression: h.evaluate,
  promoteStudentToNextLevel: h.promote,
}));
vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({ enrollment: { findFirst: h.enrollmentFindFirst } })),
}));

import {
  approveProgressionRequestAction,
  rejectProgressionRequestAction,
  evaluateLevelProgressionAction,
} from "@/modules/prerequisites/actions/prerequisite.actions";

const CTX = { userId: "admin-1", organizationId: "org-1" };
const SVC_RESULT = {
  enrollmentId: "e1",
  studentId: "s1",
  courseId: "c1",
  policyId: "p1",
  fromLevelId: "L1",
  toLevelId: "L2",
  fromLevelStatus: "PROMOTED",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requirePermission.mockResolvedValue(CTX);
  h.auditLog.mockResolvedValue(undefined);
});

// ─── Approval ─────────────────────────────────────────────────────────────────

describe("approveProgressionRequestAction", () => {
  it("approves and writes both request- and domain-level audit logs", async () => {
    h.approveSvc.mockResolvedValue(SVC_RESULT);

    const result = await approveProgressionRequestAction({ requestId: "req-1", reviewNotes: "ok" });

    expect(result.success).toBe(true);
    expect(h.approveSvc).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1", organizationId: "org-1", actorId: "admin-1" })
    );
    const actions = h.auditLog.mock.calls.map((c) => c[1].action);
    expect(actions).toContain("level_progression_request.approved");
    expect(actions).toContain("level_progression.approved");
    expect(h.revalidatePath).toHaveBeenCalled();
  });

  it("is blocked for a user without the approve permission (service never runs)", async () => {
    h.requirePermission.mockRejectedValue(new Error("Sem permissão"));

    const result = await approveProgressionRequestAction({ requestId: "req-1" });

    expect(result.success).toBe(false);
    expect(h.approveSvc).not.toHaveBeenCalled();
    expect(h.auditLog).not.toHaveBeenCalled();
  });
});

// ─── Rejection ────────────────────────────────────────────────────────────────

describe("rejectProgressionRequestAction", () => {
  it("requires a reason (min 5 chars) — short reason fails validation, service never runs", async () => {
    const result = await rejectProgressionRequestAction({ requestId: "req-1", reason: "no" });

    expect(result.success).toBe(false);
    expect(h.rejectSvc).not.toHaveBeenCalled();
  });

  it("rejects with a valid reason and writes rejected + blocked audit logs", async () => {
    h.rejectSvc.mockResolvedValue(SVC_RESULT);

    const result = await rejectProgressionRequestAction({
      requestId: "req-1",
      reason: "Média do nível insuficiente",
    });

    expect(result.success).toBe(true);
    expect(h.rejectSvc).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1", reason: "Média do nível insuficiente" })
    );
    const actions = h.auditLog.mock.calls.map((c) => c[1].action);
    expect(actions).toContain("level_progression_request.rejected");
    expect(actions).toContain("level_progression.blocked");
  });

  it("is blocked for a user without the reject permission", async () => {
    h.requirePermission.mockRejectedValue(new Error("Sem permissão"));

    const result = await rejectProgressionRequestAction({ requestId: "req-1", reason: "valid reason" });

    expect(result.success).toBe(false);
    expect(h.rejectSvc).not.toHaveBeenCalled();
  });
});

// ─── Creation (manual approval required) ──────────────────────────────────────

describe("evaluateLevelProgressionAction — request creation", () => {
  beforeEach(() => {
    h.evaluate.mockResolvedValue({
      outcome: PROGRESSION_OUTCOME.REQUIRES_MANUAL_APPROVAL,
      fromLevelId: "L1",
      toLevelId: "L2",
      reason: "Requer aprovação do coordenador académico",
      failedRequiredSubjectsCount: 0,
      pendingSubjectsCount: 0,
      earnedCredits: 0,
      requiredCredits: null,
    });
    h.enrollmentFindFirst.mockResolvedValue({ studentId: "s1", courseId: "c1" });
    h.findPolicy.mockResolvedValue({ id: "p1" });
  });

  it("creates a PENDING request and audits level_progression_request.created", async () => {
    h.ensurePending.mockResolvedValue({ id: "req-new", created: true });

    const result = await evaluateLevelProgressionAction({ enrollmentId: "e1", courseLevelId: "L1" });

    expect(result.success).toBe(true);
    expect(h.ensurePending).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentId: "e1",
        fromLevelId: "L1",
        toLevelId: "L2",
        policyId: "p1",
      })
    );
    const actions = h.auditLog.mock.calls.map((c) => c[1].action);
    expect(actions).toContain("level_progression_request.created");
  });

  it("does NOT create a duplicate: when a pending request exists, no created-audit is written", async () => {
    h.ensurePending.mockResolvedValue({ id: "req-existing", created: false });

    const result = await evaluateLevelProgressionAction({ enrollmentId: "e1", courseLevelId: "L1" });

    expect(result.success).toBe(true);
    expect(h.ensurePending).toHaveBeenCalledTimes(1);
    const actions = h.auditLog.mock.calls.map((c) => c[1].action);
    expect(actions).not.toContain("level_progression_request.created");
  });
});
