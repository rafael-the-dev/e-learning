"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { toast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { applyWalletCreditSchema, type ApplyWalletCreditInput } from "@/modules/wallets/schemas/wallet.schema";
import { applyWalletCreditAction } from "@/modules/wallets/actions/wallet.actions";
import { CreditCard } from "lucide-react";

interface PendingInvoice {
  id: string;
  invoiceNumber: string;
  balanceAmount: number;
}

interface Props {
  walletId: string;
  balance: number;
  pendingInvoices: PendingInvoice[];
}

export function ApplyCreditDrawer({ walletId, balance, pendingInvoices }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<ApplyWalletCreditInput>({
    resolver: zodResolver(applyWalletCreditSchema),
    defaultValues: { walletId, invoiceId: "", amount: 0, notes: "" },
  });

  const selectedInvoiceId = watch("invoiceId");
  const selectedInvoice = pendingInvoices.find((i) => i.id === selectedInvoiceId);
  const creditAmount = watch("amount");
  const maxCredit = selectedInvoice
    ? Math.min(balance, selectedInvoice.balanceAmount)
    : balance;

  function onSubmit(data: ApplyWalletCreditInput) {
    startTransition(async () => {
      const result = await applyWalletCreditAction(data);
      if (result.success) {
        toast.success("Crédito aplicado com sucesso");
        reset();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" disabled={balance <= 0 || pendingInvoices.length === 0}>
          <CreditCard className="size-4 mr-1.5" />
          Aplicar Crédito
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Aplicar Crédito</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Saldo disponível:{" "}
            <span className="font-semibold">
              {balance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            </span>
          </p>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          <input type="hidden" {...register("walletId")} />

          <div className="space-y-2">
            <Label>Fatura *</Label>
            <Controller
              control={control}
              name="invoiceId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar fatura..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — saldo{" "}
                        {inv.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.invoiceId && (
              <p className="text-sm text-destructive">{errors.invoiceId.message}</p>
            )}
          </div>

          {selectedInvoice && (
            <div className="flex gap-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Saldo da fatura</p>
                <p className="font-semibold tabular-nums">
                  {selectedInvoice.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Máximo aplicável</p>
                <p className="font-semibold tabular-nums">
                  {maxCredit.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </p>
              </div>
              {Number(creditAmount) > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Saldo restante</p>
                  <p
                    className={`font-semibold tabular-nums ${
                      selectedInvoice.balanceAmount - Number(creditAmount) < 0
                        ? "text-destructive"
                        : ""
                    }`}
                  >
                    {(selectedInvoice.balanceAmount - Number(creditAmount)).toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Valor a aplicar *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              {...register("amount", { valueAsNumber: true })}
            />
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea placeholder="Observações..." rows={3} {...register("notes")} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending || balance <= 0}>
              {isPending ? "A aplicar..." : "Aplicar Crédito"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
