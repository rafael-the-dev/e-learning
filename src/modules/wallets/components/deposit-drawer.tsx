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
import { createDepositSchema, type CreateDepositInput } from "@/modules/wallets/schemas/wallet.schema";
import { createDepositAction } from "@/modules/wallets/actions/wallet.actions";
import { PlusCircle } from "lucide-react";

interface Props {
  walletId: string;
  studentName: string | null;
}

export function DepositDrawer({ walletId, studentName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateDepositInput>({
    resolver: zodResolver(createDepositSchema),
    defaultValues: { walletId, amount: 0, referenceId: "", description: "" },
  });

  function onSubmit(data: CreateDepositInput) {
    startTransition(async () => {
      const result = await createDepositAction(data);
      if (result.success) {
        toast.success("Depósito registado com sucesso");
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
        <Button size="sm">
          <PlusCircle className="size-4 mr-1.5" />
          Depositar
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Novo Depósito</SheetTitle>
          {studentName && (
            <p className="text-sm text-muted-foreground">{studentName}</p>
          )}
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          <input type="hidden" {...register("walletId")} />

          <div className="space-y-2">
            <Label>Valor *</Label>
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
            <Label>Referência</Label>
            <Input placeholder="Nº de referência..." {...register("referenceId")} />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              placeholder="Motivo do depósito..."
              rows={3}
              {...register("description")}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "A registar..." : "Confirmar Depósito"}
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
