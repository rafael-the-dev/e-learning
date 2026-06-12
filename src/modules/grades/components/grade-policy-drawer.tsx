"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/shared/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import {
  createSubjectPolicySchema,
  type CreateSubjectPolicySchema,
} from "@/modules/grades/schemas/grade.schema";
import {
  createAssessmentPolicyAction,
  updateAssessmentPolicyAction,
} from "@/modules/grades/actions/grade.actions";
import {
  GRADE_CALCULATION_METHOD,
  GRADE_CALCULATION_METHOD_LABELS,
  GRADE_ROUNDING_METHOD,
  GRADE_ROUNDING_METHOD_LABELS,
} from "@/modules/grades/types";
import type { SubjectAssessmentPolicy } from "@/modules/grades/types";

interface Props {
  open: boolean;
  onClose: () => void;
  levelSubjectId: string;
  policy?: SubjectAssessmentPolicy;
  onMutate?: () => void;
}

export function GradePolicyDrawer({ open, onClose, levelSubjectId, policy, onMutate }: Props) {
  const router = useRouter();
  const isEdit = !!policy;

  const form = useForm<CreateSubjectPolicySchema>({
    resolver: zodResolver(createSubjectPolicySchema) as any,
    defaultValues: {
      levelSubjectId,
      name: policy?.name ?? "",
      description: policy?.description ?? "",
      calculationMethod: (policy?.calculationMethod as any) ?? "WEIGHTED_AVERAGE",
      roundingMethod: (policy?.roundingMethod as any) ?? "NONE",
      minimumPassingGrade: policy?.minimumPassingGrade ?? 50,
      allowRecovery: policy?.allowRecovery ?? false,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        levelSubjectId,
        name: policy?.name ?? "",
        description: policy?.description ?? "",
        calculationMethod: (policy?.calculationMethod as any) ?? "WEIGHTED_AVERAGE",
        roundingMethod: (policy?.roundingMethod as any) ?? "NONE",
        minimumPassingGrade: policy?.minimumPassingGrade ?? 50,
        allowRecovery: policy?.allowRecovery ?? false,
      });
    }
  }, [open, policy, levelSubjectId, form]);

  async function onSubmit(values: CreateSubjectPolicySchema) {
    if (isEdit && policy) {
      const res = await updateAssessmentPolicyAction({
        policyId: policy.id,
        name: values.name,
        description: values.description,
        calculationMethod: values.calculationMethod,
        roundingMethod: values.roundingMethod,
        minimumPassingGrade: values.minimumPassingGrade,
        allowRecovery: values.allowRecovery,
      });
      if (res.success) {
        toast.success("Política atualizada.");
        onClose();
        onMutate ? onMutate() : router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao atualizar política.");
      }
    } else {
      const res = await createAssessmentPolicyAction(values);
      if (res.success) {
        toast.success("Política de avaliação criada.");
        onClose();
        onMutate ? onMutate() : router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao criar política.");
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? "Editar Política de Avaliação" : "Nova Política de Avaliação"}
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
                    <Input {...field} placeholder="ex: Política de Avaliação 2024" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="calculationMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de Cálculo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(GRADE_CALCULATION_METHOD).map((m) => (
                          <SelectItem key={m} value={m}>
                            {GRADE_CALCULATION_METHOD_LABELS[m] ?? m}
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
                name="roundingMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arredondamento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(GRADE_ROUNDING_METHOD).map((m) => (
                          <SelectItem key={m} value={m}>
                            {GRADE_ROUNDING_METHOD_LABELS[m] ?? m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="minimumPassingGrade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nota Mínima de Aprovação (%)</FormLabel>
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
              name="allowRecovery"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <Label>Permitir recuperação</Label>
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
