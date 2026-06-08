"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { useToast } from "@/shared/hooks/use-toast";
import { createFeeDefinitionAction, updateFeeDefinitionAction } from "@/modules/billing/actions/fee-definition.actions";
import { FEE_TYPE_LABELS, FEE_APPLIES_TO_LABELS } from "@/modules/billing/types";
import type { FeeDefinition } from "@/modules/billing/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fee?: FeeDefinition | null;
  onSuccess: () => void;
}

interface FormValues {
  code: string;
  name: string;
  description: string;
  feeType: string;
  defaultAmount: string;
  appliesTo: string;
  isMandatory: boolean;
  priority: string;
}

export function FeeDefinitionForm({ open, onOpenChange, fee, onSuccess }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const isEditing = !!fee;

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      code: "",
      name: "",
      description: "",
      feeType: "OTHER",
      defaultAmount: "",
      appliesTo: "ENROLLMENT",
      isMandatory: false,
      priority: "7",
    },
  });

  useEffect(() => {
    if (fee) {
      reset({
        code: fee.code,
        name: fee.name,
        description: fee.description ?? "",
        feeType: fee.feeType,
        defaultAmount: String(fee.defaultAmount),
        appliesTo: fee.appliesTo,
        isMandatory: fee.isMandatory,
        priority: String(fee.priority),
      });
    } else {
      reset({ code: "", name: "", description: "", feeType: "OTHER", defaultAmount: "", appliesTo: "ENROLLMENT", isMandatory: false, priority: "7" });
    }
  }, [fee, reset]);

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const payload = {
        code: values.code,
        name: values.name,
        description: values.description || undefined,
        feeType: values.feeType as Parameters<typeof createFeeDefinitionAction>[0]["feeType"],
        defaultAmount: parseFloat(values.defaultAmount) || 0,
        appliesTo: values.appliesTo as Parameters<typeof createFeeDefinitionAction>[0]["appliesTo"],
        isMandatory: values.isMandatory,
        priority: parseInt(values.priority) || 7,
      };

      const result = isEditing
        ? await updateFeeDefinitionAction({ feeDefinitionId: fee!.id, ...payload })
        : await createFeeDefinitionAction(payload);

      if (result.success) {
        toast({ title: isEditing ? "Taxa atualizada." : "Taxa criada." });
        onOpenChange(false);
        onSuccess();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  const isMandatory = watch("isMandatory");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar Taxa" : "Nova Taxa"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input {...register("code")} placeholder="REG-001" />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Input {...register("priority")} type="number" min="1" max="99" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input {...register("name")} placeholder="Taxa de Inscrição" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea {...register("description")} rows={2} placeholder="Descrição opcional..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo de Taxa *</Label>
              <Select defaultValue="OTHER" onValueChange={(v) => setValue("feeType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FEE_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Aplica-se a</Label>
              <Select defaultValue="ENROLLMENT" onValueChange={(v) => setValue("appliesTo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FEE_APPLIES_TO_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Valor Padrão *</Label>
            <Input {...register("defaultAmount")} type="number" step="0.01" min="0" placeholder="0.00" />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isMandatory} onCheckedChange={(v) => setValue("isMandatory", v)} id="isMandatory" />
            <Label htmlFor="isMandatory">Taxa Obrigatória</Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={pending}>{isEditing ? "Guardar Alterações" : "Criar Taxa"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
