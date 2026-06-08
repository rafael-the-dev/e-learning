"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { MoreHorizontal, ChevronLeft, ChevronRight, Pencil, Archive } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { archiveFeeDefinitionAction } from "@/modules/billing/actions/fee-definition.actions";
import { FEE_TYPE_LABELS, FEE_STATUS_LABELS } from "@/modules/billing/types";
import type { FeeDefinition } from "@/modules/billing/types";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ARCHIVED: "destructive",
};

interface Props {
  result: PaginatedResult<FeeDefinition>;
  defaultSearch?: string;
  defaultStatus?: string;
  canEdit: boolean;
  onEdit: (fee: FeeDefinition) => void;
}

export function FeeDefinitionsTable({ result, defaultSearch, defaultStatus, canEdit, onEdit }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [archiveTarget, setArchiveTarget] = useState<FeeDefinition | null>(null);
  const [pending, startTransition] = useTransition();

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL") { params.set(key, value); } else { params.delete(key); }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  function handleArchive() {
    if (!archiveTarget) return;
    startTransition(async () => {
      const result = await archiveFeeDefinitionAction(archiveTarget.id);
      if (result.success) {
        toast({ title: "Taxa arquivada com sucesso." });
        setArchiveTarget(null);
        router.refresh();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar código ou nome..."
          defaultValue={defaultSearch}
          className="max-w-xs"
          onChange={(e) => {
            const v = e.target.value;
            setTimeout(() => updateParam("search", v || undefined), 400);
          }}
        />
        <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(FEE_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor Padrão</TableHead>
              <TableHead>Obrigatória</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  Nenhuma taxa encontrada.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((fee) => (
                <TableRow key={fee.id}>
                  <TableCell className="font-mono text-sm">{fee.code}</TableCell>
                  <TableCell className="font-medium">{fee.name}</TableCell>
                  <TableCell>{FEE_TYPE_LABELS[fee.feeType] ?? fee.feeType}</TableCell>
                  <TableCell className="text-right">
                    {fee.defaultAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>{fee.isMandatory ? "Sim" : "Não"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[fee.status] ?? "secondary"}>
                      {FEE_STATUS_LABELS[fee.status] ?? fee.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canEdit && fee.status !== "ARCHIVED" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(fee)}>
                            <Pencil className="size-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setArchiveTarget(fee)}>
                            <Archive className="size-4 mr-2" />
                            Arquivar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">Página {result.page} de {result.totalPages}</span>
          <Button variant="outline" size="sm" disabled={!result.hasPreviousPage} onClick={() => updateParam("page", String(result.page - 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={!result.hasNextPage} onClick={() => updateParam("page", String(result.page + 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Taxa"
        description={`Tem a certeza que pretende arquivar a taxa "${archiveTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Arquivar"
        variant="destructive"
        onConfirm={handleArchive}
        loading={pending}
      />
    </div>
  );
}
