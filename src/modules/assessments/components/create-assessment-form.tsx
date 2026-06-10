"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/shared/hooks/use-toast";
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
import { createAssessmentSchema, type CreateAssessmentSchema } from "@/modules/assessments/schemas/assessment.schema";
import { createAssessmentAction } from "@/modules/assessments/actions/assessment.actions";
import type { AssessmentPolicy } from "@/modules/assessments/types";
import type { AssessmentPeriod } from "@/modules/assessments/types";
import type { AssessmentComponent } from "@/modules/assessments/types";

interface LevelSubjectIds {
  levelSubjectId: string;
  subjectId: string;
  courseLevelId: string;
  courseId: string;
}

interface Props {
  policies: AssessmentPolicy[];
  periods: AssessmentPeriod[];
  classGroups: { id: string; name: string }[];
  teachers: { id: string; firstName: string; lastName: string }[];
  academicYears: { id: string; name: string }[];
  academicTerms: { id: string; name: string }[];
  componentsByPolicy: Record<string, AssessmentComponent[]>;
  policyLevelSubjectMap: Record<string, LevelSubjectIds>;
}

export function CreateAssessmentForm({
  policies,
  periods,
  classGroups,
  teachers,
  academicYears,
  academicTerms,
  componentsByPolicy,
  policyLevelSubjectMap,
}: Props) {
  const router = useRouter();

  const form = useForm<CreateAssessmentSchema>({
    resolver: zodResolver(createAssessmentSchema),
    defaultValues: {
      title: "",
      description: "",
      maxScore: 20,
      assessmentPolicyId: "",
      assessmentComponentId: "",
      assessmentPeriodId: "",
    },
  });

  const selectedPolicyId = form.watch("assessmentPolicyId");
  const components = selectedPolicyId ? (componentsByPolicy[selectedPolicyId] ?? []) : [];

  function onPolicyChange(policyId: string) {
    form.setValue("assessmentPolicyId", policyId);
    form.setValue("assessmentComponentId", "");
    const ls = policyLevelSubjectMap[policyId];
    if (ls) {
      form.setValue("levelSubjectId", ls.levelSubjectId);
      form.setValue("subjectId", ls.subjectId);
      form.setValue("courseLevelId", ls.courseLevelId);
      form.setValue("courseId", ls.courseId);
    }
  }

  async function onSubmit(values: CreateAssessmentSchema) {
    const res = await createAssessmentAction(values);
    if (res.success) {
      toast.success("Avaliação criada.");
      router.push(`/assessments/${res.data.id}`);
    } else {
      toast.error(res.error ?? "Erro ao criar avaliação.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="assessmentPolicyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Política de Avaliação</FormLabel>
                <Select
                  onValueChange={(v) => {
                    onPolicyChange(v);
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar política" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {policies.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.subjectName && (
                          <span className="text-muted-foreground ml-2">· {p.subjectName}</span>
                        )}
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
            name="assessmentComponentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Componente</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={!selectedPolicyId}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar componente" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {components.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
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
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título</FormLabel>
              <FormControl>
                <Input {...field} placeholder="ex: Teste de Matemática — Março 2025" />
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

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="assessmentPeriodId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Período</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar período" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
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
            name="classGroupId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Turma</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar turma" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {classGroups.map((cg) => (
                      <SelectItem key={cg.id} value={cg.id}>
                        {cg.name}
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
            name="maxScore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nota Máxima</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="academicYearId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ano Letivo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar ano" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.name}
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
            name="academicTermId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Período Letivo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar período letivo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {academicTerms.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
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
          name="assessmentDate"
          render={({ field }) => (
            <FormItem className="max-w-xs">
              <FormLabel>Data de Avaliação</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  value={field.value ? new Date(field.value as any).toISOString().split("T")[0] : ""}
                  onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "A criar..." : "Criar Avaliação"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
