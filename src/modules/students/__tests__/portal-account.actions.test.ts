import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/shared/lib/command";
import { SYSTEM_ROLES } from "@/server/auth/permissions";

const { mockRequirePermission } = vi.hoisted(() => ({ mockRequirePermission: vi.fn() }));
vi.mock("@/server/auth/context", () => ({ requirePermission: mockRequirePermission }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockEnsure, mockResend, mockUnlink } = vi.hoisted(() => ({
  mockEnsure: vi.fn(),
  mockResend: vi.fn(),
  mockUnlink: vi.fn(),
}));
vi.mock("@/modules/students/services/student-user-provisioning.service", () => ({
  ensureStudentPortalUser: mockEnsure,
  resendStudentPortalInvite: mockResend,
  unlinkStudentPortalAccount: mockUnlink,
}));

import {
  createOrLinkStudentPortalAccountAction,
  resendStudentPortalInviteAction,
  unlinkStudentPortalAccountAction,
} from "../actions/portal-account.actions";

const ORG = "org-1";
const STUDENT = "student-1";

function ctx(roles: string[]) {
  return { userId: "actor-1", organizationId: ORG, roles, ability: {} as never } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsure.mockResolvedValue({ status: "created", userId: "u1", inviteUrl: "/set-password?token=t", invited: true });
  mockResend.mockResolvedValue({ status: "invite_resent", userId: "u1", inviteUrl: "/set-password?token=t" });
  mockUnlink.mockResolvedValue({ status: "unlinked", userId: "u1" });
});

describe("8. createOrLinkStudentPortalAccountAction", () => {
  it("calls ensureStudentPortalUser with reason MANUAL and returns the status + inviteUrl", async () => {
    mockRequirePermission.mockResolvedValue(ctx([SYSTEM_ROLES.ORG_ADMIN]));
    const res = await createOrLinkStudentPortalAccountAction(STUDENT);
    expect(res.success).toBe(true);
    expect(mockEnsure).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, studentId: STUDENT, triggeredByUserId: "actor-1", reason: "MANUAL" })
    );
    if (res.success) expect(res.data).toMatchObject({ status: "created", inviteUrl: "/set-password?token=t" });
  });

  it("is blocked (no service call) when the manage permission is missing", async () => {
    mockRequirePermission.mockRejectedValue(new AuthorizationError());
    const res = await createOrLinkStudentPortalAccountAction(STUDENT);
    expect(res.success).toBe(false);
    expect(mockEnsure).not.toHaveBeenCalled();
  });
});

describe("10. resendStudentPortalInviteAction", () => {
  it("calls the resend service and returns inviteUrl", async () => {
    mockRequirePermission.mockResolvedValue(ctx([SYSTEM_ROLES.ORG_ADMIN]));
    const res = await resendStudentPortalInviteAction(STUDENT);
    expect(res.success).toBe(true);
    expect(mockResend).toHaveBeenCalledWith(STUDENT, ORG, "actor-1");
  });
});

describe("13 + 14. unlinkStudentPortalAccountAction — admin only", () => {
  it("ORG_ADMIN can unlink", async () => {
    mockRequirePermission.mockResolvedValue(ctx([SYSTEM_ROLES.ORG_ADMIN]));
    const res = await unlinkStudentPortalAccountAction(STUDENT);
    expect(res.success).toBe(true);
    expect(mockUnlink).toHaveBeenCalledWith(STUDENT, ORG, "actor-1");
  });

  it("SUPER_ADMIN can unlink", async () => {
    mockRequirePermission.mockResolvedValue(ctx([SYSTEM_ROLES.SUPER_ADMIN]));
    const res = await unlinkStudentPortalAccountAction(STUDENT);
    expect(res.success).toBe(true);
  });

  it("a non-admin holding the permission still cannot unlink (defense-in-depth role check)", async () => {
    // Simulate the manage permission being present but the caller not being an admin.
    mockRequirePermission.mockResolvedValue(ctx([SYSTEM_ROLES.SECRETARY]));
    const res = await unlinkStudentPortalAccountAction(STUDENT);
    expect(res.success).toBe(false);
    expect(mockUnlink).not.toHaveBeenCalled();
  });
});
