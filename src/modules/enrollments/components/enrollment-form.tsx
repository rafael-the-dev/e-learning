"use client";

import * as React from "react";
import { Controller, useForm, type UseFormRegister, type Control, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
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
import { toast } from "@/shared/hooks/use-toast";
import {
  createEnrollmentSchema,
  updateEnrollmentSchema,
  type CreateEnrollmentSchema,
  type UpdateEnrollmentSchema,
} from "@/modules/enrollments/schemas/enrollment.schema";
import {
  createEnrollmentAction,
  updateEnrollmentAction,
} from "@/modules/enrollments/actions/enrollment.actions";
import { getBillingPreviewAction } from "@/modules/billing/actions/billing-policy.actions";
import type { Enrollment } from "@/modules/enrollments/types";
import type { BillingCalculationResult } from "@/modules/billing/types";

// =============================================================================
// OPTION TYPES
// =============================================================================

export interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  code: string | null;
}

export interface CourseOption {
  id: string;
  name: string;
}

export interface LevelOption {
  id: string;
  name: string;
  courseId: string;
}

export interface ClassGroupOption {
  id: string;
  name: string;
  courseId: string;
  courseLevelId: string | null;
  capacity: number;
  currentCount: number;
}

export interface BranchOption {
  id: string;
  name: string;
}

// =============================================================================
// CREATE ENROLLMENT FORM
// =============================================================================

interface CreateEnrollmentFormProps {
  students: StudentOption[];
  courses: CourseOption[];
  levels: LevelOption[];
  classGroups: ClassGroupOption[];
  branches: BranchOption[];
}

