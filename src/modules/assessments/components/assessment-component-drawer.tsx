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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import {
  createAssessmentComponentSchema,
  type CreateAssessmentComponentSchema,
  type UpdateAssessmentComponentSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import {
  createAssessmentComponentAction,
  updateAssessmentComponentAction,
} from "@/modules/assessments/actions/assessment.actions";
import {
  ASSESSMENT_COMPONENT_TYPE,
  ASSESSMENT_COMPONENT_TYPE_LABELS,
} from "@/modules/assessments/types";
import type { AssessmentComponent } from "@/modules/assessments/types";

interface Props {
  open: boolean;
  onClose: () => void;
  policyId: string;
  component?: AssessmentComponent;
}

export function AssessmentComponentDrawer({ open, onClose, policyId, component }: Props) {
  const router = useRouter();
  const isEdit = !!component;

  const form = useForm<CreateAssessmentComponentSchema>({
    resolver: zodResolver(createAssessmentComponentSchema) as any,
    defaultValues: {
      assessmentPolicyId: policyId,
      name: component?.name ?? "",
      componentType: (component?.componentType as any) ?? "TEST",
      weight: component?.weight ?? 0,
      order: component?.order ?? 0,
      isRequired: component?.isRequired ?? true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        assessmentPolicyId: policyId,
        name: component?.name ?? "",
        componentType: (component?.componentType as any) ?? "TEST",
        weight: component?.weight ?? 0,
        order: component?.order ?? 0,
        isRequired: component?.isRequired ?? true,
      });
    }
  }, [open, component, policyId, form]);

  async function onSubmit(values: CreateAssessmentComponentSchema) {
    if (isEdit && component) {
      const input: UpdateAssessmentComponentSchema = {
        componentId: component.id,
        name: values.name,
        componentType: values.componentType,
        weight: values.weight,
        order: values.order,
        isRequired: values.isRequired,
      };
      const res = await updateAssessmentComponentAction(input);
      if (res.success) {
        toast.success("Componente atualizado.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao atualizar componente.");
      }
    } else {
      const res = await createAssessmentComponentAction(values);
      if (res.success) {
        toast.success("Componente criado.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao criar componente.");
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? "Editar Componente" : "Novo Componente de Avaliação"}
          </SheetTitle>
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
                    <Input {...field} placeholder="ex: Teste 1" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="componentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(ASSESSMENT_COMPONENT_TYPE).map((t) => (
                        <SelectItem key={t} value={t}>
                          {ASSESSMENT_COMPONENT_TYPE_LABELS[t] ?? t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Peso (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordem</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isRequired"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <Label>Obrigatório</Label>
                </FormItem>
              )}
            />

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
