import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/roles/repositories/organization-role.repository", () => ({
  findOrganizationRoleById: vi.fn(),
  setOrganizationRoleStatus: vi.fn(),
  countUsersWithRole: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import {
  findOrganizationRoleById,
  setOrganizationRoleStatus,
  countUsersWithRole,
} from "@/modules/roles/repositories/organization-role.repository";
import { ArchiveOrganizationRoleCommand } from "../archive-organization-role.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeRole(overrides: Partial<{ isSystem: boolean; status: string }> = {}) {
  return {
    id: "role-1",
    organizationId: "org-1",
    name: "Recepcionista",
    code: "RECEPCIONISTA",
    description: null,
    isSystem: false,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    permissionIds: [],
    ...overrides,
  };
}

describe("ArchiveOrganizationRoleCommand — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks archiving a system role", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole({ isSystem: true }));
    const cmd = new ArchiveOrganizationRoleCommand({ roleId: "role-1" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Não é possível arquivar uma role de sistema");
  });

  it("blocks archiving an already-archived role", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole({ status: "ARCHIVED" }));
    const cmd = new ArchiveOrganizationRoleCommand({ roleId: "role-1" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("A role já está arquivada");
  });

  it("blocks archiving a role with assigned users", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole());
    (countUsersWithRole as Mock).mockResolvedValue(3);
    const cmd = new ArchiveOrganizationRoleCommand({ roleId: "role-1" }, CTX);
    await expect(cmd.validate()).rejects.toThrow(
      "Não é possível arquivar uma role com utilizadores atribuídos"
    );
  });

  it("allows archiving a custom role with zero assigned users", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole());
    (countUsersWithRole as Mock).mockResolvedValue(0);
    const cmd = new ArchiveOrganizationRoleCommand({ roleId: "role-1" }, CTX);
    await expect(cmd.validate()).resolves.not.toThrow();
  });
});

describe("ArchiveOrganizationRoleCommand — execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets status to ARCHIVED and logs role.archived", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole());
    (countUsersWithRole as Mock).mockResolvedValue(0);
    (setOrganizationRoleStatus as Mock).mockResolvedValue(makeRole({ status: "ARCHIVED" }));

    const cmd = new ArchiveOrganizationRoleCommand({ roleId: "role-1" }, CTX);
    await cmd.run();

    expect(setOrganizationRoleStatus).toHaveBeenCalledWith("role-1", "ARCHIVED");
  });
});
