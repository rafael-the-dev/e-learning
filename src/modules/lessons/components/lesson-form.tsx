"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  createLessonSchema,
  updateLessonSchema,
  type CreateLessonSchema,
  type UpdateLessonSchema,
} from "@/modules/lessons/schemas/lesson.schema";
import {
  createLessonAction,
  updateLessonAction,
} from "@/modules/lessons/actions/lesson.actions";
import {
  LESSON_TYPE_LABELS,
  VIDEO_PROVIDER_LABELS,
  LESSON_STATUS_LABELS,
} from "@/modules/lessons/types";
import type { Lesson } from "@/modules/lessons/types";

// =============================================================================
// CREATE LESSON FORM
// =============================================================================

interface CreateLessonFormProps {
  onSuccess?: (lesson: Lesson) => void;
}

export function CreateLessonForm({ onSuccess }: CreateLessonFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateLessonSchema>({
    resolver: zodResolver(createLessonSchema),
    defaultValues: {
      lessonType: "TEXT",
      videoProvider: "NONE",
      status: "DRAFT",
    },
  });

  const title = watch("title");

  React.useEffect(() => {
    if (title) {
      const slug = title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      setValue("slug", slug);
    }
  }, [title, setValue]);

  const onSubmit = handleSubmit(async (data) => {
    const result = await createLessonAction(data);
    if (result.success) {
      toast.success("Lição criada com sucesso");
      if (onSuccess) {
        onSuccess(result.data);
      } else {
        router.push(`/lessons/${result.data.id}`);
      }
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <LessonFormFields register={register} control={control} errors={errors} />
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Criar Lição
        </Button>
      </div>
    </form>
  );
}

// =============================================================================
// EDIT LESSON FORM
// =============================================================================

interface EditLessonFormProps {
  lesson: Lesson;
  onSuccess?: () => void;
}

export function EditLessonForm({ lesson, onSuccess }: EditLessonFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateLessonSchema>({
    resolver: zodResolver(updateLessonSchema),
    defaultValues: {
      lessonId: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description ?? undefined,
      summary: lesson.summary ?? undefined,
      objectives: lesson.objectives ?? undefined,
      durationMinutes: lesson.durationMinutes ?? undefined,
      lessonType: lesson.lessonType as UpdateLessonSchema["lessonType"],
      videoProvider: lesson.videoProvider as UpdateLessonSchema["videoProvider"],
      videoUrl: lesson.videoUrl ?? undefined,
      externalVideoId: lesson.externalVideoId ?? undefined,
      thumbnailUrl: lesson.thumbnailUrl ?? undefined,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateLessonAction(data);
    if (result.success) {
      toast.success("Lição atualizada");
      onSuccess?.();
      router.push(`/lessons/${lesson.id}`);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" {...register("lessonId")} />
      <LessonFormFields register={register} control={control} errors={errors} />
      <div className="flex justify-end gap-3 pt-2">
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

// =============================================================================
// SHARED FIELDS
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LessonFormFields({ register, control, errors }: { register: any; control: any; errors: any }) {
  const lessonTypes = Object.entries(LESSON_TYPE_LABELS);
  const videoProviders = Object.entries(VIDEO_PROVIDER_LABELS);
  const statuses = [
    { value: "DRAFT", label: LESSON_STATUS_LABELS.DRAFT },
    { value: "PUBLISHED", label: LESSON_STATUS_LABELS.PUBLISHED },
  ];

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="lesson-title">Título *</Label>
        <Input id="lesson-title" placeholder="Ex.: Introdução à Condução Defensiva" {...register("title")} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="lesson-slug">Slug *</Label>
        <Input id="lesson-slug" placeholder="introducao-conducao-defensiva" {...register("slug")} />
        {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label>Tipo de Lição *</Label>
          <Controller
            name="lessonType"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lessonTypes.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="lesson-duration">Duração (min)</Label>
          <Input
            id="lesson-duration"
            type="number"
            min={1}
            placeholder="Ex.: 45"
            {...register("durationMinutes", { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Fornecedor de Vídeo</Label>
        <Controller
          name="videoProvider"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "NONE"} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {videoProviders.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="lesson-video-url">URL do Vídeo</Label>
          <Input id="lesson-video-url" placeholder="https://..." {...register("videoUrl")} />
          {errors.videoUrl && <p className="text-xs text-destructive">{errors.videoUrl.message}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lesson-external-id">ID Externo do Vídeo</Label>
          <Input id="lesson-external-id" placeholder="Ex.: dQw4w9WgXcQ" {...register("externalVideoId")} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="lesson-thumbnail">URL da Miniatura</Label>
        <Input id="lesson-thumbnail" placeholder="https://..." {...register("thumbnailUrl")} />
        {errors.thumbnailUrl && <p className="text-xs text-destructive">{errors.thumbnailUrl.message}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="lesson-summary">Resumo</Label>
        <Textarea
          id="lesson-summary"
          placeholder="Breve resumo da lição"
          rows={2}
          {...register("summary")}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="lesson-description">Descrição</Label>
        <Textarea
          id="lesson-description"
          placeholder="Descrição completa da lição"
          rows={4}
          {...register("description")}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="lesson-objectives">Objetivos de Aprendizagem</Label>
        <Textarea
          id="lesson-objectives"
          placeholder="O que o aluno vai aprender..."
          rows={3}
          {...register("objectives")}
        />
      </div>

      <div className="grid gap-1.5">
        <Label>Estado</Label>
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <Select value={field.value ?? "DRAFT"} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </div>
  );
}
