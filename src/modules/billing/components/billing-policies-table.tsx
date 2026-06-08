"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal, ChevronLeft, ChevronRight, Pencil, Archive, Star, Eye } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { archiveBillingPolicyAction, setDefaultBillingPolicyAction } from "@/modules/billing/actions/billing-policy.actions";
import {
  BILLING_POLICY_STATUS_LABELS,
  INVOICE_MODE_LABELS,
  ACTIVATION_RULE_LABELS,
} from "@/modules/billing/types";
import type { EnrollmentBillingPolicy } from "@/modules/billing/types";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ARCHIVED: "destructive",
};

interface Props {
  result: PaginatedResult<EnrollmentBillingPolicy>;
  defaultSearch?: string;
  defaultStatus?: string;
  canEdit: boolean;
  onEdit: (policy: EnrollmentBillingPolicy) => void;
}

export function BillingPoliciesTable({ result, defaultSearch, defaultStatus, canEdit, onEdit }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [archiveTarget, setArchiveTarget] = useState<EnrollmentBillingPolicy | null>(null);
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
      const res = await archiveBillingPolicyAction(archiveTarget.id);
      if (res.success) {
        toast({ title: "Política arquivada." });
        setArchiveTarget(null);
        router.refresh();
      } else {
        toast({ title: res.error, variant: "destructive" });
      }
    });
  }

  function handleSetDefault(policyId: string) {
    startTransition(async () => {
      const res = await setDefaultBillingPolicyAction(policyId);
      if (res.success) {
        toast({ title: "Política padrão definida." });
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
          placeholder="Pesquisar política..."
          defaultValue={defaultSearch}
          className="max-w-xs"
          onChange={(e) => { const v = e.target.value; setTimeout(() => updateParam("search", v || undefined), 400); }}
        />
        <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(BILLING_POLICY_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Modo de Fatura</TableHead>
              <TableHead>Regra de Ativação</TableHead>
              <TableHead>Taxas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  Nenhuma política encontrada.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{policy.name}</span>
                      {policy.isDefault && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Star className="size-3" />
                          Padrão
                        </Badge>
                      )}
                    </div>
                    {policy.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{policy.description}</p>
                    )}
                  </TableCell>
                  <TableCell>{INVOICE_MODE_LABELS[policy.invoiceMode] ?? policy.invoiceMode}</TableCell>
                  <TableCell>{ACTIVATION_RULE_LABELS[policy.activationRule] ?? policy.activationRule}</TableCell>
                  <TableCell>{policy.policyFees.length}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[policy.status] ?? "secondary"}>
                      {BILLING_POLICY_STATUS_LABELS[policy.status] ?? policy.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/settings/billing/policies/${policy.id}`}>
                            <Eye className="size-4 mr-2" />
                            Ver Taxas
                          </Link>
                        </DropdownMenuItem>
                        {canEdit && policy.status !== "ARCHIVED" && (
                          <>
                            <DropdownMenuItem onClick={() => onEdit(policy)}>
                              <Pencil className="size-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            {!policy.isDefault && policy.status === "ACTIVE" && (
                              <DropdownMenuItem onClick={() => handleSetDefault(policy.id)}>
                                <Star className="size-4 mr-2" />
                                Definir como Padrão
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setArchiveTarget(policy)}>
                              <Archive className="size-4 mr-2" />
                              Arquivar
                            </DropdownMenuItem>
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
        title="Arquivar Política"
        description={`Tem a certeza que pretende arquivar a política "${archiveTarget?.name}"?`}
        confirmLabel="Arquivar"
        variant="destructive"
        onConfirm={handleArchive}
        loading={pending}
      />
    </div>
  );
}
