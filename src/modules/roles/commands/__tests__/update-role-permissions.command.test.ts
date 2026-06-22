import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/roles/repositories/organization-role.repository", () => ({
  findOrganizationRoleById: vi.fn(),
}));

vi.mock("@/modules/roles/repositories/permission.repository", () => ({
  findRolePermissionIds: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

const { deleteMany, createMany, permissionCount, transaction } = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  permissionCount: vi.fn(),
  transaction: vi.fn(async (ops: unknown[]) => ops),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    rolePermission: { deleteMany, createMany },
    permission: { count: permissionCount },
    $transaction: transaction,
  }),
}));

import { findOrganizationRoleById } from "@/modules/roles/repositories/organization-role.repository";
import { findRolePermissionIds } from "@/modules/roles/repositories/permission.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { UpdateRolePermissionsCommand } from "../update-role-permissions.command";

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

describe("UpdateRolePermissionsCommand — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks editing permissions on a system role", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole({ isSystem: true }));
    const cmd = new UpdateRolePermissionsCommand({ roleId: "role-1", permissionIds: [] }, CTX);
    await expect(cmd.validate()).rejects.toThrow(
      "As permissões de uma role de sistema não podem ser alteradas"
    );
  });

  it("blocks editing permissions on an archived role", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole({ status: "ARCHIVED" }));
    const cmd = new UpdateRolePermissionsCommand({ roleId: "role-1", permissionIds: [] }, CTX);
    await expect(cmd.validate()).rejects.toThrow(
      "Não é possível alterar as permissões de uma role arquivada"
    );
  });

  it("rejects duplicate permission ids", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole());
    const cmd = new UpdateRolePermissionsCommand(
      { roleId: "role-1", permissionIds: ["perm-1", "perm-1"] },
      CTX
    );
    await expect(cmd.validate()).rejects.toThrow("Dados inválidos");
  });

  it("rejects permission ids that do not exist in the catalog", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole());
    permissionCount.mockResolvedValue(1);
    const cmd = new UpdateRolePermissionsCommand(
      { roleId: "role-1", permissionIds: ["perm-1", "perm-2"] },
      CTX
    );
    await expect(cmd.validate()).rejects.toThrow("Dados inválidos");
  });
});

describe("UpdateRolePermissionsCommand — execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replaces the role's permissions transactionally and logs one aggregated audit entry", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeRole());
    permissionCount.mockResolvedValue(2);
    (findRolePermissionIds as Mock).mockResolvedValue(["perm-1"]);

    const cmd = new UpdateRolePermissionsCommand(
      { roleId: "role-1", permissionIds: ["perm-1", "perm-2"] },
      CTX
    );
    await cmd.run();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { roleId: "role-1" } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { roleId: "role-1", permissionId: "perm-1" },
        { roleId: "role-1", permissionId: "perm-2" },
      ],
    });
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({
        action: "role.permissions.updated",
        oldValues: { permissions: ["perm-1"] },
        newValues: expect.objectContaining({
          permissions: ["perm-1", "perm-2"],
          added: ["perm-2"],
          removed: [],
        }),
      })
    );
  });
});
