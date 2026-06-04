"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { toast } from "@/shared/hooks/use-toast";
import {
  createSubjectSchema,
  updateSubjectSchema,
  type CreateSubjectSchema,
  type UpdateSubjectSchema,
} from "@/modules/courses/schemas/subject.schema";
import {
  createSubjectAction,
  updateSubjectAction,
} from "@/modules/courses/actions/subject.actions";
import { SUBJECT_STATUS_LABELS } from "@/modules/courses/types";
import type { CourseLevel, Subject } from "@/modules/courses/types";

// =============================================================================
// CREATE SUBJECT DRAWER
// =============================================================================

interface CreateSubjectDrawerProps {
  courseId: string;
  levels: CourseLevel[];
  defaultLevelId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateSubjectDrawer({
  courseId,
  levels,
  defaultLevelId = "",
  open,
  onOpenChange,
  onSuccess,
}: CreateSubjectDrawerProps) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSubjectSchema>({
    resolver: zodResolver(createSubjectSchema),
    defaultValues: {
      courseLevelId: defaultLevelId,
      name: "",
      code: "",
      description: "",
      hoursRequired: "",
      order: "",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createSubjectAction(courseId, data);
    if (result.success) {
      toast.success("Disciplina criada com sucesso");
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
          <SheetTitle>Nova Disciplina</SheetTitle>
          <SheetDescription>Adicionar uma nova disciplina ao curso.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Nível *</Label>
            <Select
              defaultValue={defaultLevelId || undefined}
              onValueChange={(v) => setValue("courseLevelId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar nível" />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.courseLevelId && (
              <p className="text-xs text-destructive">
                {errors.courseLevelId.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subj-name">Nome *</Label>
            <Input id="subj-name" placeholder="Ex.: Legislação de Trânsito" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subj-code">Código</Label>
              <Input id="subj-code" placeholder="LT-01" {...register("code")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subj-hours">Horas</Label>
              <Input id="subj-hours" type="number" placeholder="10" {...register("hoursRequired")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subj-order">Ordem</Label>
            <Input id="subj-order" type="number" placeholder="0" {...register("order")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subj-desc">Descrição</Label>
            <Textarea
              id="subj-desc"
              placeholder="Descrição da disciplina..."
              rows={3}
              {...register("description")}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Criar Disciplina
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// EDIT SUBJECT DRAWER
// =============================================================================

interface EditSubjectDrawerProps {
  courseId: string;
  levels: CourseLevel[];
  subject: Subject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditSubjectDrawer({
  courseId,
  levels,
  subject,
  open,
  onOpenChange,
  onSuccess,
}: EditSubjectDrawerProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSubjectSchema>({
    resolver: zodResolver(updateSubjectSchema),
    defaultValues: {
      name: subject.name,
      code: subject.code ?? "",
      description: subject.description ?? "",
      courseLevelId: subject.courseLevelId,
      hoursRequired: subject.hoursRequired ? String(subject.hoursRequired) : "",
      order: String(subject.order),
      status: subject.status as UpdateSubjectSchema["status"],
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateSubjectAction(courseId, subject.id, data);
    if (result.success) {
      toast.success("Disciplina atualizada");
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
          <SheetTitle>Editar Disciplina</SheetTitle>
          <SheetDescription>Atualizar informações da disciplina.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Nível *</Label>
            <Select
              defaultValue={subject.courseLevelId}
              onValueChange={(v) => setValue("courseLevelId", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-subj-name">Nome *</Label>
            <Input id="edit-subj-name" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-subj-code">Código</Label>
              <Input id="edit-subj-code" {...register("code")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-subj-hours">Horas</Label>
              <Input id="edit-subj-hours" type="number" {...register("hoursRequired")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-subj-order">Ordem</Label>
            <Input id="edit-subj-order" type="number" {...register("order")} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              defaultValue={subject.status}
              onValueChange={(v) =>
                setValue("status", v as NonNullable<UpdateSubjectSchema["status"]>)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SUBJECT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-subj-desc">Descrição</Label>
            <Textarea id="edit-subj-desc" rows={3} {...register("description")} />
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
