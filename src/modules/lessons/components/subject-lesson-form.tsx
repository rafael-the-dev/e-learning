"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
import { Switch } from "@/shared/components/ui/switch";
import { toast } from "@/shared/hooks/use-toast";
import {
  assignLessonToSubjectSchema,
  updateSubjectLessonSchema,
  type AssignLessonToSubjectSchema,
  type UpdateSubjectLessonSchema,
} from "@/modules/lessons/schemas/subject-lesson.schema";
import {
  assignLessonToSubjectAction,
  updateSubjectLessonAction,
} from "@/modules/lessons/actions/subject-lesson.actions";
import type { SubjectLesson, Lesson } from "@/modules/lessons/types";

// =============================================================================
// ASSIGN LESSON DRAWER
// =============================================================================

interface AssignLessonDrawerProps {
  subjectId: string;
  availableLessons: Lesson[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AssignLessonDrawer({
  subjectId,
  availableLessons,
  open,
  onOpenChange,
  onSuccess,
}: AssignLessonDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AssignLessonToSubjectSchema>({
    resolver: zodResolver(assignLessonToSubjectSchema),
    defaultValues: {
      subjectId,
      isRequired: false,
      minWatchPercentage: 0,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await assignLessonToSubjectAction(data);
    if (result.success) {
      toast.success("Lição atribuída à disciplina");
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
          <SheetTitle>Atribuir Lição</SheetTitle>
          <SheetDescription>
            Selecione uma lição da biblioteca para adicionar a esta disciplina.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input type="hidden" {...register("subjectId")} />

          <div className="space-y-1.5">
            <Label>Lição *</Label>
            <Controller
              name="lessonId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar lição…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLessons.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.lessonId && (
              <p className="text-xs text-destructive">{errors.lessonId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-min-watch">Percentagem Mínima de Visualização</Label>
            <Input
              id="assign-min-watch"
              type="number"
              min={0}
              max={100}
              {...register("minWatchPercentage", { valueAsNumber: true })}
            />
            {errors.minWatchPercentage && (
              <p className="text-xs text-destructive">{errors.minWatchPercentage.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="assign-required">Lição Obrigatória</Label>
            <Controller
              name="isRequired"
              control={control}
              render={({ field }) => (
                <Switch
                  id="assign-required"
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Atribuir
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// EDIT SUBJECT LESSON DRAWER
// =============================================================================

interface EditSubjectLessonDrawerProps {
  subjectLesson: SubjectLesson;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditSubjectLessonDrawer({
  subjectLesson,
  open,
  onOpenChange,
  onSuccess,
}: EditSubjectLessonDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSubjectLessonSchema>({
    resolver: zodResolver(updateSubjectLessonSchema),
    defaultValues: {
      subjectLessonId: subjectLesson.id,
      isRequired: subjectLesson.isRequired,
      minWatchPercentage: subjectLesson.minWatchPercentage,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateSubjectLessonAction(data);
    if (result.success) {
      toast.success("Configuração atualizada");
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
          <SheetTitle>Configurar Lição</SheetTitle>
          <SheetDescription>{subjectLesson.lesson?.title}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input type="hidden" {...register("subjectLessonId")} />

          <div className="space-y-1.5">
            <Label htmlFor="edit-min-watch">Percentagem Mínima de Visualização</Label>
            <Input
              id="edit-min-watch"
              type="number"
              min={0}
              max={100}
              {...register("minWatchPercentage", { valueAsNumber: true })}
            />
            {errors.minWatchPercentage && (
              <p className="text-xs text-destructive">{errors.minWatchPercentage.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="edit-required">Lição Obrigatória</Label>
            <Controller
              name="isRequired"
              control={control}
              render={({ field }) => (
                <Switch
                  id="edit-required"
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
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
