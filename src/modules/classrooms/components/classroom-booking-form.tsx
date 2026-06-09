"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "@/shared/hooks/use-toast";
import { createClassroomBookingAction } from "@/modules/classrooms/actions/classroom-booking.actions";
import { createClassroomBookingSchema, type CreateClassroomBookingSchema } from "@/modules/classrooms/schemas/classroom-booking.schema";
import { AlertTriangle } from "lucide-react";

interface ClassroomBookingFormProps {
  classrooms: Array<{ id: string; name: string; code: string; capacity: number; classroomType: string }>;
  classGroups: Array<{ id: string; name: string; capacity: number }>;
  scheduleSlots: Array<{ id: string; dayOfWeek: string; startTime: string; endTime: string; periodName: string }>;
  academicYears: Array<{ id: string; name: string }>;
  academicTerms: Array<{ id: string; name: string; academicYearId: string }>;
}

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Segunda",
  TUESDAY: "Terça",
  WEDNESDAY: "Quarta",
  THURSDAY: "Quinta",
  FRIDAY: "Sexta",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

export function ClassroomBookingForm({
  classrooms,
  classGroups,
  scheduleSlots,
  academicYears,
  academicTerms,
}: ClassroomBookingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [capacityWarning, setCapacityWarning] = React.useState<string | null>(null);

  const form = useForm<CreateClassroomBookingSchema>({
    resolver: zodResolver(createClassroomBookingSchema),
    defaultValues: {
      classroomId: "",
      classGroupId: "",
      scheduleSlotId: "",
      academicYearId: "",
      academicTermId: "",
      startDate: "",
      endDate: "",
    },
  });

  const selectedYearId = form.watch("academicYearId");
  const selectedClassroomId = form.watch("classroomId");
  const selectedClassGroupId = form.watch("classGroupId");

  const filteredTerms = academicTerms.filter((t) => t.academicYearId === selectedYearId);

  const selectedClassroom = classrooms.find((c) => c.id === selectedClassroomId);
  const selectedClassGroup = classGroups.find((g) => g.id === selectedClassGroupId);

  React.useEffect(() => {
    if (selectedClassroom && selectedClassGroup) {
      if (selectedClassGroup.capacity > selectedClassroom.capacity) {
        setCapacityWarning(
          `A capacidade da turma (${selectedClassGroup.capacity}) excede a capacidade da sala (${selectedClassroom.capacity}).`
        );
      } else {
        setCapacityWarning(null);
      }
    } else {
      setCapacityWarning(null);
    }
  }, [selectedClassroom, selectedClassGroup]);

  function onSubmit(values: CreateClassroomBookingSchema) {
    startTransition(async () => {
      const res = await createClassroomBookingAction(values);
      if (res.success) {
        toast.success("Reserva criada com sucesso");
        router.push("/classroom-bookings");
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao criar reserva");
        if (res.fieldErrors) {
          Object.entries(res.fieldErrors).forEach(([field, messages]) => {
            form.setError(field as keyof CreateClassroomBookingSchema, { message: messages[0] });
          });
        }
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        {/* Academic Period */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="academicYearId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ano Letivo</FormLabel>
                <Select
                  onValueChange={(v) => {
                    field.onChange(v);
                    form.setValue("academicTermId", "");
                  }}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar ano letivo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="academicTermId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Período Letivo (opcional)</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                  value={field.value || "__none__"}
                  disabled={!selectedYearId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar período" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">Sem período</SelectItem>
                    {filteredTerms.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Class Group & Schedule */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="classGroupId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Turma (opcional)</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                  value={field.value || "__none__"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar turma" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">Sem turma</SelectItem>
                    {classGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({g.capacity} lugares)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="scheduleSlotId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Horário (opcional)</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                  value={field.value || "__none__"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar horário" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">Sem horário</SelectItem>
                    {scheduleSlots.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {DAY_LABELS[s.dayOfWeek] ?? s.dayOfWeek} {s.startTime}–{s.endTime}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Classroom */}
        <FormField
          control={form.control}
          name="classroomId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sala</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar sala" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {classrooms.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} – {c.name} ({c.capacity} lugares)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {capacityWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{capacityWarning}</AlertDescription>
          </Alert>
        )}

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Início</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Fim</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "A criar..." : "Criar Reserva"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
