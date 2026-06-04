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
  createScheduleSlotSchema,
  updateScheduleSlotSchema,
  type CreateScheduleSlotSchema,
  type UpdateScheduleSlotSchema,
} from "@/modules/schedules/schemas/schedule-slot.schema";
import {
  createScheduleSlotAction,
  updateScheduleSlotAction,
} from "@/modules/schedules/actions/schedule-slot.actions";
import {
  DAY_OF_WEEK_LABELS,
  DAY_OF_WEEK,
  SCHEDULE_STATUS_LABELS,
} from "@/modules/schedules/types";
import type { SchedulePeriod, ScheduleSlot } from "@/modules/schedules/types";

// =============================================================================
// CREATE SLOT DRAWER
// =============================================================================

interface CreateSlotDrawerProps {
  periods: SchedulePeriod[];
  defaultPeriodId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateScheduleSlotDrawer({
  periods,
  defaultPeriodId,
  open,
  onOpenChange,
  onSuccess,
}: CreateSlotDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateScheduleSlotSchema>({
    resolver: zodResolver(createScheduleSlotSchema),
    defaultValues: {
      schedulePeriodId: defaultPeriodId ?? "",
      dayOfWeek: "MONDAY",
      status: "ACTIVE",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createScheduleSlotAction(data);
    if (result.success) {
      toast.success("Slot criado");
      reset({ schedulePeriodId: defaultPeriodId ?? "", dayOfWeek: "MONDAY", status: "ACTIVE" });
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
          <SheetTitle>Novo Slot</SheetTitle>
          <SheetDescription>
            Defina o dia e horário para este slot reutilizável.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <SlotFormFields
            periods={periods}
            register={register}
            control={control}
            errors={errors}
            showPeriodSelect
          />
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
// EDIT SLOT DRAWER
// =============================================================================

interface EditSlotDrawerProps {
  slot: ScheduleSlot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditScheduleSlotDrawer({
  slot,
  open,
  onOpenChange,
  onSuccess,
}: EditSlotDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateScheduleSlotSchema>({
    resolver: zodResolver(updateScheduleSlotSchema),
    defaultValues: {
      dayOfWeek: slot.dayOfWeek as keyof typeof DAY_OF_WEEK,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: (slot.status as "ACTIVE" | "INACTIVE") ?? "ACTIVE",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateScheduleSlotAction(slot.id, data);
    if (result.success) {
      toast.success("Slot atualizado");
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
          <SheetTitle>Editar Slot</SheetTitle>
          <SheetDescription>
            {DAY_OF_WEEK_LABELS[slot.dayOfWeek]} — {slot.startTime} às {slot.endTime}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <SlotFormFields
            periods={[]}
            register={register}
            control={control}
            errors={errors}
            showPeriodSelect={false}
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
// SHARED FIELDS
// =============================================================================

type SlotErrors = Partial<Record<string, { message?: string }>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SlotFormFields({ periods, register, control, errors, showPeriodSelect }: {
  periods: SchedulePeriod[];
  register: any;
  control: any;
  errors: SlotErrors;
  showPeriodSelect: boolean;
}) {
  return (
    <>
      {showPeriodSelect && (
        <div className="space-y-1.5">
          <Label>Período *</Label>
          <Controller
            name="schedulePeriodId"
            control={control}
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um período" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.schedulePeriodId && (
            <p className="text-xs text-destructive">{errors.schedulePeriodId.message}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Dia da Semana *</Label>
        <Controller
          name="dayOfWeek"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "MONDAY"} onValueChange={field.onChange}>
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
          <Label htmlFor="slot-start">Hora de Início *</Label>
          <Input id="slot-start" type="time" {...register("startTime")} />
          {errors.startTime && (
            <p className="text-xs text-destructive">{errors.startTime.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slot-end">Hora de Fim *</Label>
          <Input id="slot-end" type="time" {...register("endTime")} />
          {errors.endTime && (
            <p className="text-xs text-destructive">{errors.endTime.message}</p>
          )}
        </div>
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
