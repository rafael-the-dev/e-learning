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
  createCourseLevelSchema,
  updateCourseLevelSchema,
  type CreateCourseLevelSchema,
  type UpdateCourseLevelSchema,
} from "@/modules/courses/schemas/level.schema";
import {
  createCourseLevelAction,
  updateCourseLevelAction,
} from "@/modules/courses/actions/level.actions";
import { COURSE_LEVEL_STATUS_LABELS } from "@/modules/courses/types";
import type { CourseLevel } from "@/modules/courses/types";

// =============================================================================
// CREATE LEVEL DRAWER
// =============================================================================

interface CreateLevelDrawerProps {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateLevelDrawer({
  courseId,
  open,
  onOpenChange,
  onSuccess,
}: CreateLevelDrawerProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCourseLevelSchema>({
    resolver: zodResolver(createCourseLevelSchema),
    defaultValues: {
      name: "",
      code: "",
      description: "",
      order: "",
      totalHours: "",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createCourseLevelAction(courseId, data);
    if (result.success) {
      toast.success("Nível criado com sucesso");
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
          <SheetTitle>Novo Nível</SheetTitle>
          <SheetDescription>Adicionar um novo nível ao curso.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="level-name">Nome *</Label>
            <Input id="level-name" placeholder="Ex.: Nível 1" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="level-code">Código</Label>
              <Input id="level-code" placeholder="N1" {...register("code")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="level-order">Ordem</Label>
              <Input id="level-order" type="number" placeholder="0" {...register("order")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="level-hours">Carga Horária (horas)</Label>
            <Input id="level-hours" type="number" placeholder="20" {...register("totalHours")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="level-desc">Descrição</Label>
            <Textarea
              id="level-desc"
              placeholder="Descreva este nível..."
              rows={3}
              {...register("description")}
            />
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
              Criar Nível
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// EDIT LEVEL DRAWER
// =============================================================================

interface EditLevelDrawerProps {
  courseId: string;
  level: CourseLevel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditLevelDrawer({
  courseId,
  level,
  open,
  onOpenChange,
  onSuccess,
}: EditLevelDrawerProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateCourseLevelSchema>({
    resolver: zodResolver(updateCourseLevelSchema),
    defaultValues: {
      name: level.name,
      code: level.code ?? "",
      description: level.description ?? "",
      order: String(level.order),
      totalHours: level.totalHours ? String(level.totalHours) : "",
      status: level.status as UpdateCourseLevelSchema["status"],
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateCourseLevelAction(courseId, level.id, data);
    if (result.success) {
      toast.success("Nível atualizado");
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
          <SheetTitle>Editar Nível</SheetTitle>
          <SheetDescription>Atualizar informações do nível.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-level-name">Nome *</Label>
            <Input id="edit-level-name" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-level-code">Código</Label>
              <Input id="edit-level-code" {...register("code")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-level-order">Ordem</Label>
              <Input id="edit-level-order" type="number" {...register("order")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-level-hours">Carga Horária (horas)</Label>
            <Input id="edit-level-hours" type="number" {...register("totalHours")} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              defaultValue={level.status}
              onValueChange={(v) =>
                setValue("status", v as NonNullable<UpdateCourseLevelSchema["status"]>)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COURSE_LEVEL_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-level-desc">Descrição</Label>
            <Textarea id="edit-level-desc" rows={3} {...register("description")} />
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
