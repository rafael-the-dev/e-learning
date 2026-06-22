"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Archive, RotateCcw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { useToast } from "@/shared/hooks/use-toast";
import {
  archiveOrganizationRoleAction,
  restoreOrganizationRoleAction,
} from "@/modules/roles/actions/role.actions";
import { RoleFormSheet } from "@/modules/roles/components/role-form-sheet";
import type { OrganizationRoleDetail } from "@/modules/roles/types";

interface Props {
  role: OrganizationRoleDetail;
  canUpdate: boolean;
  canArchive: boolean;
}

export function RoleHeaderActions({ role, canUpdate, canArchive }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  function handleArchive() {
    startTransition(async () => {
      const res = await archiveOrganizationRoleAction(role.id);
      if (res.success) {
        toast({ title: "Role arquivada." });
        setArchiveOpen(false);
        router.refresh();
      } else {
        toast({ title: res.error, variant: "destructive" });
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreOrganizationRoleAction(role.id);
      if (res.success) {
        toast({ title: "Role restaurada." });
        setRestoreOpen(false);
        router.refresh();
      } else {
        toast({ title: res.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={role.isSystem ? "secondary" : "info"}>{role.isSystem ? "Sistema" : "Customizada"}</Badge>
      <Badge variant={role.status === "ARCHIVED" ? "destructive" : "success"}>
        {role.status === "ARCHIVED" ? "Arquivada" : "Ativa"}
      </Badge>

      {!role.isSystem && canUpdate && role.status === "ACTIVE" && (
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4 mr-1.5" />
          Editar
        </Button>
      )}

      {!role.isSystem && canArchive && (
        <>
          {role.status === "ACTIVE" ? (
            <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
              <Archive className="size-4 mr-1.5" />
              Arquivar
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setRestoreOpen(true)}>
              <RotateCcw className="size-4 mr-1.5" />
              Restaurar
            </Button>
          )}
        </>
      )}

      <RoleFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        role={role}
        onSuccess={() => {
          setEditOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Arquivar Role"
        description={`Tem a certeza que pretende arquivar a role "${role.name}"? Roles com utilizadores atribuídos não podem ser arquivadas.`}
        confirmLabel="Arquivar"
        variant="destructive"
        onConfirm={handleArchive}
        loading={pending}
      />

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Restaurar Role"
        description={`Tem a certeza que pretende restaurar a role "${role.name}"?`}
        confirmLabel="Restaurar"
        onConfirm={handleRestore}
        loading={pending}
      />
    </div>
  );
}
