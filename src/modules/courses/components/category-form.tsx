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
  createCourseCategorySchema,
  updateCourseCategorySchema,
  type CreateCourseCategorySchema,
  type UpdateCourseCategorySchema,
} from "@/modules/courses/schemas/category.schema";
import {
  createCourseCategoryAction,
  updateCourseCategoryAction,
} from "@/modules/courses/actions/category.actions";
import { COURSE_CATEGORY_STATUS_LABELS } from "@/modules/courses/types";
import type { CourseCategoryWithCount } from "@/modules/courses/types";

// =============================================================================
// CREATE CATEGORY DRAWER
// =============================================================================

interface CreateCategoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateCategoryDrawer({
  open,
  onOpenChange,
  onSuccess,
}: CreateCategoryDrawerProps) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCourseCategorySchema>({
    resolver: zodResolver(createCourseCategorySchema),
    defaultValues: {
      name: "",
      description: "",
      status: "ACTIVE",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createCourseCategoryAction(data);
    if (result.success) {
      toast.success("Categoria criada com sucesso");
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
          <SheetTitle>Nova Categoria</SheetTitle>
          <SheetDescription>
            Criar uma nova categoria de cursos para a organização.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nome *</Label>
            <Input
              id="cat-name"
              placeholder="Ex.: Informática, Idiomas, Saúde..."
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Descrição</Label>
            <Textarea
              id="cat-desc"
              placeholder="Descreva esta categoria..."
              rows={3}
              {...register("description")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              defaultValue="ACTIVE"
              onValueChange={(v) =>
                setValue("status", v as CreateCourseCategorySchema["status"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Ativa</SelectItem>
                <SelectItem value="INACTIVE">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Criar Categoria
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// EDIT CATEGORY DRAWER
// =============================================================================

interface EditCategoryDrawerProps {
  category: CourseCategoryWithCount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditCategoryDrawer({
  category,
  open,
  onOpenChange,
  onSuccess,
}: EditCategoryDrawerProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateCourseCategorySchema>({
    resolver: zodResolver(updateCourseCategorySchema),
    defaultValues: {
      name: category.name,
      description: category.description ?? "",
      status: category.status as UpdateCourseCategorySchema["status"],
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateCourseCategoryAction(category.id, data);
    if (result.success) {
      toast.success("Categoria atualizada");
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
          <SheetTitle>Editar Categoria</SheetTitle>
          <SheetDescription>Atualizar informações da categoria.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-cat-name">Nome *</Label>
            <Input id="edit-cat-name" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-cat-desc">Descrição</Label>
            <Textarea id="edit-cat-desc" rows={3} {...register("description")} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              defaultValue={category.status}
              onValueChange={(v) =>
                setValue(
                  "status",
                  v as NonNullable<UpdateCourseCategorySchema["status"]>
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COURSE_CATEGORY_STATUS_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
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
