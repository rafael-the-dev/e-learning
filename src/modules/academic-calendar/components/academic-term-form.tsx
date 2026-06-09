"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { toast } from "@/shared/hooks/use-toast";
import {
  createAcademicTermSchema,
  updateAcademicTermSchema,
  type CreateAcademicTermSchema,
  type UpdateAcademicTermSchema,
} from "@/modules/academic-calendar/schemas/academic-term.schema";
import {
  createAcademicTermAction,
  updateAcademicTermAction,
} from "@/modules/academic-calendar/actions/academic-term.actions";
import { ACADEMIC_STATUS_LABELS } from "@/modules/academic-calendar/types";
import type { AcademicTerm, AcademicYear } from "@/modules/academic-calendar/types";

function toDateInput(d: Date | string): string {
  return new Date(d).toISOString().split("T")[0];
}

interface CreateProps {
  years: AcademicYear[];
  defaultYearId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateAcademicTermDrawer({
  years,
  defaultYearId,
  open,
  onOpenChange,
  onSuccess,
}: CreateProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateAcademicTermSchema>({
    resolver: zodResolver(createAcademicTermSchema),
    defaultValues: { academicYearId: defaultYearId ?? "", status: "DRAFT", order: 1 },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createAcademicTermAction(data);
    if (result.success) {
      toast.success("Período criado");
      reset();
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Novo Período Letivo</SheetTitle>
          <SheetDescription>Defina o período dentro do ano letivo selecionado.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Ano Letivo *</Label>
            <Controller
              name="academicYearId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar ano letivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.academicYearId && (
              <p className="text-xs text-destructive">{errors.academicYearId.message}</p>
            )}
          </div>
          <TermFormFields register={register} control={control} errors={errors} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>Criar</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface EditProps {
  term: AcademicTerm;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditAcademicTermDrawer({ term, open, onOpenChange, onSuccess }: EditProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAcademicTermSchema>({
    resolver: zodResolver(updateAcademicTermSchema),
    defaultValues: {
      name: term.name,
      code: term.code,
      startDate: toDateInput(term.startDate),
      endDate: toDateInput(term.endDate),
      order: term.order,
      status: term.status as "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateAcademicTermAction(term.id, data);
    if (result.success) {
      toast.success("Período atualizado");
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Editar Período</SheetTitle>
          <SheetDescription>{term.name}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <TermFormFields register={register} control={control} errors={errors} isEdit />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>Guardar</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type TermFieldErrors = {
  name?: { message?: string };
  code?: { message?: string };
  startDate?: { message?: string };
  endDate?: { message?: string };
  order?: { message?: string };
  status?: { message?: string };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TermFormFields({ register, control, errors, isEdit = false }: {
  register: any;
  control: any;
  errors: TermFieldErrors;
  isEdit?: boolean;
}) {
  const statuses = isEdit
    ? (["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const)
    : (["DRAFT", "ACTIVE"] as const);

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="term-name">Nome *</Label>
        <Input id="term-name" placeholder="Ex.: 1.º Período" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="term-code">Código *</Label>
          <Input id="term-code" placeholder="Ex.: T1" {...register("code")} />
          {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="term-order">Ordem *</Label>
          <Input id="term-order" type="number" min={1} {...register("order", { valueAsNumber: true })} />
          {errors.order && <p className="text-xs text-destructive">{errors.order.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="term-start">Início *</Label>
          <Input id="term-start" type="date" {...register("startDate")} />
          {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="term-end">Fim *</Label>
          <Input id="term-end" type="date" {...register("endDate")} />
          {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Estado</Label>
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "DRAFT"} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{ACADEMIC_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </>
  );
}
