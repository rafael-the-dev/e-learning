"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { KeyRound, Users, History } from "lucide-react";
import { PermissionMatrix } from "@/modules/roles/components/permission-matrix";
import { RoleUsersPanel } from "@/modules/roles/components/role-users-panel";
import { RoleAuditTrail } from "@/modules/roles/components/role-audit-trail";
import type {
  OrganizationRoleDetail,
  PermissionMatrix as PermissionMatrixData,
  RoleAssignedUser,
  RoleAuditEntry,
} from "@/modules/roles/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  role: OrganizationRoleDetail;
  matrix: PermissionMatrixData;
  assignedUsers: PaginatedResult<RoleAssignedUser>;
  availableUsers: { id: string; name: string; email: string }[];
  auditTrail: PaginatedResult<RoleAuditEntry>;
  canManagePermissions: boolean;
  canAssignUsers: boolean;
}

export function RoleDetailTabs({
  role,
  matrix,
  assignedUsers,
  availableUsers,
  auditTrail,
  canManagePermissions,
  canAssignUsers,
}: Props) {
  const permissionsReadOnly = role.isSystem || role.status === "ARCHIVED" || !canManagePermissions;
  const readOnlyReason = role.isSystem
    ? "Roles de sistema têm as permissões geridas pelo código/seed da aplicação. Duplique esta role para criar uma versão customizável."
    : role.status === "ARCHIVED"
      ? "Esta role está arquivada. Restaure-a para poder alterar as suas permissões."
      : !canManagePermissions
        ? "Não tem permissão para gerir as permissões desta role."
        : undefined;

  return (
    <Tabs defaultValue="permissions">
      <TabsList>
        <TabsTrigger value="permissions">
          <KeyRound className="size-3.5 mr-1.5" />
          Permissões
          <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 py-px text-xs font-medium tabular-nums">
            {matrix.totalGranted}
          </span>
        </TabsTrigger>
        <TabsTrigger value="users">
          <Users className="size-3.5 mr-1.5" />
          Utilizadores
          <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 py-px text-xs font-medium tabular-nums">
            {assignedUsers.total}
          </span>
        </TabsTrigger>
        <TabsTrigger value="audit">
          <History className="size-3.5 mr-1.5" />
          Auditoria
        </TabsTrigger>
      </TabsList>

      <TabsContent value="permissions">
        <PermissionMatrix roleId={role.id} matrix={matrix} readOnly={permissionsReadOnly} readOnlyReason={readOnlyReason} />
      </TabsContent>

      <TabsContent value="users">
        <RoleUsersPanel
          role={role}
          assignedUsers={assignedUsers}
          availableUsers={availableUsers}
          canAssignUsers={canAssignUsers}
        />
      </TabsContent>

      <TabsContent value="audit">
        <RoleAuditTrail auditTrail={auditTrail} />
      </TabsContent>
    </Tabs>
  );
}
