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
import { archiveDiscountRuleAction } from "@/modules/billing/actions/discount-rule.actions";
import { DISCOUNT_TYPE_LABELS, DISCOUNT_STATUS_LABELS, DISCOUNT_APPLIES_TO_LABELS } from "@/modules/billing/types";
import type { DiscountRule } from "@/modules/billing/types";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ARCHIVED: "destructive",
};

interface Props {
  result: PaginatedResult<DiscountRule>;
  defaultSearch?: string;
  defaultStatus?: string;
  canEdit: boolean;
  onEdit: (discount: DiscountRule) => void;
}

export function DiscountRulesTable({ result, defaultSearch, defaultStatus, canEdit, onEdit }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [archiveTarget, setArchiveTarget] = useState<DiscountRule | null>(null);
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
      const res = await archiveDiscountRuleAction(archiveTarget.id);
      if (res.success) {
        toast({ title: "Desconto arquivado." });
        setArchiveTarget(null);
        router.refresh();
      } else {
        toast({ title: res.error, variant: "destructive" });
      }
    });
  }

  function isActive(rule: DiscountRule): boolean {
    if (rule.status !== "ACTIVE") return false;
    const now = new Date();
    if (rule.startDate && rule.startDate > now) return false;
    if (rule.endDate && rule.endDate < now) return false;
    return true;
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
            {Object.entries(DISCOUNT_STATUS_LABELS).map(([val, label]) => (
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
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Aplica-se a</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  Nenhum desconto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-sm">{rule.code}</TableCell>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>{DISCOUNT_TYPE_LABELS[rule.discountType] ?? rule.discountType}</TableCell>
                  <TableCell className="text-right">
                    {rule.discountType === "PERCENTAGE"
                      ? `${rule.value}%`
                      : rule.value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>{DISCOUNT_APPLIES_TO_LABELS[rule.appliesTo] ?? rule.appliesTo}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {rule.startDate ? rule.startDate.toLocaleDateString("pt-PT") : "—"}
                    {" "}→{" "}
                    {rule.endDate ? rule.endDate.toLocaleDateString("pt-PT") : "Sem fim"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isActive(rule) ? "default" : STATUS_VARIANT[rule.status] ?? "secondary"}>
                      {isActive(rule) ? "Ativo" : (DISCOUNT_STATUS_LABELS[rule.status] ?? rule.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canEdit && rule.status !== "ARCHIVED" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8"><MoreHorizontal className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(rule)}>
                            <Pencil className="size-4 mr-2" />Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setArchiveTarget(rule)}>
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
        title="Arquivar Desconto"
        description={`Arquivar o desconto "${archiveTarget?.name}"?`}
        confirmLabel="Arquivar"
        variant="destructive"
        onConfirm={handleArchive}
        loading={pending}
      />
    </div>
  );
}
