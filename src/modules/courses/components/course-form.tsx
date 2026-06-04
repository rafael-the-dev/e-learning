"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { FormSection } from "@/shared/components/form/form-section";
import { Textarea } from "@/shared/components/ui/textarea";
import { toast } from "@/shared/hooks/use-toast";
import {
  createCourseSchema,
  updateCourseSchema,
  type CreateCourseSchema,
  type UpdateCourseSchema,
} from "@/modules/courses/schemas/course.schema";
import {
  createCourseAction,
  updateCourseAction,
} from "@/modules/courses/actions/course.actions";
import {
  COURSE_CATEGORY_LABELS,
  COURSE_STATUS_LABELS,
} from "@/modules/courses/types";
import type { Course } from "@/modules/courses/types";

// =============================================================================
// CREATE FORM
// =============================================================================

export function CreateCourseForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateCourseSchema>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: {
      name: "",
      code: "",
      description: "",
      category: "",
      totalHours: "",
      price: "",
      status: "DRAFT",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createCourseAction(data);
    if (result.success) {
      toast.success("Curso criado com sucesso");
      router.push(`/courses/${result.data.id}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormSection title="Informação Básica">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome do Curso *</Label>
          <Input
            id="name"
            placeholder="Ex.: Condução Categoria B"
            {...register("name")}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Código</Label>
            <Input
              id="code"
              placeholder="Ex.: CAT-B"
              {...register("code")}
            />
            {errors.code && (
              <p className="text-xs text-destructive">{errors.code.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              onValueChange={(v) => setValue("category", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria</SelectItem>
                {Object.entries(COURSE_CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            placeholder="Descreva o curso..."
            rows={3}
            {...register("description")}
          />
        </div>
      </FormSection>

      <FormSection title="Configuração do Curso">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="totalHours">Carga Horária (horas)</Label>
            <Input
              id="totalHours"
              type="number"
              placeholder="Ex.: 40"
              {...register("totalHours")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              defaultValue="DRAFT"
              onValueChange={(v) =>
                setValue("status", v as CreateCourseSchema["status"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Rascunho</SelectItem>
                <SelectItem value="ACTIVE">Ativo</SelectItem>
                <SelectItem value="INACTIVE">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormSection>

      <FormSection title="Preço">
        <div className="space-y-1.5">
          <Label htmlFor="price">Preço Base (MZN)</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            placeholder="Ex.: 15000.00"
            {...register("price")}
          />
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Criar Curso
        </Button>
      </div>
    </form>
  );
}

// =============================================================================
// EDIT FORM
// =============================================================================

interface EditCourseFormProps {
  course: Course;
}

export function EditCourseForm({ course }: EditCourseFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateCourseSchema>({
    resolver: zodResolver(updateCourseSchema),
    defaultValues: {
      name: course.name,
      code: course.code ?? "",
      description: course.description ?? "",
      category: course.category ?? "",
      totalHours: course.totalHours ? String(course.totalHours) : "",
      price: course.price ? String(parseFloat(course.price)) : "",
      status: course.status as UpdateCourseSchema["status"],
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateCourseAction(course.id, data);
    if (result.success) {
      toast.success("Curso atualizado com sucesso");
      router.push(`/courses/${course.id}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormSection title="Informação Básica">
        <div className="space-y-1.5">
          <Label htmlFor="edit-name">Nome do Curso *</Label>
          <Input id="edit-name" {...register("name")} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-code">Código</Label>
            <Input id="edit-code" {...register("code")} />
            {errors.code && (
              <p className="text-xs text-destructive">{errors.code.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              defaultValue={course.category ?? "none"}
              onValueChange={(v) => setValue("category", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria</SelectItem>
                {Object.entries(COURSE_CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-description">Descrição</Label>
          <Textarea id="edit-description" rows={3} {...register("description")} />
        </div>
      </FormSection>

      <FormSection title="Configuração do Curso">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-totalHours">Carga Horária (horas)</Label>
            <Input id="edit-totalHours" type="number" {...register("totalHours")} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              defaultValue={course.status}
              onValueChange={(v) =>
                setValue("status", v as NonNullable<UpdateCourseSchema["status"]>)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COURSE_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormSection>

      <FormSection title="Preço">
        <div className="space-y-1.5">
          <Label htmlFor="edit-price">Preço Base (MZN)</Label>
          <Input id="edit-price" type="number" step="0.01" {...register("price")} />
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3 pt-2">
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
