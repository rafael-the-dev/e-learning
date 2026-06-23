"use client";

import * as React from "react";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Separator } from "@/shared/components/ui/separator";
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

// Helpers: empty string from a number input should become null/undefined, not NaN.
const intOrNull = { setValueAs: (v: string) => (v === "" ? null : parseInt(v, 10)) };
const floatOrNull = { setValueAs: (v: string) => (v === "" ? null : parseFloat(v)) };
const intOrUndefined = { setValueAs: (v: string) => (v === "" ? undefined : parseInt(v, 10)) };
import {
  assignSubjectSchema,
  updateLevelSubjectSchema,
  type AssignSubjectSchema,
  type UpdateLevelSubjectSchema,
} from "@/modules/courses/schemas/level-subject.schema";
import {
  assignSubjectToLevelAction,
  updateLevelSubjectAction,
} from "@/modules/courses/actions/level-subject.actions";
import { LEVEL_SUBJECT_STATUS_LABELS } from "@/modules/courses/types";
import type { LevelSubject, Subject } from "@/modules/courses/types";

// =============================================================================
// ASSIGN SUBJECT DRAWER
// =============================================================================

interface AssignSubjectDrawerProps {
  courseId: string;
  courseLevelId: string;
  availableSubjects: Subject[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AssignSubjectDrawer({
  courseId,
  courseLevelId,
  availableSubjects,
  open,
  onOpenChange,
  onSuccess,
}: AssignSubjectDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof assignSubjectSchema>, unknown, AssignSubjectSchema>({
    resolver: zodResolver(assignSubjectSchema),
    defaultValues: {
      subjectId: "",
      isRequired: true,
      allowRetakeExam: true,
      allowCompensation: false,
      certificateRequired: false,
      status: "ACTIVE",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await assignSubjectToLevelAction(courseId, courseLevelId, data);
    if (result.success) {
      toast.success("Disciplina associada com sucesso");
      reset();
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Associar Disciplina</SheetTitle>
          <SheetDescription>
            Selecione uma disciplina e configure as regras académicas para este nível.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          {/* Disciplina */}
          <div className="space-y-1.5">
            <Label>Disciplina *</Label>
            <Controller
              name="subjectId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar disciplina" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.code && (
                          <span className="text-muted-foreground ml-1.5 text-xs font-mono">
                            ({s.code})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.subjectId && (
              <p className="text-xs text-destructive">{errors.subjectId.message}</p>
            )}
          </div>

          <Separator />

          {/* Carga Horária */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Carga Horária
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="assign-order">Ordem</Label>
                <Input
                  id="assign-order"
                  type="number"
                  min={0}
                  placeholder="Auto"
                  {...register("order", intOrUndefined)}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="assign-hours">Total (h)</Label>
                <Input
                  id="assign-hours"
                  type="number"
                  min={1}
                  placeholder="Ex.: 60"
                  {...register("workloadHours", intOrNull)}
                />
                {errors.workloadHours && (
                  <p className="text-xs text-destructive">{errors.workloadHours.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="assign-theory">Teóricas (h)</Label>
                <Input
                  id="assign-theory"
                  type="number"
                  min={0}
                  placeholder="Ex.: 40"
                  {...register("theoryHours", intOrNull)}
                />
                {errors.theoryHours && (
                  <p className="text-xs text-destructive">{errors.theoryHours.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assign-practical">Práticas (h)</Label>
                <Input
                  id="assign-practical"
                  type="number"
                  min={0}
                  placeholder="Ex.: 20"
                  {...register("practicalHours", intOrNull)}
                />
                {errors.practicalHours && (
                  <p className="text-xs text-destructive">{errors.practicalHours.message}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Regras Académicas */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Regras Académicas
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="assign-grade">Nota Mínima de Aprovação (0–100)</Label>
              <Input
                id="assign-grade"
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder="Ex.: 50"
                {...register("minimumPassingGrade", floatOrNull)}
              />
              {errors.minimumPassingGrade && (
                <p className="text-xs text-destructive">{errors.minimumPassingGrade.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="assign-attendance">Frequência Mínima (%)</Label>
                <Input
                  id="assign-attendance"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder="Ex.: 75"
                  {...register("minimumAttendancePercentage", floatOrNull)}
                />
                {errors.minimumAttendancePercentage && (
                  <p className="text-xs text-destructive">
                    {errors.minimumAttendancePercentage.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assign-absences">Máx. Faltas</Label>
                <Input
                  id="assign-absences"
                  type="number"
                  min={0}
                  placeholder="Ex.: 5"
                  {...register("maxAbsences", intOrNull)}
                />
                {errors.maxAbsences && (
                  <p className="text-xs text-destructive">{errors.maxAbsences.message}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Opções */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Opções
            </p>
            <div className="space-y-3">
              <SwitchField
                id="assign-required"
                name="isRequired"
                control={control}
                label="Disciplina obrigatória"
                description="Esta disciplina é mandatória no currículo do nível."
              />
              <SwitchField
                id="assign-retake"
                name="allowRetakeExam"
                control={control}
                label="Permitir recurso de exame"
                description="O aluno pode realizar um exame de recurso caso reprovado."
              />
              <SwitchField
                id="assign-compensation"
                name="allowCompensation"
                control={control}
                label="Permitir compensação de nota"
                description="A nota pode ser compensada por outras disciplinas."
              />
              <SwitchField
                id="assign-certificate"
                name="certificateRequired"
                control={control}
                label="Obrigatória para certificado"
                description="O aluno deve concluir esta disciplina para obter o certificado."
              />
            </div>
          </div>

          <Separator />

          {/* Estado */}
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEVEL_SUBJECT_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Associar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// EDIT LEVEL SUBJECT DRAWER
// =============================================================================

interface EditLevelSubjectDrawerProps {
  courseId: string;
  courseLevelId: string;
  levelSubject: LevelSubject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditLevelSubjectDrawer({
  courseId,
  courseLevelId,
  levelSubject,
  open,
  onOpenChange,
  onSuccess,
}: EditLevelSubjectDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateLevelSubjectSchema>({
    resolver: zodResolver(updateLevelSubjectSchema),
    defaultValues: {
      order: levelSubject.order,
      workloadHours: levelSubject.workloadHours ?? undefined,
      theoryHours: levelSubject.theoryHours ?? undefined,
      practicalHours: levelSubject.practicalHours ?? undefined,
      minimumPassingGrade: levelSubject.minimumPassingGrade
        ? parseFloat(levelSubject.minimumPassingGrade)
        : undefined,
      minimumAttendancePercentage: levelSubject.minimumAttendancePercentage
        ? parseFloat(levelSubject.minimumAttendancePercentage)
        : undefined,
      maxAbsences: levelSubject.maxAbsences ?? undefined,
      isRequired: levelSubject.isRequired,
      allowRetakeExam: levelSubject.allowRetakeExam,
      allowCompensation: levelSubject.allowCompensation,
      certificateRequired: levelSubject.certificateRequired,
      status: levelSubject.status as UpdateLevelSubjectSchema["status"],
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateLevelSubjectAction(
      courseId,
      courseLevelId,
      levelSubject.id,
      data
    );
    if (result.success) {
      toast.success("Associação atualizada");
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar Associação</SheetTitle>
          <SheetDescription>
            {levelSubject.subjectName} — atualizar regras académicas para este nível.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          {/* Carga Horária */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Carga Horária
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-ls-order">Ordem</Label>
                <Input
                  id="edit-ls-order"
                  type="number"
                  min={0}
                  {...register("order", intOrUndefined)}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="edit-ls-hours">Total (h)</Label>
                <Input
                  id="edit-ls-hours"
                  type="number"
                  min={1}
                  {...register("workloadHours", intOrNull)}
                />
                {errors.workloadHours && (
                  <p className="text-xs text-destructive">{errors.workloadHours.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-ls-theory">Teóricas (h)</Label>
                <Input
                  id="edit-ls-theory"
                  type="number"
                  min={0}
                  {...register("theoryHours", intOrNull)}
                />
                {errors.theoryHours && (
                  <p className="text-xs text-destructive">{errors.theoryHours.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-ls-practical">Práticas (h)</Label>
                <Input
                  id="edit-ls-practical"
                  type="number"
                  min={0}
                  {...register("practicalHours", intOrNull)}
                />
                {errors.practicalHours && (
                  <p className="text-xs text-destructive">{errors.practicalHours.message}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Regras Académicas */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Regras Académicas
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="edit-ls-grade">Nota Mínima de Aprovação (0–100)</Label>
              <Input
                id="edit-ls-grade"
                type="number"
                min={0}
                max={100}
                step={0.5}
                {...register("minimumPassingGrade", floatOrNull)}
              />
              {errors.minimumPassingGrade && (
                <p className="text-xs text-destructive">{errors.minimumPassingGrade.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-ls-attendance">Frequência Mínima (%)</Label>
                <Input
                  id="edit-ls-attendance"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  {...register("minimumAttendancePercentage", floatOrNull)}
                />
                {errors.minimumAttendancePercentage && (
                  <p className="text-xs text-destructive">
                    {errors.minimumAttendancePercentage.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-ls-absences">Máx. Faltas</Label>
                <Input
                  id="edit-ls-absences"
                  type="number"
                  min={0}
                  {...register("maxAbsences", intOrNull)}
                />
                {errors.maxAbsences && (
                  <p className="text-xs text-destructive">{errors.maxAbsences.message}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Opções */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Opções
            </p>
            <div className="space-y-3">
              <SwitchField
                id="edit-ls-required"
                name="isRequired"
                control={control}
                label="Disciplina obrigatória"
                description="Esta disciplina é mandatória no currículo do nível."
              />
              <SwitchField
                id="edit-ls-retake"
                name="allowRetakeExam"
                control={control}
                label="Permitir recurso de exame"
                description="O aluno pode realizar um exame de recurso caso reprovado."
              />
              <SwitchField
                id="edit-ls-compensation"
                name="allowCompensation"
                control={control}
                label="Permitir compensação de nota"
                description="A nota pode ser compensada por outras disciplinas."
              />
              <SwitchField
                id="edit-ls-certificate"
                name="certificateRequired"
                control={control}
                label="Obrigatória para certificado"
                description="O aluno deve concluir esta disciplina para obter o certificado."
              />
            </div>
          </div>

          <Separator />

          {/* Estado */}
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEVEL_SUBJECT_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

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
// SHARED SWITCH FIELD
// =============================================================================

function SwitchField({
  id,
  name,
  control,
  label,
  description,
}: {
  id: string;
  name: keyof (AssignSubjectSchema & UpdateLevelSubjectSchema);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  label: string;
  description: string;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <div className="flex items-start gap-3">
          <Switch
            id={id}
            checked={!!field.value}
            onCheckedChange={field.onChange}
            className="mt-0.5"
          />
          <div>
            <Label htmlFor={id} className="cursor-pointer font-medium">
              {label}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
      )}
    />
  );
}