export function CreateEnrollmentForm({
  students,
  courses,
  levels,
  classGroups,
  branches,
}: CreateEnrollmentFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateEnrollmentSchema>({
    resolver: zodResolver(createEnrollmentSchema),
    defaultValues: {
      enrollmentDate: new Date().toISOString().split("T")[0],
    },
  });

  const selectedCourseId = watch("courseId") ?? "";
  const selectedLevelId = watch("courseLevelId") ?? "";

  const filteredLevels = levels.filter((l) => l.courseId === selectedCourseId);
  const filteredGroups = classGroups.filter((g) => {
    if (g.courseId !== selectedCourseId) return false;
    if (selectedLevelId && g.courseLevelId && g.courseLevelId !== selectedLevelId) return false;
    return true;
  });

  const [billingPreview, setBillingPreview] = React.useState<BillingCalculationResult | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  React.useEffect(() => {
    if (!selectedCourseId) {
      setBillingPreview(null);
      return;
    }
    setPreviewLoading(true);
    getBillingPreviewAction(selectedCourseId).then((result) => {
      setBillingPreview(result.success ? result.data : null);
      setPreviewLoading(false);
    });
  }, [selectedCourseId]);

  function handleCourseChange() {
    setValue("courseLevelId", null);
    setValue("classGroupId", null);
  }

  function handleLevelChange(levelId: string | null) {
    setValue("courseLevelId", levelId);
    setValue("classGroupId", null);
  }

  const onSubmit = handleSubmit(async (data) => {
    const result = await createEnrollmentAction(data);
    if (result.success) {
      toast.success("Matrícula criada com sucesso");
      router.push(`/enrollments/${result.data.id}`);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Section 1: Student */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Aluno
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Aluno *</Label>
            <Controller
              name="studentId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar aluno" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                        {s.code ? ` (${s.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.studentId && (
              <p className="text-xs text-destructive">{errors.studentId.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Filial *</Label>
            <Controller
              name="branchId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar filial" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.branchId && (
              <p className="text-xs text-destructive">{errors.branchId.message}</p>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Course and Level */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Curso e Nível
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Curso *</Label>
            <Controller
              name="courseId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => {
                    field.onChange(v);
                    handleCourseChange();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar curso" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.courseId && (
              <p className="text-xs text-destructive">{errors.courseId.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Nível</Label>
            <Controller
              name="courseLevelId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? "__none__"}
                  onValueChange={(v) => {
                    const val = v === "__none__" ? null : v;
                    field.onChange(val);
                    handleLevelChange(val);
                  }}
                  disabled={!selectedCourseId || filteredLevels.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar nível" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem nível específico</SelectItem>
                    {filteredLevels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </section>

      {/* Section 3: Class Group */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Turma
        </h3>
        <div className="space-y-1.5">
          <Label>Turma (opcional)</Label>
          <Controller
            name="classGroupId"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value ?? "__none__"}
                onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                disabled={!selectedCourseId || filteredGroups.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem turma</SelectItem>
                  {filteredGroups.map((g) => (
                    <SelectItem
                      key={g.id}
                      value={g.id}
                      disabled={g.currentCount >= g.capacity}
                    >
                      {g.name} ({g.currentCount}/{g.capacity} alunos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.classGroupId && (
            <p className="text-xs text-destructive">{errors.classGroupId.message}</p>
          )}
        </div>
      </section>

      {/* Section 4: Dates */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Datas
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="enroll-date">Data de Matrícula *</Label>
            <Input
              id="enroll-date"
              type="date"
              {...register("enrollmentDate")}
            />
            {errors.enrollmentDate && (
              <p className="text-xs text-destructive">{errors.enrollmentDate.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start-date">Data de Início</Label>
            <Input
              id="start-date"
              type="date"
              {...register("startDate")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-date">Data de Fim Prevista</Label>
            <Input
              id="end-date"
              type="date"
              {...register("expectedEndDate")}
            />
          </div>
        </div>
      </section>

      {/* Section 5: Billing Preview */}
      {selectedCourseId && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Previsão de Faturação
          </h3>
          {previewLoading ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground animate-pulse">
              A calcular previsão...
            </div>
          ) : !billingPreview ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Nenhuma política de faturação ativa. A fatura será gerada manualmente após a matrícula.
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/20 divide-y divide-border text-sm">
              {billingPreview.items.map((item) => (
                <div key={item.feeDefinitionId} className="flex justify-between px-4 py-2">
                  <span className="text-foreground">{item.description}</span>
                  <span className="font-medium tabular-nums">
                    {item.totalPrice.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              {billingPreview.discounts.map((d) => (
                <div key={d.discountRuleId} className="flex justify-between px-4 py-2 text-green-700 dark:text-green-400">
                  <span>Desconto — {d.name}</span>
                  <span className="font-medium tabular-nums">
                    −{d.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              {billingPreview.taxes.map((t) => (
                <div key={t.taxRuleId} className="flex justify-between px-4 py-2 text-muted-foreground">
                  <span>{t.name} ({t.rate}%)</span>
                  <span className="tabular-nums">
                    +{t.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5 font-semibold text-base">
                <span>Total</span>
                <span className="tabular-nums">
                  {billingPreview.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {billingPreview.installmentsPreview.length > 0 && (
                <div className="px-4 py-2 text-muted-foreground">
                  <span className="font-medium text-foreground">Prestações: </span>
                  {billingPreview.installmentsPreview.map((inst) => (
                    <span key={inst.number} className="mr-2">
                      {inst.number}ª {inst.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Section 6: Notes */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Notas
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="enroll-notes">Observações</Label>
          <Textarea
            id="enroll-notes"
            placeholder="Informações adicionais sobre a matrícula..."
            rows={3}
            {...register("notes")}
          />
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Criar Matrícula
        </Button>
      </div>
    </form>
  );
}

// =============================================================================
// EDIT ENROLLMENT FORM
// =============================================================================

interface EditEnrollmentFormProps {
  enrollment: Enrollment;
  levels: LevelOption[];
  classGroups: ClassGroupOption[];
  branches: BranchOption[];
}

export function EditEnrollmentForm({
  enrollment,
  levels,
  classGroups,
  branches,
}: EditEnrollmentFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateEnrollmentSchema>({
    resolver: zodResolver(updateEnrollmentSchema),
    defaultValues: {
      branchId: enrollment.branchId ?? undefined,
      courseLevelId: enrollment.courseLevelId ?? null,
      classGroupId: enrollment.classGroupId ?? null,
      startDate: enrollment.startDate
        ? new Date(enrollment.startDate).toISOString().split("T")[0]
        : null,
      expectedEndDate: enrollment.expectedEndDate
        ? new Date(enrollment.expectedEndDate).toISOString().split("T")[0]
        : null,
      notes: enrollment.notes ?? null,
    },
  });

  const selectedLevelId = watch("courseLevelId") ?? enrollment.courseLevelId ?? "";
  const filteredLevels = levels.filter((l) => l.courseId === enrollment.courseId);
  const filteredGroups = classGroups.filter((g) => {
    if (g.courseId !== enrollment.courseId) return false;
    if (selectedLevelId && g.courseLevelId && g.courseLevelId !== selectedLevelId) return false;
    return true;
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateEnrollmentAction(enrollment.id, data);
    if (result.success) {
      toast.success("Matrícula atualizada com sucesso");
      router.push(`/enrollments/${enrollment.id}`);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Read-only: Student and Course */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Aluno e Curso
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Aluno</Label>
            <Input value={enrollment.studentName ?? "—"} readOnly className="bg-muted/40" />
          </div>
          <div className="space-y-1.5">
            <Label>Curso</Label>
            <Input value={enrollment.courseName ?? "—"} readOnly className="bg-muted/40" />
          </div>
        </div>
      </section>

      {/* Editable: Branch */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Filial
        </h3>
        <div className="space-y-1.5">
          <Label>Filial</Label>
          <Controller
            name="branchId"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value ?? "__none__"}
                onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar filial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem filial</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </section>

      {/* Editable: Level and Class Group */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Nível e Turma
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Nível</Label>
            <Controller
              name="courseLevelId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? "__none__"}
                  onValueChange={(v) => {
                    field.onChange(v === "__none__" ? null : v);
                    setValue("classGroupId", null);
                  }}
                  disabled={filteredLevels.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar nível" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem nível específico</SelectItem>
                    {filteredLevels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Turma</Label>
            <Controller
              name="classGroupId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? "__none__"}
                  onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                  disabled={filteredGroups.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar turma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem turma</SelectItem>
                    {filteredGroups.map((g) => (
                      <SelectItem
                        key={g.id}
                        value={g.id}
                        disabled={g.id !== enrollment.classGroupId && g.currentCount >= g.capacity}
                      >
                        {g.name} ({g.currentCount}/{g.capacity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </section>

      {/* Editable: Dates */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Datas
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-start-date">Data de Início</Label>
            <Input
              id="edit-start-date"
              type="date"
              {...register("startDate")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-end-date">Data de Fim Prevista</Label>
            <Input
              id="edit-end-date"
              type="date"
              {...register("expectedEndDate")}
            />
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Notas
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="edit-notes">Observações</Label>
          <Textarea
            id="edit-notes"
            placeholder="Informações adicionais..."
            rows={3}
            {...register("notes")}
          />
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Guardar Alterações
        </Button>
      </div>
    </form>
  );
}
