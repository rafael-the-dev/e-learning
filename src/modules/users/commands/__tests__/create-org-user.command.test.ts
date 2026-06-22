import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/users/repositories/user.repository", () => ({
  findUserByEmail: vi.fn(),
  createOrgUser: vi.fn(),
  createUserOrganizationLink: vi.fn(),
  createUserRoleLink: vi.fn(),
  findUserInOrganization: vi.fn(),
  findRoleById: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { findUserByEmail, findRoleById } from "@/modules/users/repositories/user.repository";
import { CreateOrganizationUserCommand } from "../create-org-user.command";

const CTX = { userId: "actor-1", organizationId: "org-1" };

const BASE_INPUT = {
  name: "Maria",
  email: "maria@example.com",
  password: "password123",
  roleId: "role-1",
};

describe("CreateOrganizationUserCommand — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findUserByEmail as Mock).mockResolvedValue(null);
  });

  it("blocks a custom role that belongs to a different organization (cross-tenant)", async () => {
    (findRoleById as Mock).mockResolvedValue({
      id: "role-1",
      name: "Recepcionista",
      status: "ACTIVE",
      isSystem: false,
      organizationId: "org-2",
    });
    const cmd = new CreateOrganizationUserCommand(BASE_INPUT, CTX);
    await expect(cmd.validate()).rejects.toThrow("Dados inválidos");
  });

  it("blocks an archived role", async () => {
    (findRoleById as Mock).mockResolvedValue({
      id: "role-1",
      name: "Recepcionista",
      status: "ARCHIVED",
      isSystem: false,
      organizationId: "org-1",
    });
    const cmd = new CreateOrganizationUserCommand(BASE_INPUT, CTX);
    await expect(cmd.validate()).rejects.toThrow("Não é possível atribuir um papel arquivado");
  });

  it("allows a system role regardless of organizationId", async () => {
    (findRoleById as Mock).mockResolvedValue({
      id: "role-1",
      name: "TEACHER",
      status: "ACTIVE",
      isSystem: true,
      organizationId: null,
    });
    const cmd = new CreateOrganizationUserCommand(BASE_INPUT, CTX);
    await expect(cmd.validate()).resolves.not.toThrow();
  });

  it("allows a custom role belonging to the actor's own organization", async () => {
    (findRoleById as Mock).mockResolvedValue({
      id: "role-1",
      name: "Recepcionista",
      status: "ACTIVE",
      isSystem: false,
      organizationId: "org-1",
    });
    const cmd = new CreateOrganizationUserCommand(BASE_INPUT, CTX);
    await expect(cmd.validate()).resolves.not.toThrow();
  });
});
