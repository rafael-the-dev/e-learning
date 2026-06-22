"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserMinus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { useToast } from "@/shared/hooks/use-toast";
import { assignUserRoleAction, removeUserRoleAction } from "@/modules/users/actions/user.actions";
import type { OrganizationRoleDetail, RoleAssignedUser } from "@/modules/roles/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  role: OrganizationRoleDetail;
  assignedUsers: PaginatedResult<RoleAssignedUser>;
  availableUsers: { id: string; name: string; email: string }[];
  canAssignUsers: boolean;
}

export function RoleUsersPanel({ role, assignedUsers, availableUsers, canAssignUsers }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const [removeTarget, setRemoveTarget] = useState<RoleAssignedUser | null>(null);

  const isArchived = role.status === "ARCHIVED";
  const canAdd = canAssignUsers && !isArchived;
  const canRemove = canAssignUsers;

  function handleAdd() {
    if (!selectedUserId) return;
    startTransition(async () => {
      const res = await assignUserRoleAction(selectedUserId, role.id);
      if (res.success) {
        toast({ title: "Utilizador atribuído." });
        setAddOpen(false);
        setSelectedUserId(undefined);
        router.refresh();
      } else {
        toast({ title: res.error, variant: "destructive" });
      }
    });
  }

  function handleRemove() {
    if (!removeTarget) return;
    startTransition(async () => {
      const res = await removeUserRoleAction(removeTarget.userId);
      if (res.success) {
        toast({ title: "Utilizador removido da role." });
        setRemoveTarget(null);
        router.refresh();
      } else {
        toast({ title: res.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {isArchived && (
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          Esta role está arquivada e não pode receber novos utilizadores.
        </div>
      )}

      {canAdd && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4 mr-1.5" />
            Adicionar Utilizador
          </Button>
        </div>
      )}

      {assignedUsers.data.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="size-8" />}
          title="Sem utilizadores atribuídos"
          description="Ainda não há utilizadores com esta role nesta organização."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Data de Atribuição</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignedUsers.data.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "success" : "secondary"}>
                      {user.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.assignedAt.toLocaleDateString("pt-PT")}</TableCell>
                  <TableCell>
                    {canRemove && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => setRemoveTarget(user)}
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Utilizador</DialogTitle>
          </DialogHeader>

          {availableUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todos os utilizadores da organização já têm esta role atribuída.
            </p>
          ) : (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um utilizador" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <p className="text-xs text-muted-foreground">
            Atribuir esta role substitui qualquer outra role que o utilizador já tenha nesta organização.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={!selectedUserId} loading={pending}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remover Utilizador"
        description={`Esta ação removerá todo o acesso de "${removeTarget?.name}" a esta organização, uma vez que esta é a única role atribuída. Tem a certeza?`}
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={handleRemove}
        loading={pending}
      />
    </div>
  );
}
