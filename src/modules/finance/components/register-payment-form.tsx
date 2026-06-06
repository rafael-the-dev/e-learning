"use client";

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
import { registerPaymentSchema, type RegisterPaymentInput } from "@/modules/finance/schemas/payment.schema";
import { registerPaymentAction } from "@/modules/finance/actions/payment.actions";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/types";

interface Invoice {
  id: string;
  invoiceNumber: string;
  studentName: string | null;
  balanceAmount: number;
  studentId: string | null;
}

interface Props {
  invoices: Invoice[];
  defaultInvoiceId?: string;
}

export function RegisterPaymentForm({ invoices, defaultInvoiceId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterPaymentInput>({
    resolver: zodResolver(registerPaymentSchema),
    defaultValues: {
      invoiceId: defaultInvoiceId ?? "",
      splits: [{ method: "CASH", amount: 0, reference: "", notes: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "splits" });

  const selectedInvoiceId = watch("invoiceId");
  const splits = watch("splits");

  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId);
  const paymentTotal = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  const overpayment = selectedInvoice ? Math.max(0, paymentTotal - selectedInvoice.balanceAmount) : 0;
  const finalRemaining = selectedInvoice ? Math.max(0, selectedInvoice.balanceAmount - paymentTotal) : null;

  function onSubmit(data: RegisterPaymentInput) {
    startTransition(async () => {
      const result = await registerPaymentAction(data);
      if (result.success) {
        toast.success("Pagamento registado com sucesso");
        router.push("/payments");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      {/* Invoice */}
      <div className="space-y-2">
        <Label>Fatura *</Label>
        <Select
          defaultValue={defaultInvoiceId}
          onValueChange={(v) => setValue("invoiceId", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecionar fatura..." />
          </SelectTrigger>
          <SelectContent>
            {invoices.map((inv) => (
              <SelectItem key={inv.id} value={inv.id}>
                {inv.invoiceNumber}
                {inv.studentName ? ` — ${inv.studentName}` : ""}
                {" "}(saldo:{" "}
                {inv.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.invoiceId && (
          <p className="text-sm text-destructive">{errors.invoiceId.message}</p>
        )}
      </div>

      {/* Splits */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Métodos de Pagamento *</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ method: "CASH", amount: 0, reference: "", notes: "" })}
          >
            <Plus className="size-4 mr-1" />
            Adicionar método
          </Button>
        </div>

        {errors.splits && !Array.isArray(errors.splits) && (
          <p className="text-sm text-destructive">{(errors.splits as { message?: string }).message}</p>
        )}

        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-[160px_130px_1fr_auto] gap-2 items-end rounded-md border bg-card px-3 py-3"
            >
              <div className="space-y-1">
                {index === 0 && <Label className="text-xs text-muted-foreground">Método *</Label>}
                <Controller
                  control={control}
                  name={`splits.${index}.method`}
                  render={({ field: f }) => (
                    <Select value={f.value} onValueChange={f.onChange}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.splits?.[index]?.method && (
                  <p className="text-xs text-destructive">{errors.splits[index]?.method?.message}</p>
                )}
              </div>

              <div className="space-y-1">
                {index === 0 && <Label className="text-xs text-muted-foreground">Valor *</Label>}
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  className="h-8 text-sm"
                  {...register(`splits.${index}.amount`, { valueAsNumber: true })}
                />
                {errors.splits?.[index]?.amount && (
                  <p className="text-xs text-destructive">{errors.splits[index]?.amount?.message}</p>
                )}
              </div>

              <div className="space-y-1">
                {index === 0 && <Label className="text-xs text-muted-foreground">Referência</Label>}
                <Input
                  placeholder="Referência..."
                  className="h-8 text-sm"
                  {...register(`splits.${index}.reference`)}
                />
              </div>

              <div>
                {fields.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : (
                  <div className="size-8" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Method summary */}
        {splits.length > 1 && paymentTotal > 0 && (
          <p className="text-xs text-muted-foreground">
            {splits
              .filter((s) => s.amount > 0)
              .map(
                (s) =>
                  `${PAYMENT_METHOD_LABELS[s.method] ?? s.method} ${Number(s.amount).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`
              )
              .join(" + ")}
          </p>
        )}
      </div>

      {/* Summary panel */}
      {selectedInvoice && (
        <div className="flex flex-wrap gap-6 rounded-lg border bg-muted/40 px-5 py-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Saldo da fatura</p>
            <p className="font-semibold tabular-nums">
              {selectedInvoice.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Novo dinheiro</p>
            <p className="font-semibold tabular-nums">
              {paymentTotal.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            </p>
          </div>
          {overpayment > 0 ? (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Excesso → carteira</p>
              <p className="font-semibold tabular-nums text-blue-600">
                +{overpayment.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Saldo remanescente</p>
              <p className="font-semibold tabular-nums">
                {finalRemaining !== null
                  ? finalRemaining.toLocaleString("pt-PT", { minimumFractionDigits: 2 })
                  : "—"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Payment date */}
      <div className="space-y-2">
        <Label>Data do Pagamento</Label>
        <Input type="date" className="max-w-xs" {...register("paymentDate")} />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notas</Label>
        <Textarea placeholder="Observações adicionais..." rows={3} {...register("notes")} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "A registar..." : "Registar Pagamento"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
