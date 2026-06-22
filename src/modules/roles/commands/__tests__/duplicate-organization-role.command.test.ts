import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/roles/repositories/organization-role.repository", () => ({
  findOrganizationRoleById: vi.fn(),
  findRoleByCodeInOrg: vi.fn(),
  createOrganizationRole: vi.fn(),
  copyRolePermissions: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import {
  findOrganizationRoleById,
  findRoleByCodeInOrg,
  createOrganizationRole,
  copyRolePermissions,
} from "@/modules/roles/repositories/organization-role.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { DuplicateOrganizationRoleCommand } from "../duplicate-organization-role.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeSourceRole(overrides: Partial<{ isSystem: boolean }> = {}) {
  return {
    id: "source-role",
    organizationId: null,
    name: "TEACHER",
    code: "TEACHER",
    description: null,
    isSystem: true,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    permissionIds: ["perm-1", "perm-2"],
    ...overrides,
  };
}

describe("DuplicateOrganizationRoleCommand — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NotFoundError when the source role is not visible to the organization", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(null);
    const cmd = new DuplicateOrganizationRoleCommand(
      { sourceRoleId: "missing", name: "Cópia", code: "COPIA" },
      CTX
    );
    await expect(cmd.validate()).rejects.toThrow();
  });

  it("rejects a duplicate code", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeSourceRole());
    (findRoleByCodeInOrg as Mock).mockResolvedValue({ id: "existing" });
    const cmd = new DuplicateOrganizationRoleCommand(
      { sourceRoleId: "source-role", name: "Cópia", code: "TEACHER_COPY" },
      CTX
    );
    await expect(cmd.validate()).rejects.toThrow("Dados inválidos");
  });
});

describe("DuplicateOrganizationRoleCommand — execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new custom role and copies the source role's permissions, not its users", async () => {
    (findOrganizationRoleById as Mock).mockResolvedValue(makeSourceRole());
    (findRoleByCodeInOrg as Mock).mockResolvedValue(null);
    (createOrganizationRole as Mock).mockResolvedValue({
      id: "new-role",
      name: "Formador Júnior",
      code: "FORMADOR_JUNIOR",
    });
    (copyRolePermissions as Mock).mockResolvedValue(2);

    const cmd = new DuplicateOrganizationRoleCommand(
      { sourceRoleId: "source-role", name: "Formador Júnior", code: "FORMADOR_JUNIOR" },
      CTX
    );
    const result = await cmd.run();

    expect(createOrganizationRole).toHaveBeenCalledWith({
      organizationId: "org-1",
      name: "Formador Júnior",
      code: "FORMADOR_JUNIOR",
      description: null,
    });
    expect(copyRolePermissions).toHaveBeenCalledWith("source-role", "new-role");
    expect(result.id).toBe("new-role");
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "role.duplicated" })
    );
  });
});
