"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import {
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Copy,
  Archive,
  RotateCcw,
  Lock,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { useToast } from "@/shared/hooks/use-toast";
import {
  archiveOrganizationRoleAction,
  restoreOrganizationRoleAction,
} from "@/modules/roles/actions/role.actions";
import { ROLE_LABELS } from "@/modules/users/types";
import type { OrganizationRoleListItem } from "@/modules/roles/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<OrganizationRoleListItem>;
  canArchive: boolean;
  defaultSearch?: string;
  defaultType?: string;
  defaultStatus?: string;
  onEdit: (role: OrganizationRoleListItem) => void;
  onDuplicate: (role: OrganizationRoleListItem) => void;
}

export function RolesTable({
  result,
  canArchive,
  defaultSearch,
  defaultType,
  defaultStatus,
  onEdit,
  onDuplicate,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [archiveTarget, setArchiveTarget] = useState<OrganizationRoleListItem | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<OrganizationRoleListItem | null>(null);
  const [pending, startTransition] = useTransition();

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  function handleArchive() {
    if (!archiveTarget) return;
    startTransition(async () => {
      const res = await archiveOrganizationRoleAction(archiveTarget.id);
      if (res.success) {
        toast({ title: "Role arquivada." });
        setArchiveTarget(null);
        router.refresh();
      } else {
        toast({ title: res.error, variant: "destructive" });
      }
    });
  }

  function handleRestore() {
    if (!restoreTarget) return;
    startTransition(async () => {
      const res = await restoreOrganizationRoleAction(restoreTarget.id);
      if (res.success) {
        toast({ title: "Role restaurada." });
        setRestoreTarget(null);
        router.refresh();
      } else {
        toast({ title: res.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar por nome ou código..."
          defaultValue={defaultSearch}
          className="max-w-xs"
          onChange={(e) => {
            const v = e.target.value;
            setTimeout(() => updateParam("search", v || undefined), 400);
          }}
        />
        <Select defaultValue={defaultType ?? "ALL"} onValueChange={(v) => updateParam("type", v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            <SelectItem value="system">Sistema</SelectItem>
            <SelectItem value="custom">Customizada</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            <SelectItem value="ACTIVE">Ativa</SelectItem>
            <SelectItem value="ARCHIVED">Arquivada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Permissões</TableHead>
              <TableHead>Utilizadores</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  Nenhuma role encontrada.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ROLE_LABELS[role.name] ?? role.name}</span>
                      {role.isSystem && <Lock className="size-3.5 text-muted-foreground" />}
                    </div>
                    {role.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{role.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {role.code ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={role.isSystem ? "secondary" : "info"}>
                      {role.isSystem ? "Sistema" : "Customizada"}
                    </Badge>
                  </TableCell>
                  <TableCell>{role.permissionCount}</TableCell>
                  <TableCell>{role.userCount}</TableCell>
                  <TableCell>
                    <Badge variant={role.status === "ARCHIVED" ? "destructive" : "success"}>
                      {role.status === "ARCHIVED" ? "Arquivada" : "Ativa"}
                    </Badge>
                  </TableCell>
                  <TableCell>{role.createdAt.toLocaleDateString("pt-PT")}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/settings/roles/${role.id}`}>
                            <Eye className="size-4 mr-2" />
                            Ver
                          </Link>
                        </DropdownMenuItem>
                        {!role.isSystem && role.status === "ACTIVE" && (
                          <DropdownMenuItem onClick={() => onEdit(role)}>
                            <Pencil className="size-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onDuplicate(role)}>
                          <Copy className="size-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        {canArchive && !role.isSystem && (
                          <>
                            <DropdownMenuSeparator />
                            {role.status === "ACTIVE" ? (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setArchiveTarget(role)}
                              >
                                <Archive className="size-4 mr-2" />
                                Arquivar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setRestoreTarget(role)}>
                                <RotateCcw className="size-4 mr-2" />
                                Restaurar
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">
            Página {result.page} de {result.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!result.hasPreviousPage}
            onClick={() => updateParam("page", String(result.page - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!result.hasNextPage}
            onClick={() => updateParam("page", String(result.page + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Role"
        description={`Tem a certeza que pretende arquivar a role "${archiveTarget?.name}"? Roles com utilizadores atribuídos não podem ser arquivadas.`}
        confirmLabel="Arquivar"
        variant="destructive"
        onConfirm={handleArchive}
        loading={pending}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Restaurar Role"
        description={`Tem a certeza que pretende restaurar a role "${restoreTarget?.name}"?`}
        confirmLabel="Restaurar"
        onConfirm={handleRestore}
        loading={pending}
      />
    </div>
  );
}
