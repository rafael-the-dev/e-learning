"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { EditOrganizationForm } from "@/modules/organizations/components/organization-form";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  suspendOrganizationAction,
  activateOrganizationAction,
} from "@/modules/organizations/actions/organization.actions";
import { toast } from "@/shared/hooks/use-toast";
import { Pencil, MoreHorizontal, PauseCircle, PlayCircle } from "lucide-react";
import type { Organization } from "@prisma/client";

interface OrgDetailActionsProps {
  organization: Organization;
}

export function OrgDetailActions({ organization }: OrgDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [suspendOpen, setSuspendOpen] = React.useState(false);
  const [activateOpen, setActivateOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSuspend() {
    setLoading(true);
    const result = await suspendOrganizationAction(organization.id);
    setLoading(false);
    if (result.success) {
      toast.success("Organização suspensa");
      setSuspendOpen(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleActivate() {
    setLoading(true);
    const result = await activateOrganizationAction(organization.id);
    setLoading(false);
    if (result.success) {
      toast.success("Organização ativada");
      setActivateOpen(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="size-4" />
        Editar
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-9">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {organization.status === "SUSPENDED" ? (
            <DropdownMenuItem onClick={() => setActivateOpen(true)}>
              <PlayCircle className="size-4" />
              Ativar
            </DropdownMenuItem>
          ) : (
            organization.status !== "CANCELLED" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setSuspendOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <PauseCircle className="size-4" />
                  Suspender
                </DropdownMenuItem>
              </>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditOrganizationForm
        open={editOpen}
        onOpenChange={setEditOpen}
        organization={organization}
        onSuccess={() => router.refresh()}
      />

      <ConfirmDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title="Suspender Organização"
        description={`Tem a certeza que pretende suspender "${organization.name}"? Os utilizadores perderão o acesso imediatamente.`}
        confirmLabel="Suspender"
        variant="destructive"
        loading={loading}
        onConfirm={handleSuspend}
      />

      <ConfirmDialog
        open={activateOpen}
        onOpenChange={setActivateOpen}
        title="Ativar Organização"
        description={`Restaurar o acesso de "${organization.name}"?`}
        confirmLabel="Ativar"
        loading={loading}
        onConfirm={handleActivate}
      />
    </>
  );
}
