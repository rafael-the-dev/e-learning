import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/users/repositories/user.repository", () => ({
  findUserInOrganization: vi.fn(),
  findRoleById: vi.fn(),
  deleteUserRolesInOrg: vi.fn(),
  createUserRoleLink: vi.fn(),
  countOrgAdmins: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { findUserInOrganization, findRoleById, countOrgAdmins } from "@/modules/users/repositories/user.repository";
import { AssignUserRoleCommand } from "../assign-user-role.command";

const CTX = { userId: "actor-1", organizationId: "org-1" };

function makeUser(roles: Array<{ id: string; name: string }> = []) {
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

describe("AssignUserRoleCommand — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks assigning SUPER_ADMIN", async () => {
    (findUserInOrganization as Mock).mockResolvedValue(makeUser());
    (findRoleById as Mock).mockResolvedValue({ id: "role-super", name: "SUPER_ADMIN", status: "ACTIVE" });
    const cmd = new AssignUserRoleCommand({ userId: "user-1", roleId: "role-super" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Dados inválidos");
  });

  it("blocks assigning an archived custom role", async () => {
    (findUserInOrganization as Mock).mockResolvedValue(makeUser());
    (findRoleById as Mock).mockResolvedValue({
      id: "role-1",
      name: "Recepcionista",
      status: "ARCHIVED",
    });
    const cmd = new AssignUserRoleCommand({ userId: "user-1", roleId: "role-1" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Não é possível atribuir um papel arquivado");
  });

  it("blocks downgrading the last ORG_ADMIN", async () => {
    (findUserInOrganization as Mock).mockResolvedValue(
      makeUser([{ id: "role-admin", name: "ORG_ADMIN" }])
    );
    (findRoleById as Mock).mockResolvedValue({ id: "role-teacher", name: "TEACHER", status: "ACTIVE" });
    (countOrgAdmins as Mock).mockResolvedValue(1);
    const cmd = new AssignUserRoleCommand({ userId: "user-1", roleId: "role-teacher" }, CTX);
    await expect(cmd.validate()).rejects.toThrow(
      "Não é possível alterar o papel do último administrador da organização"
    );
  });

  it("allows assigning an active, non-reserved role", async () => {
    (findUserInOrganization as Mock).mockResolvedValue(makeUser());
    (findRoleById as Mock).mockResolvedValue({ id: "role-1", name: "Recepcionista", status: "ACTIVE" });
    const cmd = new AssignUserRoleCommand({ userId: "user-1", roleId: "role-1" }, CTX);
    await expect(cmd.validate()).resolves.not.toThrow();
  });
});
