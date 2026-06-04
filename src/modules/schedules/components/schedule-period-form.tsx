"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { toast } from "@/shared/hooks/use-toast";
import {
  createSchedulePeriodSchema,
  updateSchedulePeriodSchema,
  type CreateSchedulePeriodSchema,
  type UpdateSchedulePeriodSchema,
} from "@/modules/schedules/schemas/schedule-period.schema";
import {
  createSchedulePeriodAction,
  updateSchedulePeriodAction,
} from "@/modules/schedules/actions/schedule-period.actions";
import { SCHEDULE_STATUS_LABELS } from "@/modules/schedules/types";
import type { SchedulePeriod } from "@/modules/schedules/types";

// =============================================================================
// CREATE PERIOD DRAWER
// =============================================================================

interface CreatePeriodDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateSchedulePeriodDrawer({
  open,
  onOpenChange,
  onSuccess,
}: CreatePeriodDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSchedulePeriodSchema>({
    resolver: zodResolver(createSchedulePeriodSchema),
    defaultValues: { status: "ACTIVE" },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createSchedulePeriodAction(data);
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
          <SheetTitle>Novo Período</SheetTitle>
          <SheetDescription>
            Defina um período reutilizável para organizar os slots de horário.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <PeriodFormFields register={register} control={control} errors={errors} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Criar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// EDIT PERIOD DRAWER
// =============================================================================

interface EditPeriodDrawerProps {
  period: SchedulePeriod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditSchedulePeriodDrawer({
  period,
  open,
  onOpenChange,
  onSuccess,
}: EditPeriodDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSchedulePeriodSchema>({
    resolver: zodResolver(updateSchedulePeriodSchema),
    defaultValues: {
      name: period.name,
      code: period.code,
      description: period.description ?? undefined,
      status: (period.status as "ACTIVE" | "INACTIVE") ?? "ACTIVE",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateSchedulePeriodAction(period.id, data);
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
          <SheetDescription>{period.name}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <PeriodFormFields register={register} control={control} errors={errors} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Guardar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// SHARED FIELDS
// =============================================================================

type PeriodFieldErrors = {
  name?: { message?: string };
  code?: { message?: string };
  description?: { message?: string };
  status?: { message?: string };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PeriodFormFields({ register, control, errors }: {
  register: any;
  control: any;
  errors: PeriodFieldErrors;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="period-name">Nome *</Label>
        <Input id="period-name" placeholder="Ex.: Manhã" {...register("name")} />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="period-code">Código *</Label>
        <Input id="period-code" placeholder="Ex.: MORNING" {...register("code")} />
        {errors.code && (
          <p className="text-xs text-destructive">{errors.code.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="period-desc">Descrição</Label>
        <Textarea
          id="period-desc"
          placeholder="Descrição opcional do período"
          rows={2}
          {...register("description")}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Estado</Label>
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "ACTIVE"} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["ACTIVE", "INACTIVE"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCHEDULE_STATUS_LABELS[s]}
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
