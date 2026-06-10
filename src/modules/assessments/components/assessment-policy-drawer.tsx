"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/shared/components/ui/textarea";
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
  createAssessmentPolicySchema,
  updateAssessmentPolicySchema,
  type CreateAssessmentPolicySchema,
  type UpdateAssessmentPolicySchema,
} from "@/modules/assessments/schemas/assessment.schema";
import {
  createAssessmentPolicyAction,
  updateAssessmentPolicyAction,
} from "@/modules/assessments/actions/assessment.actions";
import {
  ASSESSMENT_CALCULATION_METHOD,
  ASSESSMENT_CALCULATION_METHOD_LABELS,
  ASSESSMENT_ROUNDING_METHOD,
  ASSESSMENT_ROUNDING_METHOD_LABELS,
} from "@/modules/assessments/types";
import type { AssessmentPolicy } from "@/modules/assessments/types";

interface Props {
  open: boolean;
  onClose: () => void;
  policy?: AssessmentPolicy;
  levelSubjectOptions?: { id: string; subjectName: string; courseLevelName: string }[];
}

export function AssessmentPolicyDrawer({ open, onClose, policy, levelSubjectOptions = [] }: Props) {
  const router = useRouter();
  const isEdit = !!policy;

  const form = useForm<CreateAssessmentPolicySchema>({
    resolver: zodResolver(createAssessmentPolicySchema) as any,
    defaultValues: {
      levelSubjectId: policy?.levelSubjectId ?? "",
      name: policy?.name ?? "",
      description: policy?.description ?? "",
      calculationMethod: (policy?.calculationMethod as any) ?? "WEIGHTED_AVERAGE",
      roundingMethod: (policy?.roundingMethod as any) ?? "NONE",
      minimumPassingGrade: policy?.minimumPassingGrade ?? 50,
      allowRetake: policy?.allowRetake ?? false,
      maxRetakes: policy?.maxRetakes ?? 0,
    },
  });

  useEffect(() => {
    if (open && policy) {
      form.reset({
        levelSubjectId: policy.levelSubjectId,
        name: policy.name,
        description: policy.description ?? "",
        calculationMethod: policy.calculationMethod as any,
        roundingMethod: policy.roundingMethod as any,
        minimumPassingGrade: policy.minimumPassingGrade,
        allowRetake: policy.allowRetake,
        maxRetakes: policy.maxRetakes,
      });
    } else if (open && !policy) {
      form.reset();
    }
  }, [open, policy, form]);

  const allowRetake = form.watch("allowRetake");

  async function onSubmit(values: CreateAssessmentPolicySchema) {
    if (isEdit && policy) {
      const input: UpdateAssessmentPolicySchema = {
        policyId: policy.id,
        name: values.name,
        description: values.description,
        calculationMethod: values.calculationMethod,
        roundingMethod: values.roundingMethod,
        minimumPassingGrade: values.minimumPassingGrade,
        allowRetake: values.allowRetake,
        maxRetakes: values.maxRetakes,
      };
      const res = await updateAssessmentPolicyAction(input);
      if (res.success) {
        toast.success("Política atualizada.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao atualizar política.");
      }
    } else {
      const res = await createAssessmentPolicyAction(values);
      if (res.success) {
        toast.success("Política criada.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao criar política.");
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar Política" : "Nova Política de Avaliação"}</SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6 pb-8">
            {!isEdit && (
              <FormField
                control={form.control}
                name="levelSubjectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Disciplina / Nível</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar disciplina" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {levelSubjectOptions.map((ls) => (
                          <SelectItem key={ls.id} value={ls.id}>
                            {ls.subjectName} · {ls.courseLevelName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="ex: Avaliação Semestral" />
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
                        {Object.values(ASSESSMENT_CALCULATION_METHOD).map((m) => (
                          <SelectItem key={m} value={m}>
                            {ASSESSMENT_CALCULATION_METHOD_LABELS[m] ?? m}
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
                        {Object.values(ASSESSMENT_ROUNDING_METHOD).map((m) => (
                          <SelectItem key={m} value={m}>
                            {ASSESSMENT_ROUNDING_METHOD_LABELS[m] ?? m}
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
                  <FormLabel>Nota Mínima de Aprovação</FormLabel>
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

            <div className="flex items-center gap-3">
              <FormField
                control={form.control}
                name="allowRetake"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <Label>Permitir recuperação</Label>
                  </FormItem>
                )}
              />
            </div>

            {allowRetake && (
              <FormField
                control={form.control}
                name="maxRetakes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº Máximo de Recuperações</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
