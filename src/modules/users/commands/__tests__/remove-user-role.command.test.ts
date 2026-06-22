import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/users/repositories/user.repository", () => ({
  findUserInOrganization: vi.fn(),
  deleteUserRolesInOrg: vi.fn(),
  countOrgAdmins: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import {
  findUserInOrganization,
  deleteUserRolesInOrg,
  countOrgAdmins,
} from "@/modules/users/repositories/user.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { RemoveUserRoleCommand } from "../remove-user-role.command";

const CTX = { userId: "actor-1", organizationId: "org-1" };

function makeUser(roles: Array<{ id: string; name: string }>) {
  return {
    id: "user-1",
    name: "Maria",
    email: "maria@example.com",
    phone: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    joinedAt: new Date(),
    isOwner: false,
    roles,
  };
}

describe("RemoveUserRoleCommand — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NotFoundError when the user is not in the organization", async () => {
    (findUserInOrganization as Mock).mockResolvedValue(null);
    const cmd = new RemoveUserRoleCommand({ userId: "missing" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
  });

  it("blocks removing the role of the last ORG_ADMIN", async () => {
    (findUserInOrganization as Mock).mockResolvedValue(
      makeUser([{ id: "role-admin", name: "ORG_ADMIN" }])
    );
    (countOrgAdmins as Mock).mockResolvedValue(1);
    const cmd = new RemoveUserRoleCommand({ userId: "user-1" }, CTX);
    await expect(cmd.validate()).rejects.toThrow(
      "Não é possível remover o papel do último administrador da organização"
    );
  });

  it("allows removing an ORG_ADMIN role when other admins exist", async () => {
    (findUserInOrganization as Mock).mockResolvedValue(
      makeUser([{ id: "role-admin", name: "ORG_ADMIN" }])
    );
    (countOrgAdmins as Mock).mockResolvedValue(2);
    const cmd = new RemoveUserRoleCommand({ userId: "user-1" }, CTX);
    await expect(cmd.validate()).resolves.not.toThrow();
  });
});

describe("RemoveUserRoleCommand — execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the user's role link and logs the change", async () => {
    (findUserInOrganization as Mock).mockResolvedValue(
      makeUser([{ id: "role-1", name: "TEACHER" }])
    );
    (countOrgAdmins as Mock).mockResolvedValue(0);

    const cmd = new RemoveUserRoleCommand({ userId: "user-1" }, CTX);
    await cmd.run();

    expect(deleteUserRolesInOrg).toHaveBeenCalledWith("user-1", "org-1");
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({
        entity: "User",
        entityId: "user-1",
        oldValues: { roles: ["TEACHER"] },
        newValues: { roles: [] },
      })
    );
  });
});
