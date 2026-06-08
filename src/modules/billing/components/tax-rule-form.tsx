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
import { createTaxRuleAction, updateTaxRuleAction } from "@/modules/billing/actions/tax-rule.actions";
import { TAX_APPLIES_TO_LABELS } from "@/modules/billing/types";
import type { TaxRule } from "@/modules/billing/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tax?: TaxRule | null;
  onSuccess: () => void;
}

interface FormValues {
  code: string;
  name: string;
  description: string;
  rate: string;
  appliesTo: string;
  isIncludedInPrice: boolean;
}

export function TaxRuleForm({ open, onOpenChange, tax, onSuccess }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const isEditing = !!tax;

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormValues>({
    defaultValues: { code: "", name: "", description: "", rate: "", appliesTo: "ENROLLMENT", isIncludedInPrice: false },
  });

  useEffect(() => {
    if (tax) {
      reset({ code: tax.code, name: tax.name, description: tax.description ?? "", rate: String(tax.rate), appliesTo: tax.appliesTo, isIncludedInPrice: tax.isIncludedInPrice });
    } else {
      reset({ code: "", name: "", description: "", rate: "", appliesTo: "ENROLLMENT", isIncludedInPrice: false });
    }
  }, [tax, reset]);

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const payload = {
        code: values.code,
        name: values.name,
        description: values.description || undefined,
        rate: parseFloat(values.rate) || 0,
        appliesTo: values.appliesTo as "ENROLLMENT" | "COURSE" | "ALL",
        isIncludedInPrice: values.isIncludedInPrice,
      };

      const result = isEditing
        ? await updateTaxRuleAction({ taxRuleId: tax!.id, ...payload })
        : await createTaxRuleAction(payload);

      if (result.success) {
        toast({ title: isEditing ? "Imposto atualizado." : "Imposto criado." });
        onOpenChange(false);
        onSuccess();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar Imposto" : "Novo Imposto"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input {...register("code")} placeholder="IVA" />
            </div>
            <div className="space-y-1.5">
              <Label>Taxa (%) *</Label>
              <Input {...register("rate")} type="number" step="0.01" min="0" max="100" placeholder="16" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input {...register("name")} placeholder="IVA 16%" />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea {...register("description")} rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label>Aplica-se a</Label>
            <Select defaultValue="ENROLLMENT" onValueChange={(v) => setValue("appliesTo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TAX_APPLIES_TO_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={watch("isIncludedInPrice")} onCheckedChange={(v) => setValue("isIncludedInPrice", v)} id="included" />
            <Label htmlFor="included">Incluído no preço (não adicionar ao total)</Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={pending}>{isEditing ? "Guardar" : "Criar Imposto"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
