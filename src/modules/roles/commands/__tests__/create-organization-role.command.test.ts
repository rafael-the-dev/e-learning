import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/roles/repositories/organization-role.repository", () => ({
  createOrganizationRole: vi.fn(),
  findRoleByCodeInOrg: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import {
  createOrganizationRole,
  findRoleByCodeInOrg,
} from "@/modules/roles/repositories/organization-role.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { CreateOrganizationRoleCommand } from "../create-organization-role.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

describe("CreateOrganizationRoleCommand — success", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a custom role and logs role.created", async () => {
    (findRoleByCodeInOrg as Mock).mockResolvedValue(null);
    (createOrganizationRole as Mock).mockResolvedValue({
      id: "role-1",
      name: "Recepcionista",
      code: "RECEPCIONISTA",
      description: null,
    });

    const cmd = new CreateOrganizationRoleCommand(
      { name: "Recepcionista", code: "RECEPCIONISTA" },
      CTX
    );
    const result = await cmd.run();

    expect(result.id).toBe("role-1");
    expect(createOrganizationRole).toHaveBeenCalledWith({
      organizationId: "org-1",
      name: "Recepcionista",
      code: "RECEPCIONISTA",
      description: null,
    });
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "role.created", entity: "Role", entityId: "role-1" })
    );
  });
});

describe("CreateOrganizationRoleCommand — code validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a code reserved for a system role", async () => {
    const cmd = new CreateOrganizationRoleCommand({ name: "Admin Falso", code: "ORG_ADMIN" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Dados inválidos");
    expect(findRoleByCodeInOrg).not.toHaveBeenCalled();
  });

  it("rejects a duplicate code within the same organization", async () => {
    (findRoleByCodeInOrg as Mock).mockResolvedValue({ id: "existing-role" });
    const cmd = new CreateOrganizationRoleCommand({ name: "Duplicado", code: "RECEPCIONISTA" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Dados inválidos");
  });

  it("rejects a lowercase code via the zod schema", async () => {
    const cmd = new CreateOrganizationRoleCommand({ name: "Teste", code: "invalido" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Dados inválidos");
  });
});

describe("CreateOrganizationRoleCommand — authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when the actor lacks organizationRoles.create", async () => {
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });
    const cmd = new CreateOrganizationRoleCommand({ name: "Recepcionista", code: "RECEPCIONISTA" }, CTX);
    await expect(cmd.authorize()).rejects.toThrow();
    expect(getUserPermissions).toHaveBeenCalledWith("user-1", "org-1");
  });
});
