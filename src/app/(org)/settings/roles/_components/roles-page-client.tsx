"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Shield, Users, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { RolesTable } from "@/modules/roles/components/roles-table";
import { RoleFormSheet } from "@/modules/roles/components/role-form-sheet";
import { DuplicateRoleDialog } from "@/modules/roles/components/duplicate-role-dialog";
import type { OrganizationRoleListItem, RoleKpis } from "@/modules/roles/types";
import type { OrganizationRoleOption } from "@/modules/roles/repositories/organization-role.repository";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<OrganizationRoleListItem>;
  kpis: RoleKpis;
  roleOptions: OrganizationRoleOption[];
  canCreate: boolean;
  canArchive: boolean;
  search?: string;
  type?: string;
  status?: string;
}

export function RolesPageClient({
  result,
  kpis,
  roleOptions,
  canCreate,
  canArchive,
  search,
  type,
  status,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrganizationRoleListItem | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | undefined>(undefined);

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Total de Roles" value={kpis.totalRoles} icon={<Shield className="size-4" />} />
        <StatCard title="Roles do Sistema" value={kpis.systemRoles} icon={<ShieldCheck className="size-4" />} />
        <StatCard title="Roles Customizadas" value={kpis.customRoles} icon={<KeyRound className="size-4" />} />
        <StatCard title="Utilizadores com Role" value={kpis.usersWithRole} icon={<Users className="size-4" />} />
        <StatCard title="Permissões Globais" value={kpis.totalPermissions} icon={<KeyRound className="size-4" />} />
        <StatCard title="Roles Arquivadas" value={kpis.archivedRoles} icon={<ShieldOff className="size-4" />} />
      </div>

      {canCreate && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDuplicateSourceId(undefined);
              setDuplicateOpen(true);
            }}
          >
            <Copy className="size-4 mr-1.5" />
            Duplicar Role
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1.5" />
            Nova Role
          </Button>
        </div>
      )}

      <RolesTable
        result={result}
        canArchive={canArchive}
        defaultSearch={search}
        defaultType={type}
        defaultStatus={status}
        onEdit={(role) => setEditTarget(role)}
        onDuplicate={(role) => {
          setDuplicateSourceId(role.id);
          setDuplicateOpen(true);
        }}
      />

      <RoleFormSheet
        open={createOpen || !!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditTarget(null);
          }
        }}
        role={editTarget}
        onSuccess={() => {
          setCreateOpen(false);
          setEditTarget(null);
          router.refresh();
        }}
      />

      <DuplicateRoleDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        roleOptions={roleOptions}
        defaultSourceId={duplicateSourceId}
        onSuccess={() => {
          setDuplicateOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
