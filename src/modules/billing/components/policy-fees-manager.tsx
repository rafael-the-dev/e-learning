"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { addPolicyFeeAction, updatePolicyFeeAction, removePolicyFeeAction } from "@/modules/billing/actions/billing-policy.actions";
import { FEE_TYPE_LABELS, POLICY_FEE_AMOUNT_TYPE_LABELS, POLICY_FEE_STATUS_LABELS } from "@/modules/billing/types";
import type { EnrollmentBillingPolicy, PolicyFee, FeeDefinition } from "@/modules/billing/types";

interface Props {
  policy: EnrollmentBillingPolicy;
  availableFees: FeeDefinition[];
  canEdit: boolean;
}

interface FormValues {
  feeDefinitionId: string;
  amountType: string;
  fixedAmount: string;
  percentage: string;
  isRequired: boolean;
  priority: string;
}

const AMOUNT_TYPE_LABELS = POLICY_FEE_AMOUNT_TYPE_LABELS;

export function PolicyFeesManager({ policy, availableFees, canEdit }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PolicyFee | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PolicyFee | null>(null);
  const [pending, startTransition] = useTransition();

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormValues>({
    defaultValues: { feeDefinitionId: "", amountType: "FIXED", fixedAmount: "", percentage: "", isRequired: true, priority: "7" },
  });

  const amountType = watch("amountType");

  function openAdd() {
    setEditTarget(null);
    reset({ feeDefinitionId: "", amountType: "FIXED", fixedAmount: "", percentage: "", isRequired: true, priority: "7" });
    setSheetOpen(true);
  }

  function openEdit(fee: PolicyFee) {
    setEditTarget(fee);
    reset({
      feeDefinitionId: fee.feeDefinitionId,
      amountType: fee.amountType,
      fixedAmount: fee.fixedAmount ? String(fee.fixedAmount) : "",
      percentage: fee.percentage ? String(fee.percentage) : "",
      isRequired: fee.isRequired,
      priority: String(fee.priority),
    });
    setSheetOpen(true);
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const payload = {
        policyId: policy.id,
        feeDefinitionId: values.feeDefinitionId,
        amountType: values.amountType as "FIXED" | "PERCENTAGE_OF_COURSE_PRICE" | "COURSE_BASE_PRICE",
        fixedAmount: values.fixedAmount ? parseFloat(values.fixedAmount) : null,
        percentage: values.percentage ? parseFloat(values.percentage) : null,
        isRequired: values.isRequired,
        priority: parseInt(values.priority) || 7,
      };

      const result = editTarget
        ? await updatePolicyFeeAction({ policyFeeId: editTarget.id, ...payload })
        : await addPolicyFeeAction(payload);

      if (result.success) {
        toast({ title: editTarget ? "Taxa atualizada." : "Taxa adicionada." });
        setSheetOpen(false);
        router.refresh();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  function handleRemove() {
    if (!removeTarget) return;
    startTransition(async () => {
      const result = await removePolicyFeeAction(removeTarget.id, policy.id);
      if (result.success) {
        toast({ title: "Taxa removida." });
        setRemoveTarget(null);
        router.refresh();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  const usedFeeIds = new Set(policy.policyFees.map((f) => f.feeDefinitionId));
  const selectableFees = availableFees.filter((f) => !usedFeeIds.has(f.id) || editTarget?.feeDefinitionId === f.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Taxas da Política</h2>
        {canEdit && policy.status !== "ARCHIVED" && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4 mr-1.5" />
            Adicionar Taxa
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Taxa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Modo de Valor</TableHead>
              <TableHead className="text-right">Valor / %</TableHead>
              <TableHead>Obrigatória</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {policy.policyFees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhuma taxa configurada. Adicione taxas para gerar faturas automaticamente.
                </TableCell>
              </TableRow>
            ) : (
              policy.policyFees.map((pf) => (
                <TableRow key={pf.id}>
                  <TableCell>
                    <div className="font-medium">{pf.feeDefinitionName}</div>
                    <div className="text-xs text-muted-foreground">{pf.feeDefinitionCode}</div>
                  </TableCell>
                  <TableCell>{FEE_TYPE_LABELS[pf.feeDefinitionType] ?? pf.feeDefinitionType}</TableCell>
                  <TableCell>{AMOUNT_TYPE_LABELS[pf.amountType] ?? pf.amountType}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {pf.amountType === "PERCENTAGE_OF_COURSE_PRICE"
                      ? `${pf.percentage ?? 0}%`
                      : pf.amountType === "COURSE_BASE_PRICE"
                      ? "Preço do Curso"
                      : (pf.fixedAmount ?? pf.feeDefinitionDefaultAmount).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>{pf.isRequired ? "Sim" : "Não"}</TableCell>
                  <TableCell>
                    <Badge variant={pf.status === "ACTIVE" ? "default" : "secondary"}>
                      {POLICY_FEE_STATUS_LABELS[pf.status] ?? pf.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canEdit && policy.status !== "ARCHIVED" && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(pf)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setRemoveTarget(pf)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editTarget ? "Editar Taxa" : "Adicionar Taxa"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            {!editTarget && (
              <div className="space-y-1.5">
                <Label>Taxa *</Label>
                <Select onValueChange={(v) => setValue("feeDefinitionId", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma taxa..." /></SelectTrigger>
                  <SelectContent>
                    {selectableFees.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name} ({f.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Tipo de Valor</Label>
              <Select defaultValue="FIXED" onValueChange={(v) => setValue("amountType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(AMOUNT_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {amountType === "FIXED" && (
              <div className="space-y-1.5">
                <Label>Valor Fixo *</Label>
                <Input {...register("fixedAmount")} type="number" step="0.01" min="0" placeholder="0.00" />
              </div>
            )}

            {amountType === "PERCENTAGE_OF_COURSE_PRICE" && (
              <div className="space-y-1.5">
                <Label>Percentagem (%) *</Label>
                <Input {...register("percentage")} type="number" step="0.01" min="0" max="100" placeholder="10" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Input {...register("priority")} type="number" min="1" max="99" />
              </div>
              <div className="flex items-end gap-3 pb-0.5">
                <Switch checked={watch("isRequired")} onCheckedChange={(v) => setValue("isRequired", v)} id="isReq" />
                <Label htmlFor="isReq">Obrigatória</Label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>Cancelar</Button>
              <Button type="submit" loading={pending}>{editTarget ? "Guardar" : "Adicionar"}</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remover Taxa"
        description={`Remover a taxa "${removeTarget?.feeDefinitionName}" desta política?`}
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={handleRemove}
        loading={pending}
      />
    </div>
  );
}
