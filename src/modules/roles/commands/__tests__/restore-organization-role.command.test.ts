import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/roles/repositories/organization-role.repository", () => ({
  findOrganizationRoleById: vi.fn(),
  setOrganizationRoleStatus: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import {
  findOrganizationRoleById,
  setOrganizationRoleStatus,
} from "@/modules/roles/repositories/organization-role.repository";
import { RestoreOrganizationRoleCommand } from "../restore-organization-role.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeRole(overrides: Partial<{ isSystem: boolean; status: string }> = {}) {
  return {
    id: "role-1",
    organizationId: "org-1",
    name: "Recepcionista",
    code: "RECEPCIONISTA",
    description: null,
    isSystem: false,
    status: "ARCHIVED",
    createdAt: new Date(),
    updatedAt: new Date(),
    permissionIds: [],
    ...overrides,
  };
}

describe("RestoreOrganizationRoleCommand — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks restoring a system role", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole({ isSystem: true }));
    const cmd = new RestoreOrganizationRoleCommand({ roleId: "role-1" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Uma role de sistema não pode ser restaurada");
  });

  it("blocks restoring a role that is not archived", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole({ status: "ACTIVE" }));
    const cmd = new RestoreOrganizationRoleCommand({ roleId: "role-1" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("A role não está arquivada");
  });
});

describe("RestoreOrganizationRoleCommand — execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets status back to ACTIVE and logs role.restored", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole());
    (setOrganizationRoleStatus as Mock).mockResolvedValue(makeRole({ status: "ACTIVE" }));

    const cmd = new RestoreOrganizationRoleCommand({ roleId: "role-1" }, CTX);
    await cmd.run();

    expect(setOrganizationRoleStatus).toHaveBeenCalledWith("role-1", "ACTIVE");
  });
});
