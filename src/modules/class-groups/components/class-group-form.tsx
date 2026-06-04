"use client";

import * as React from "react";
import {
  useForm,
  Controller,
  type UseFormRegister,
  type Control,
  type FieldErrors,
  type FieldValues,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
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
import { toast } from "@/shared/hooks/use-toast";
import {
  createClassGroupSchema,
  updateClassGroupSchema,
  type CreateClassGroupSchema,
  type UpdateClassGroupSchema,
} from "@/modules/class-groups/schemas/class-group.schema";
import {
  createClassGroupAction,
  updateClassGroupAction,
} from "@/modules/class-groups/actions/class-group.actions";
import { CLASS_GROUP_STATUS_LABELS } from "@/modules/class-groups/types";
import type { ClassGroup } from "@/modules/class-groups/types";

// =============================================================================
// SHARED OPTION TYPES
// =============================================================================

export interface CourseOption {
  id: string;
  name: string;
}

export interface LevelOption {
  id: string;
  name: string;
  courseId: string;
}

export interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
}

export interface BranchOption {
  id: string;
  name: string;
}

// =============================================================================
// FORM FIELDS (shared between create and edit)
// =============================================================================

interface FormFieldsProps {
  register: UseFormRegister<FieldValues>;
  control: Control<FieldValues>;
  errors: Record<string, { message?: string } | undefined>;
  courses: CourseOption[];
  levels: LevelOption[];
  teachers: TeacherOption[];
  branches: BranchOption[];
  selectedCourseId: string;
  onCourseChange: (courseId: string) => void;
}

function ClassGroupFormFields({
  register,
  control,
  errors,
  courses,
  levels,
  teachers,
  branches,
  selectedCourseId,
  onCourseChange,
}: FormFieldsProps) {
  const filteredLevels = levels.filter((l) => l.courseId === selectedCourseId);

  return (
    <div className="space-y-6">
      {/* Section 1: Basic Information */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Informação Básica
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="cg-name">Nome *</Label>
            <Input
              id="cg-name"
              placeholder="Ex.: Turma A — Código da Estrada"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cg-code">Código</Label>
            <Input
              id="cg-code"
              placeholder="Ex.: T-2024-A"
              {...register("code")}
            />
            {errors.code && (
              <p className="text-xs text-destructive">{errors.code.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CLASS_GROUP_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </section>

      {/* Section 2: Course & Level */}
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
                    onCourseChange(v);
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
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  disabled={!selectedCourseId || filteredLevels.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar nível" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sem nível específico</SelectItem>
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

      {/* Section 3: Teacher & Branch */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Professor e Filial
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Professor</Label>
            <Controller
              name="teacherId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar professor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sem professor</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Filial</Label>
            <Controller
              name="branchId"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar filial" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sem filial específica</SelectItem>
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
        </div>
      </section>

      {/* Section 4: Dates & Capacity */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Datas e Capacidade
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cg-capacity">Capacidade *</Label>
            <Input
              id="cg-capacity"
              type="number"
              min={1}
              {...register("capacity", { valueAsNumber: true })}
            />
            {errors.capacity && (
              <p className="text-xs text-destructive">{errors.capacity.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cg-start">Data de Início</Label>
            <Input
              id="cg-start"
              type="date"
              {...register("startDate")}
            />
            {errors.startDate && (
              <p className="text-xs text-destructive">{errors.startDate.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cg-end">Data de Fim</Label>
            <Input
              id="cg-end"
              type="date"
              {...register("endDate")}
            />
            {errors.endDate && (
              <p className="text-xs text-destructive">{errors.endDate.message}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// CREATE FORM
// =============================================================================

interface CreateClassGroupFormProps {
  courses: CourseOption[];
  levels: LevelOption[];
  teachers: TeacherOption[];
  branches: BranchOption[];
}

export function CreateClassGroupForm({
  courses,
  levels,
  teachers,
  branches,
}: CreateClassGroupFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateClassGroupSchema>({
    resolver: zodResolver(createClassGroupSchema),
    defaultValues: {
      status: "FORMING",
      capacity: 30,
    },
  });

  const selectedCourseId = watch("courseId") ?? "";

  function handleCourseChange(courseId: string) {
    setValue("courseId", courseId);
    setValue("courseLevelId", undefined);
  }

  const onSubmit = handleSubmit(async (data) => {
    const result = await createClassGroupAction(data);
    if (result.success) {
      toast.success("Turma criada com sucesso");
      router.push(`/class-groups/${result.data.id}`);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <ClassGroupFormFields
        register={register as unknown as UseFormRegister<FieldValues>}
        control={control as unknown as Control<FieldValues>}
        errors={errors as Record<string, { message?: string } | undefined>}
        courses={courses}
        levels={levels}
        teachers={teachers}
        branches={branches}
        selectedCourseId={selectedCourseId}
        onCourseChange={handleCourseChange}
      />
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Criar Turma
        </Button>
      </div>
    </form>
  );
}

// =============================================================================
// EDIT FORM
// =============================================================================

interface EditClassGroupFormProps {
  classGroup: ClassGroup;
  courses: CourseOption[];
  levels: LevelOption[];
  teachers: TeacherOption[];
  branches: BranchOption[];
}

export function EditClassGroupForm({
  classGroup,
  courses,
  levels,
  teachers,
  branches,
}: EditClassGroupFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateClassGroupSchema>({
    resolver: zodResolver(updateClassGroupSchema),
    defaultValues: {
      name: classGroup.name,
      code: classGroup.code ?? undefined,
      courseId: classGroup.courseId,
      courseLevelId: classGroup.courseLevelId ?? undefined,
      branchId: classGroup.branchId ?? undefined,
      teacherId: classGroup.teacherId ?? undefined,
      capacity: classGroup.capacity,
      startDate: classGroup.startDate
        ? new Date(classGroup.startDate).toISOString().split("T")[0]
        : undefined,
      endDate: classGroup.endDate
        ? new Date(classGroup.endDate).toISOString().split("T")[0]
        : undefined,
      status: classGroup.status as UpdateClassGroupSchema["status"],
    },
  });

  const selectedCourseId = watch("courseId") ?? classGroup.courseId;

  function handleCourseChange(courseId: string) {
    setValue("courseId", courseId);
    setValue("courseLevelId", null);
  }

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateClassGroupAction(classGroup.id, data);
    if (result.success) {
      toast.success("Turma atualizada com sucesso");
      router.push(`/class-groups/${classGroup.id}`);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <ClassGroupFormFields
        register={register as unknown as UseFormRegister<FieldValues>}
        control={control as unknown as Control<FieldValues>}
        errors={errors as Record<string, { message?: string } | undefined>}
        courses={courses}
        levels={levels}
        teachers={teachers}
        branches={branches}
        selectedCourseId={selectedCourseId}
        onCourseChange={handleCourseChange}
      />
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Guardar Alterações
        </Button>
      </div>
    </form>
  );
}
