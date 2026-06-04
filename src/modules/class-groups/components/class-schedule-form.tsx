"use client";

import * as React from "react";
import {
  useForm,
  Controller,
  type UseFormRegister,
  type Control,
  type FieldErrors,
  type FieldValues,
} from "react-hook-form";
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
  createClassScheduleSchema,
  updateClassScheduleSchema,
  type CreateClassScheduleSchema,
  type UpdateClassScheduleSchema,
} from "@/modules/class-groups/schemas/class-schedule.schema";
import {
  createClassScheduleAction,
  updateClassScheduleAction,
} from "@/modules/class-groups/actions/class-schedule.actions";
import { DAY_OF_WEEK_LABELS } from "@/modules/class-groups/types";
import type { ClassSchedule } from "@/modules/class-groups/types";

// =============================================================================
// CREATE SCHEDULE DRAWER
// =============================================================================

interface CreateScheduleDrawerProps {
  classGroupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateScheduleDrawer({
  classGroupId,
  open,
  onOpenChange,
  onSuccess,
}: CreateScheduleDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateClassScheduleSchema>({
    resolver: zodResolver(createClassScheduleSchema),
    defaultValues: { dayOfWeek: 1 },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createClassScheduleAction(classGroupId, data);
    if (result.success) {
      toast.success("Horário adicionado");
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
          <SheetTitle>Adicionar Horário</SheetTitle>
          <SheetDescription>
            Defina o dia e o horário para esta turma.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <ScheduleFormFields
            register={register as unknown as UseFormRegister<FieldValues>}
            control={control as unknown as Control<FieldValues>}
            errors={errors as Record<string, { message?: string } | undefined>}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Adicionar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// EDIT SCHEDULE DRAWER
// =============================================================================

interface EditScheduleDrawerProps {
  classGroupId: string;
  schedule: ClassSchedule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditScheduleDrawer({
  classGroupId,
  schedule,
  open,
  onOpenChange,
  onSuccess,
}: EditScheduleDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateClassScheduleSchema>({
    resolver: zodResolver(updateClassScheduleSchema),
    defaultValues: {
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      room: schedule.room ?? undefined,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateClassScheduleAction(classGroupId, schedule.id, data);
    if (result.success) {
      toast.success("Horário atualizado");
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
          <SheetTitle>Editar Horário</SheetTitle>
          <SheetDescription>
            {DAY_OF_WEEK_LABELS[schedule.dayOfWeek]} — {schedule.startTime} às{" "}
            {schedule.endTime}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <ScheduleFormFields
            register={register as unknown as UseFormRegister<FieldValues>}
            control={control as unknown as Control<FieldValues>}
            errors={errors as Record<string, { message?: string } | undefined>}
          />
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
// SHARED SCHEDULE FORM FIELDS
// =============================================================================

interface ScheduleFormFieldsProps {
  register: UseFormRegister<FieldValues>;
  control: Control<FieldValues>;
  errors: Record<string, { message?: string } | undefined>;
}

function ScheduleFormFields({ register, control, errors }: ScheduleFormFieldsProps) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Dia da Semana *</Label>
        <Controller
          name="dayOfWeek"
          control={control}
          render={({ field }) => (
            <Select
              value={String(field.value ?? 1)}
              onValueChange={(v) => field.onChange(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DAY_OF_WEEK_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.dayOfWeek && (
          <p className="text-xs text-destructive">{errors.dayOfWeek.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sched-start">Hora de Início *</Label>
          <Input
            id="sched-start"
            type="time"
            {...register("startTime")}
          />
          {errors.startTime && (
            <p className="text-xs text-destructive">{errors.startTime.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sched-end">Hora de Fim *</Label>
          <Input
            id="sched-end"
            type="time"
            {...register("endTime")}
          />
          {errors.endTime && (
            <p className="text-xs text-destructive">{errors.endTime.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sched-room">Sala</Label>
        <Input
          id="sched-room"
          placeholder="Ex.: Sala 3"
          {...register("room")}
        />
      </div>
    </>
  );
}
