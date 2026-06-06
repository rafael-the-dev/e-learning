"use client";

import { z } from "zod";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { createInvoiceSchema, type CreateInvoiceInput } from "@/modules/finance/schemas/invoice.schema";
import { createInvoiceAction } from "@/modules/finance/actions/invoice.actions";
import { INVOICE_ITEM_TYPE_LABELS } from "@/modules/finance/types";

interface StudentOption {
  id: string;
  fullName: string;
}

interface Props {
  students: StudentOption[];
  defaultStudentId?: string;
}

const ITEM_TYPES = Object.entries(INVOICE_ITEM_TYPE_LABELS) as [string, string][];

export function CreateInvoiceForm({ students, defaultStudentId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<CreateInvoiceInput>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      studentId: defaultStudentId ?? "",
      discountAmount: 0,
      taxAmount: 0,
      items: [{ description: "", quantity: 1, unitPrice: 0, itemType: "OTHER" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const items = watch("items");
  const discount = watch("discountAmount") ?? 0;
  const tax = watch("taxAmount") ?? 0;

  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);
  const total = subtotal - (Number(discount) || 0) + (Number(tax) || 0);

  function onSubmit(data: CreateInvoiceInput) {
    startTransition(async () => {
      const result = await createInvoiceAction({
        ...data,
        studentId: data.studentId || undefined,
        discountAmount: Number(data.discountAmount) || 0,
        taxAmount: Number(data.taxAmount) || 0,
        items: data.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      });
      if (result.success) {
        toast.success("Fatura criada com sucesso");
        router.push(`/invoices/${result.data.id}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
      {/* Student */}
      <div className="space-y-2">
        <Label>Aluno</Label>
        <Controller
          control={control}
          name="studentId"
          render={({ field }) => (
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar aluno (opcional)..." />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.studentId && (
          <p className="text-sm text-destructive">{errors.studentId.message}</p>
        )}
      </div>

      {/* Due date */}
      <div className="space-y-2">
        <Label>Data de Vencimento</Label>
        <Input type="date" className="max-w-xs" {...register("dueDate")} />
      </div>

      {/* Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Itens *</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ description: "", quantity: 1, unitPrice: 0, itemType: "OTHER" })}
          >
            <Plus className="size-4 mr-1" />
            Adicionar item
          </Button>
        </div>

        {errors.items && !Array.isArray(errors.items) && (
          <p className="text-sm text-destructive">{(errors.items as { message?: string }).message}</p>
        )}

        <div className="space-y-2">
          {fields.map((field, index) => {
            const qty = Number(items[index]?.quantity) || 0;
            const price = Number(items[index]?.unitPrice) || 0;
            const lineTotal = qty * price;

            return (
              <div key={field.id} className="rounded-md border bg-card p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Descrição *</Label>
                    <Input
                      placeholder="Descrição do item..."
                      {...register(`items.${index}.description`)}
                    />
                    {errors.items?.[index]?.description && (
                      <p className="text-xs text-destructive">{errors.items[index]?.description?.message}</p>
                    )}
                  </div>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive mt-5"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-[160px_90px_120px_1fr] gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tipo</Label>
                    <Controller
                      control={control}
                      name={`items.${index}.itemType`}
                      render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ITEM_TYPES.map(([val, label]) => (
                              <SelectItem key={val} value={val}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Qtd. *</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      className="h-8 text-sm"
                      {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                    />
                    {errors.items?.[index]?.quantity && (
                      <p className="text-xs text-destructive">{errors.items[index]?.quantity?.message}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Preço unit. *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-8 text-sm"
                      {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                    />
                    {errors.items?.[index]?.unitPrice && (
                      <p className="text-xs text-destructive">{errors.items[index]?.unitPrice?.message}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Total</Label>
                    <div className="h-8 flex items-center text-sm font-medium tabular-nums">
                      {lineTotal.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Discount & Tax */}
      <div className="grid grid-cols-2 gap-4 max-w-xs">
        <div className="space-y-2">
          <Label>Desconto</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register("discountAmount", { valueAsNumber: true })}
          />
          {errors.discountAmount && (
            <p className="text-sm text-destructive">{errors.discountAmount.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Taxa / IVA</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register("taxAmount", { valueAsNumber: true })}
          />
          {errors.taxAmount && (
            <p className="text-sm text-destructive">{errors.taxAmount.message}</p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notas</Label>
        <Textarea placeholder="Observações adicionais..." rows={3} {...register("notes")} />
      </div>

      {/* Totals summary */}
      <div className="rounded-lg border bg-muted/40 px-5 py-4 space-y-2 text-sm max-w-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{subtotal.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
        </div>
        {Number(discount) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Desconto</span>
            <span className="tabular-nums text-destructive">-{Number(discount).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
          </div>
        )}
        {Number(tax) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxa</span>
            <span className="tabular-nums">+{Number(tax).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t pt-2">
          <span>Total</span>
          <span className="tabular-nums">{total.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "A criar..." : "Criar Fatura"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      <