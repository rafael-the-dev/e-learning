"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/shared/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import {
  createAssessmentPeriodSchema,
  updateAssessmentPeriodSchema,
  type CreateAssessmentPeriodSchema,
  type UpdateAssessmentPeriodSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import {
  createAssessmentPeriodAction,
  updateAssessmentPeriodAction,
} from "@/modules/assessments/actions/assessment.actions";
import type { AssessmentPeriod } from "@/modules/assessments/types";

interface Props {
  open: boolean;
  onClose: () => void;
  period?: AssessmentPeriod;
}

function toDateInput(d: Date | string): string {
  return new Date(d).toISOString().split("T")[0];
}

export function AssessmentPeriodDrawer({ open, onClose, period }: Props) {
  const router = useRouter();
  const isEdit = !!period;

  const form = useForm<CreateAssessmentPeriodSchema>({
    resolver: zodResolver(createAssessmentPeriodSchema) as any,
    defaultValues: {
      name: period?.name ?? "",
      code: period?.code ?? "",
      startDate: period?.startDate ? toDateInput(period.startDate) : "",
      endDate: period?.endDate ? toDateInput(period.endDate) : "",
    },
  });

  useEffect(() => {
    if (open && period) {
      form.reset({
        name: period.name,
        code: period.code,
        startDate: toDateInput(period.startDate),
        endDate: toDateInput(period.endDate),
      });
    } else if (open && !period) {
      form.reset();
    }
  }, [open, period, form]);

  async function onSubmit(values: CreateAssessmentPeriodSchema) {
    if (isEdit && period) {
      const input: UpdateAssessmentPeriodSchema = {
        periodId: period.id,
        name: values.name,
        startDate: values.startDate,
        endDate: values.endDate,
      };
      const res = await updateAssessmentPeriodAction(input);
      if (res.success) {
        toast.success("Período atualizado.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao atualizar período.");
      }
    } else {
      const res = await createAssessmentPeriodAction(values);
      if (res.success) {
        toast.success("Período criado.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao criar período.");
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar Período" : "Novo Período de Avaliação"}</SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6 pb-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="ex: 1.º Trimestre 2025" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEdit && (
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ex: T1-2025" className="uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Início</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "A guardar..." : "Guardar"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
