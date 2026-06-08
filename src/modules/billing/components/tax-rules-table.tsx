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
import { archiveTaxRuleAction } from "@/modules/billing/actions/tax-rule.actions";
import { TAX_STATUS_LABELS, TAX_APPLIES_TO_LABELS } from "@/modules/billing/types";
import type { TaxRule } from "@/modules/billing/types";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ARCHIVED: "destructive",
};

interface Props {
  result: PaginatedResult<TaxRule>;
  defaultSearch?: string;
  defaultStatus?: string;
  canEdit: boolean;
  onEdit: (tax: TaxRule) => void;
}

export function TaxRulesTable({ result, defaultSearch, defaultStatus, canEdit, onEdit }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [archiveTarget, setArchiveTarget] = useState<TaxRule | null>(null);
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
      const res = await archiveTaxRuleAction(archiveTarget.id);
      if (res.success) {
        toast({ title: "Imposto arquivado." });
        setArchiveTarget(null);
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
          placeholder="Pesquisar código ou nome..."
          defaultValue={defaultSearch}
          className="max-w-xs"
          onChange={(e) => { const v = e.target.value; setTimeout(() => updateParam("search", v || undefined), 400); }}
        />
        <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(TAX_STATUS_LABELS).map(([val, label]) => (
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
              <TableHead className="text-right">Taxa (%)</TableHead>
              <TableHead>Aplica-se a</TableHead>
              <TableHead>Incluído no Preço</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  Nenhum imposto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((tax) => (
                <TableRow key={tax.id}>
                  <TableCell className="font-mono text-sm">{tax.code}</TableCell>
                  <TableCell className="font-medium">{tax.name}</TableCell>
                  <TableCell className="text-right">{tax.rate.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}%</TableCell>
                  <TableCell>{TAX_APPLIES_TO_LABELS[tax.appliesTo] ?? tax.appliesTo}</TableCell>
                  <TableCell>{tax.isIncludedInPrice ? "Sim" : "Não"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[tax.status] ?? "secondary"}>
                      {TAX_STATUS_LABELS[tax.status] ?? tax.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canEdit && tax.status !== "ARCHIVED" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8"><MoreHorizontal className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(tax)}>
                            <Pencil className="size-4 mr-2" />Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setArchiveTarget(tax)}>
                            <Archive className="size-4 mr-2" />Arquivar
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
          <Button variant="outline" size="sm" disabled={!result.hasPreviousPage} onClick={() => updateParam("page", String(result.page - 1))}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="sm" disabled={!result.hasNextPage} onClick={() => updateParam("page", String(result.page + 1))}><ChevronRight className="size-4" /></Button>
        </div>
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Imposto"
        description={`Arquivar o imposto "${archiveTarget?.name}"?`}
        confirmLabel="Arquivar"
        variant="destructive"
        onConfirm={handleArchive}
        loading={pending}
      />
    </div>
  );
}
