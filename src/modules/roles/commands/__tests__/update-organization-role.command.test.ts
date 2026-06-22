import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/roles/repositories/organization-role.repository", () => ({
  findOrganizationRoleById: vi.fn(),
  updateOrganizationRole: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import {
  findOrganizationRoleById,
  updateOrganizationRole,
} from "@/modules/roles/repositories/organization-role.repository";
import { UpdateOrganizationRoleCommand } from "../update-organization-role.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeRole(overrides: Partial<{ isSystem: boolean; status: string }> = {}) {
  return {
    id: "role-1",
    organizationId: "org-1",
    name: "Recepcionista",
    code: "RECEPCIONISTA",
    description: "desc",
    isSystem: false,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    permissionIds: [],
    ...overrides,
  };
}

describe("UpdateOrganizationRoleCommand — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NotFoundError when the role does not exist in the organization", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(null);
    const cmd = new UpdateOrganizationRoleCommand({ roleId: "missing", name: "X" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
  });

  it("blocks editing a system role", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole({ isSystem: true }));
    const cmd = new UpdateOrganizationRoleCommand({ roleId: "role-1", name: "Nova Role" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Não é possível editar uma role de sistema");
  });

  it("blocks editing an archived role", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole({ status: "ARCHIVED" }));
    const cmd = new UpdateOrganizationRoleCommand({ roleId: "role-1", name: "Nova Role" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Não é possível editar uma role arquivada");
  });
});

describe("UpdateOrganizationRoleCommand — execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates name/description and logs role.updated", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole());
    (updateOrganizationRole as Mock).mockResolvedValue({
      id: "role-1",
      name: "Recepcionista Sénior",
      description: "nova desc",
    });

    const cmd = new UpdateOrganizationRoleCommand(
      { roleId: "role-1", name: "Recepcionista Sénior", description: "nova desc" },
      CTX
    );
    await cmd.run();

    expect(updateOrganizationRole).toHaveBeenCalledWith("role-1", {
      name: "Recepcionista Sénior",
      description: "nova desc",
    });
  });
});
