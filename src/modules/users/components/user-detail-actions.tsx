"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import {
  disableOrgUserAction,
  enableOrgUserAction,
  removeUserFromOrgAction,
} from "@/modules/users/actions/user.actions";
import { toast } from "@/shared/hooks/use-toast";
import { UserX, UserCheck, Trash2 } from "lucide-react";
import type { OrgUser } from "@/modules/users/types";

interface UserDetailActionsProps {
  user: OrgUser;
}

export function UserDetailActions({ user }: UserDetailActionsProps) {
  const router = useRouter();
  const [showDisable, setShowDisable] = React.useState(false);
  const [showEnable, setShowEnable] = React.useState(false);
  const [showRemove, setShowRemove] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  async function handleDisable() {
    setIsProcessing(true);
    const res = await disableOrgUserAction(user.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Utilizador desativado");
      setShowDisable(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleEnable() {
    setIsProcessing(true);
    const res = await enableOrgUserAction(user.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Utilizador ativado");
      setShowEnable(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleRemove() {
    setIsProcessing(true);
    const res = await removeUserFromOrgAction(user.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Utilizador removido da organização");
      setShowRemove(false);
      router.push("/users");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      {user.isActive ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDisable(true)}
          className="text-destructive hover:text-destructive"
        >
          <UserX className="size-4 mr-1.5" />
          Desativar
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowEnable(true)}>
          <UserCheck className="size-4 mr-1.5" />
          Ativar
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowRemove(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="size-4 mr-1.5" />
        Remover
      </Button>

      <ConfirmDialog
        open={showDisable}
        onOpenChange={setShowDisable}
        title="Desativar Utilizador"
        description={`Tem a certeza que pretende desativar "${user.name}"?`}
        confirmLabel="Desativar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDisable}
      />

      <ConfirmDialog
        open={showEnable}
        onOpenChange={setShowEnable}
        title="Ativar Utilizador"
        description={`Tem a certeza que pretende ativar "${user.name}"?`}
        confirmLabel="Ativar"
        loading={isProcessing}
        onConfirm={handleEnable}
      />

      <ConfirmDialog
        open={showRemove}
        onOpenChange={setShowRemove}
        title="Remover da Organização"
        description={`Tem a certeza que pretende remover "${user.name}" desta organização? Esta ação é irreversível.`}
        confirmLabel="Remover"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleRemove}
      />
    </>
  );
}
