"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
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
  createAcademicHolidaySchema,
  updateAcademicHolidaySchema,
  type CreateAcademicHolidaySchema,
  type UpdateAcademicHolidaySchema,
} from "@/modules/academic-calendar/schemas/academic-holiday.schema";
import {
  createAcademicHolidayAction,
  updateAcademicHolidayAction,
} from "@/modules/academic-calendar/actions/academic-holiday.actions";
import { ACADEMIC_STATUS_LABELS } from "@/modules/academic-calendar/types";
import type { AcademicHoliday, AcademicYear } from "@/modules/academic-calendar/types";

function toDateInput(d: Date | string): string {
  return new Date(d).toISOString().split("T")[0];
}

interface CreateProps {
  years: AcademicYear[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateAcademicHolidayDrawer({ years, open, onOpenChange, onSuccess }: CreateProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateAcademicHolidaySchema>({
    resolver: zodResolver(createAcademicHolidaySchema),
    defaultValues: { status: "ACTIVE", isRecurring: false },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createAcademicHolidayAction(data);
    if (result.success) {
      toast.success("Feriado criado");
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
          <SheetTitle>Novo Feriado</SheetTitle>
          <SheetDescription>Registar um feriado ou ausência académica.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <HolidayFormFields register={register} control={control} errors={errors} years={years} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting}>Criar</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface EditProps {
  holiday: AcademicHoliday;
  years: AcademicYear[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditAcademicHolidayDrawer({ holiday, years, open, onOpenChange, onSuccess }: EditProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAcademicHolidaySchema>({
    resolver: zodResolver(updateAcademicHolidaySchema),
    defaultValues: {
      name: holiday.name,
      description: holiday.description ?? undefined,
      academicYearId: holiday.academicYearId ?? undefined,
      startDate: toDateInput(holiday.startDate),
      endDate: toDateInput(holiday.endDate),
      isRecurring: holiday.isRecurring,
      status: holiday.status as "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateAcademicHolidayAction(holiday.id, data);
    if (result.success) {
      toast.success("Feriado atualizado");
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
          <SheetTitle>Editar Feriado</SheetTitle>
          <SheetDescription>{holiday.name}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <HolidayFormFields register={register} control={control} errors={errors} years={years} isEdit />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting}>Guardar</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type HolidayFieldErrors = {
  name?: { message?: string };
  description?: { message?: string };
  startDate?: { message?: string };
  endDate?: { message?: string };
  status?: { message?: string };
  academicYearId?: { message?: string };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HolidayFormFields({ register, control, errors, years, isEdit = false }: {
  register: any;
  control: any;
  errors: HolidayFieldErrors;
  years: AcademicYear[];
  isEdit?: boolean;
}) {
  const statuses = isEdit
    ? (["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const)
    : (["ACTIVE", "DRAFT"] as const);

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="holiday-name">Nome *</Label>
        <Input id="holiday-name" placeholder="Ex.: Natal" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Ano Letivo (opcional)</Label>
        <Controller
          name="academicYearId"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "NONE"} onValueChange={(v) => field.onChange(v === "NONE" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Geral (todos os anos)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Geral (todos os anos)</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="holiday-desc">Descrição</Label>
        <Textarea id="holiday-desc" rows={2} {...register("description")} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="holiday-start">Início *</Label>
          <Input id="holiday-start" type="date" {...register("startDate")} />
          {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="holiday-end">Fim *</Label>
          <Input id="holiday-end" type="date" {...register("endDate")} />
          {errors.endDate && <p className="text-xs text-destructive">{errors.endDate.message}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Controller
          name="isRecurring"
          control={control}
          render={({ field }) => (
            <Switch
              id="holiday-recurring"
              checked={field.value ?? false}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Label htmlFor="holiday-recurring">Feriado recorrente anualmente</Label>
      </div>

      <div className="space-y-1.5">
        <Label>Estado</Label>
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "ACTIVE"} onValueChange={field.onChange}>
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
