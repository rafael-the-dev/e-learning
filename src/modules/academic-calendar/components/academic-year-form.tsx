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
  createAcademicYearSchema,
  updateAcademicYearSchema,
  type CreateAcademicYearSchema,
  type UpdateAcademicYearSchema,
} from "@/modules/academic-calendar/schemas/academic-year.schema";
import {
  createAcademicYearAction,
  updateAcademicYearAction,
} from "@/modules/academic-calendar/actions/academic-year.actions";
import { ACADEMIC_STATUS_LABELS } from "@/modules/academic-calendar/types";
import type { AcademicYear } from "@/modules/academic-calendar/types";

function toDateInput(d: Date | string): string {
  return new Date(d).toISOString().split("T")[0];
}

// =============================================================================
// CREATE DRAWER
// =============================================================================

interface CreateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateAcademicYearDrawer({ open, onOpenChange, onSuccess }: CreateProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateAcademicYearSchema>({
    resolver: zodResolver(createAcademicYearSchema),
    defaultValues: { status: "DRAFT" },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createAcademicYearAction(data);
    if (result.success) {
      toast.success("Ano letivo criado");
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
          <SheetTitle>Novo Ano Letivo</SheetTitle>
          <SheetDescription>Defina o intervalo e código do ano letivo.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <YearFormFields register={register} control={control} errors={errors} />
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

// =============================================================================
// EDIT DRAWER
// =============================================================================

interface EditProps {
  year: AcademicYear;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditAcademicYearDrawer({ year, open, onOpenChange, onSuccess }: EditProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAcademicYearSchema>({
    resolver: zodResolver(updateAcademicYearSchema),
    defaultValues: {
      name: year.name,
      code: year.code,
      startDate: toDateInput(year.startDate),
      endDate: toDateInput(year.endDate),
      status: year.status as "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateAcademicYearAction(year.id, data);
    if (result.success) {
      toast.success("Ano letivo atualizado");
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
          <SheetTitle>Editar Ano Letivo</SheetTitle>
          <SheetDescription>{year.name}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <YearFormFields register={register} control={control} errors={errors} isEdit />
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

// =============================================================================
// SHARED FIELDS
// =============================================================================

type YearFieldErrors = {
  name?: { message?: string };
  code?: { message?: string };
  startDate?: { message?: string };
  endDate?: { message?: string };
  status?: { message?: string };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function YearFormFields({ register, control, errors, isEdit = false }: {
  register: any;
  control: any;
  errors: YearFieldErrors;
  isEdit?: boolean;
}) {
  const statuses = isEdit
    ? (["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const)
    : (["DRAFT", "ACTIVE"] as const);

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="year-name">Nome *</Label>
        <Input id="year-name" placeholder="Ex.: 2024/2025" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="year-code">Código *</Label>
        <Input id="year-code" placeholder="Ex.: AY-2024-25" {...register("code")} />
        {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="year-start">Data de Início *</Label>
          <Input id="year-start" type="date" {...register("startDate")} />
          {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="year-end">Data de Fim *</Label>
          <Input id="year-end" type="date" {...register("endDate")} />
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ACADEMIC_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </>
  );
}
