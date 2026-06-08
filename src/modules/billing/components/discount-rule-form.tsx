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
import { createDiscountRuleAction, updateDiscountRuleAction } from "@/modules/billing/actions/discount-rule.actions";
import { DISCOUNT_TYPE_LABELS, DISCOUNT_APPLIES_TO_LABELS } from "@/modules/billing/types";
import type { DiscountRule } from "@/modules/billing/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discount?: DiscountRule | null;
  onSuccess: () => void;
}

interface FormValues {
  code: string;
  name: string;
  description: string;
  discountType: string;
  value: string;
  appliesTo: string;
  startDate: string;
  endDate: string;
  stackable: boolean;
}

export function DiscountRuleForm({ open, onOpenChange, discount, onSuccess }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const isEditing = !!discount;

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormValues>({
    defaultValues: { code: "", name: "", description: "", discountType: "PERCENTAGE", value: "", appliesTo: "ENROLLMENT", startDate: "", endDate: "", stackable: false },
  });

  useEffect(() => {
    if (discount) {
      reset({
        code: discount.code,
        name: discount.name,
        description: discount.description ?? "",
        discountType: discount.discountType,
        value: String(discount.value),
        appliesTo: discount.appliesTo,
        startDate: discount.startDate ? discount.startDate.toISOString().split("T")[0] : "",
        endDate: discount.endDate ? discount.endDate.toISOString().split("T")[0] : "",
        stackable: discount.stackable,
      });
    } else {
      reset({ code: "", name: "", description: "", discountType: "PERCENTAGE", value: "", appliesTo: "ENROLLMENT", startDate: "", endDate: "", stackable: false });
    }
  }, [discount, reset]);

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const payload = {
        code: values.code,
        name: values.name,
        description: values.description || undefined,
        discountType: values.discountType as "PERCENTAGE" | "FIXED_AMOUNT",
        value: parseFloat(values.value) || 0,
        appliesTo: values.appliesTo as "ENROLLMENT" | "COURSE" | "ALL",
        startDate: values.startDate || null,
        endDate: values.endDate || null,
        stackable: values.stackable,
      };

      const result = isEditing
        ? await updateDiscountRuleAction({ discountRuleId: discount!.id, ...payload })
        : await createDiscountRuleAction(payload);

      if (result.success) {
        toast({ title: isEditing ? "Desconto atualizado." : "Desconto criado." });
        onOpenChange(false);
        onSuccess();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar Desconto" : "Novo Desconto"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input {...register("code")} placeholder="DESC-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select defaultValue="PERCENTAGE" onValueChange={(v) => setValue("discountType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DISCOUNT_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input {...register("name")} placeholder="Desconto de Irmão" />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea {...register("description")} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <Input {...register("value")} type="number" step="0.01" min="0" placeholder="10" />
            </div>
            <div className="space-y-1.5">
              <Label>Aplica-se a</Label>
              <Select defaultValue="ENROLLMENT" onValueChange={(v) => setValue("appliesTo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DISCOUNT_APPLIES_TO_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Data de Início</Label>
              <Input {...register("startDate")} type="date" />
            </div>
            <div className="space-y-1.5">
              <Label>Data de Fim</Label>
              <Input {...register("endDate")} type="date" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={watch("stackable")} onCheckedChange={(v) => setValue("stackable", v)} id="stackable" />
            <Label htmlFor="stackable">Cumulável com outros descontos</Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={pending}>{isEditing ? "Guardar" : "Criar Desconto"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
