"use client";

import { useForm } from "react-hook-form";
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
  createWalletAdjustmentSchema,
  type CreateWalletAdjustmentInput,
} from "@/modules/wallets/schemas/wallet.schema";
import { createWalletAdjustmentAction } from "@/modules/wallets/actions/wallet.actions";
import { SlidersHorizontal } from "lucide-react";

interface Props {
  walletId: string;
}

export function AdjustmentDrawer({ walletId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateWalletAdjustmentInput>({
    resolver: zodResolver(createWalletAdjustmentSchema),
    defaultValues: { walletId, amount: 0, description: "" },
  });

  function onSubmit(data: CreateWalletAdjustmentInput) {
    startTransition(async () => {
      const result = await createWalletAdjustmentAction(data);
      if (result.success) {
        toast.success("Ajuste registado com sucesso");
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
        <Button size="sm" variant="outline">
          <SlidersHorizontal className="size-4 mr-1.5" />
          Ajuste
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Ajuste de Saldo</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Use valores positivos para aumentar o saldo e negativos para reduzir.
          </p>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          <input type="hidden" {...register("walletId")} />

          <div className="space-y-2">
            <Label>Valor *</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Ex: 100.00 ou -50.00"
              {...register("amount", { valueAsNumber: true })}
            />
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Textarea placeholder="Motivo do ajuste..." rows={3} {...register("description")} />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "A registar..." : "Confirmar Ajuste"}
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
