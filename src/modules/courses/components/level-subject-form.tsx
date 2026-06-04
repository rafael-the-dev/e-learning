"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AssignSubjectSchema>({
    resolver: zodResolver(assignSubjectSchema),
    defaultValues: {
      subjectId: "",
      isRequired: false,
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
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Associar Disciplina</SheetTitle>
          <SheetDescription>
            Selecione uma disciplina e defina as regras para este nível.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-order">Ordem</Label>
              <Input
                id="assign-order"
                type="number"
                min={0}
                placeholder="Auto"
                {...register("order", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-hours">Carga Horária (h)</Label>
              <Input
                id="assign-hours"
                type="number"
                min={1}
                placeholder="Ex.: 40"
                {...register("workloadHours", { valueAsNumber: true })}
              />
              {errors.workloadHours && (
                <p className="text-xs text-destructive">{errors.workloadHours.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-grade">Nota Mínima de Aprovação (%)</Label>
            <Input
              id="assign-grade"
              type="number"
              min={0}
              max={100}
              step={0.5}
              placeholder="Ex.: 50"
              {...register("minimumPassingGrade", { valueAsNumber: true })}
            />
            {errors.minimumPassingGrade && (
              <p className="text-xs text-destructive">{errors.minimumPassingGrade.message}</p>
            )}
          </div>

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

          <div className="flex items-center gap-2 pt-1">
            <Controller
              name="isRequired"
              control={control}
              render={({ field }) => (
                <Switch
                  id="assign-required"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="assign-required" className="cursor-pointer">
              Disciplina obrigatória
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
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
      minimumPassingGrade: levelSubject.minimumPassingGrade
        ? parseFloat(levelSubject.minimumPassingGrade)
        : undefined,
      isRequired: levelSubject.isRequired,
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
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Editar Associação</SheetTitle>
          <SheetDescription>
            {levelSubject.subjectName} — atualizar regras para este nível.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-ls-order">Ordem</Label>
              <Input
                id="edit-ls-order"
                type="number"
                min={0}
                {...register("order", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-ls-hours">Carga Horária (h)</Label>
              <Input
                id="edit-ls-hours"
                type="number"
                min={1}
                {...register("workloadHours", { valueAsNumber: true })}
              />
              {errors.workloadHours && (
                <p className="text-xs text-destructive">{errors.workloadHours.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-ls-grade">Nota Mínima de Aprovação (%)</Label>
            <Input
              id="edit-ls-grade"
              type="number"
              min={0}
              max={100}
              step={0.5}
              {...register("minimumPassingGrade", { valueAsNumber: true })}
            />
            {errors.minimumPassingGrade && (
              <p className="text-xs text-destructive">{errors.minimumPassingGrade.message}</p>
            )}
          </div>

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

          <div className="flex items-center gap-2 pt-1">
            <Controller
              name="isRequired"
              control={control}
              render={({ field }) => (
                <Switch
                  id="edit-ls-required"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="edit-ls-required" className="cursor-pointer">
              Disciplina obrigatória
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
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
