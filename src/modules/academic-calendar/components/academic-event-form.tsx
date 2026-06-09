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
  createAcademicEventSchema,
  updateAcademicEventSchema,
  type CreateAcademicEventSchema,
  type UpdateAcademicEventSchema,
} from "@/modules/academic-calendar/schemas/academic-event.schema";
import {
  createAcademicEventAction,
  updateAcademicEventAction,
} from "@/modules/academic-calendar/actions/academic-event.actions";
import {
  ACADEMIC_STATUS_LABELS,
  ACADEMIC_EVENT_TYPE_LABELS,
  ACADEMIC_EVENT_TYPE,
} from "@/modules/academic-calendar/types";
import type { AcademicEvent, AcademicYear, AcademicTerm } from "@/modules/academic-calendar/types";

function toDateInput(d: Date | string): string {
  return new Date(d).toISOString().split("T")[0];
}

interface CreateProps {
  years: AcademicYear[];
  terms: AcademicTerm[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateAcademicEventDrawer({ years, terms, open, onOpenChange, onSuccess }: CreateProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateAcademicEventSchema>({
    resolver: zodResolver(createAcademicEventSchema),
    defaultValues: { eventType: "GENERAL", status: "DRAFT" },
  });

  const selectedYearId = watch("academicYearId");
  const filteredTerms = selectedYearId
    ? terms.filter((t) => t.academicYearId === selectedYearId)
    : terms;

  const onSubmit = handleSubmit(async (data) => {
    const result = await createAcademicEventAction(data);
    if (result.success) {
      toast.success("Evento criado");
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
          <SheetTitle>Novo Evento</SheetTitle>
          <SheetDescription>Registar um evento no calendário académico.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <EventFormFields
            register={register}
            control={control}
            errors={errors}
            years={years}
            terms={filteredTerms}
          />
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
  event: AcademicEvent;
  years: AcademicYear[];
  terms: AcademicTerm[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditAcademicEventDrawer({ event, years, terms, open, onOpenChange, onSuccess }: EditProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAcademicEventSchema>({
    resolver: zodResolver(updateAcademicEventSchema),
    defaultValues: {
      title: event.title,
      description: event.description ?? undefined,
      eventType: event.eventType as CreateAcademicEventSchema["eventType"],
      academicYearId: event.academicYearId ?? undefined,
      academicTermId: event.academicTermId ?? undefined,
      startDate: toDateInput(event.startDate),
      endDate: toDateInput(event.endDate),
      status: event.status as "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED",
    },
  });

  const selectedYearId = watch("academicYearId");
  const filteredTerms = selectedYearId
    ? terms.filter((t) => t.academicYearId === selectedYearId)
    : terms;

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateAcademicEventAction(event.id, data);
    if (result.success) {
      toast.success("Evento atualizado");
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
          <SheetTitle>Editar Evento</SheetTitle>
          <SheetDescription>{event.title}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <EventFormFields
            register={register}
            control={control}
            errors={errors}
            years={years}
            terms={filteredTerms}
            isEdit
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting}>Guardar</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type EventFieldErrors = {
  title?: { message?: string };
  description?: { message?: string };
  eventType?: { message?: string };
  startDate?: { message?: string };
  endDate?: { message?: string };
  status?: { message?: string };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EventFormFields({ register, control, errors, years, terms, isEdit = false }: {
  register: any;
  control: any;
  errors: EventFieldErrors;
  years: AcademicYear[];
  terms: AcademicTerm[];
  isEdit?: boolean;
}) {
  const statuses = isEdit
    ? (["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const)
    : (["DRAFT", "ACTIVE"] as const);

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="event-title">Título *</Label>
        <Input id="event-title" placeholder="Ex.: Exames Finais" {...register("title")} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Controller
          name="eventType"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "GENERAL"} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(ACADEMIC_EVENT_TYPE).map((t) => (
                  <SelectItem key={t} value={t}>{ACADEMIC_EVENT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Ano Letivo (opcional)</Label>
        <Controller
          name="academicYearId"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "NONE"} onValueChange={(v) => field.onChange(v === "NONE" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Nenhum</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {terms.length > 0 && (
        <div className="space-y-1.5">
          <Label>Período (opcional)</Label>
          <Controller
            name="academicTermId"
            control={control}
            render={({ field }) => (
              <Select value={field.value ?? "NONE"} onValueChange={(v) => field.onChange(v === "NONE" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Nenhum</SelectItem>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="event-desc">Descrição</Label>
        <Textarea id="event-desc" rows={2} {...register("description")} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="event-start">Início *</Label>
          <Input id="event-start" type="date" {...register("startDate")} />
          {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-end">Fim *</Label>
          <Input id="event-end" type="date" {...register("endDate")} />
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
