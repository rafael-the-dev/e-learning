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
  createTeacherSchema,
  updateTeacherSchema,
  type CreateTeacherSchema,
  type UpdateTeacherSchema,
} from "@/modules/teachers/schemas/teacher.schema";
import {
  createTeacherAction,
  updateTeacherAction,
} from "@/modules/teachers/actions/teacher.actions";
import {
  GENDER_LABELS,
  ID_TYPE_LABELS,
  TEACHER_STATUS_LABELS,
} from "@/modules/teachers/types";
import type { Teacher, TeacherBranch } from "@/modules/teachers/types";
import type { LinkableTeacherUser } from "@/modules/teachers/repositories/teacher.repository";

// =============================================================================
// CREATE FORM
// =============================================================================

interface CreateTeacherFormProps {
  branches: TeacherBranch[];
}

export function CreateTeacherForm({ branches }: CreateTeacherFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateTeacherSchema>({
    resolver: zodResolver(createTeacherSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      gender: "",
      dateOfBirth: "",
      idType: "",
      idNumber: "",
      phone: "",
      email: "",
      address: "",
      licenseNumber: "",
      specialization: "",
      branchId: "",
      notes: "",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createTeacherAction(data);
    if (result.success) {
      toast.success("Professor registado com sucesso");
      router.push(`/teachers/${result.data.id}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormSection title="Informação Pessoal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Primeiro Nome *</Label>
            <Input id="firstName" placeholder="João" {...register("firstName")} />
            {errors.firstName && (
              <p className="text-xs text-destructive">{errors.firstName.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Apelido *</Label>
            <Input id="lastName" placeholder="Silva" {...register("lastName")} />
            {errors.lastName && (
              <p className="text-xs text-destructive">{errors.lastName.message}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Género</Label>
            <Select onValueChange={(v) => setValue("gender", v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar género" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não especificado</SelectItem>
                {Object.entries(GENDER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateOfBirth">Data de Nascimento</Label>
            <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Contacto">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" placeholder="+258 84 000 0000" {...register("phone")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="joao@exemplo.co.mz"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Morada</Label>
          <Input
            id="address"
            placeholder="Av. Eduardo Mondlane, Maputo"
            {...register("address")}
          />
        </div>
      </FormSection>

      <FormSection title="Documento de Identificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Tipo de Documento</Label>
            <Select onValueChange={(v) => setValue("idType", v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não especificado</SelectItem>
                {Object.entries(ID_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idNumber">Número do Documento</Label>
            <Input id="idNumber" placeholder="00000000A" {...register("idNumber")} />
            {errors.idNumber && (
              <p className="text-xs text-destructive">{errors.idNumber.message}</p>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection title="Informação Profissional">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="licenseNumber">Número de Licença</Label>
            <Input
              id="licenseNumber"
              placeholder="LIC-000000"
              {...register("licenseNumber")}
            />
            {errors.licenseNumber && (
              <p className="text-xs text-destructive">{errors.licenseNumber.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="specialization">Especialização</Label>
            <Input
              id="specialization"
              placeholder="Condução Defensiva"
              {...register("specialization")}
            />
          </div>
        </div>
      </FormSection>

      {branches.length > 0 && (
        <FormSection title="Organização / Filial">
          <div className="space-y-1.5">
            <Label>Filial</Label>
            <Select onValueChange={(v) => setValue("branchId", v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar filial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem filial</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.branchId && (
              <p className="text-xs text-destructive">{errors.branchId.message}</p>
            )}
          </div>
        </FormSection>
      )}

      <FormSection title="Notas">
        <div className="space-y-1.5">
          <Label htmlFor="notes">Observações</Label>
          <Textarea
            id="notes"
            placeholder="Informações adicionais sobre o professor..."
            {...register("notes")}
          />
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Registar Professor
        </Button>
      </div>
    </form>
  );
}

// =============================================================================
// EDIT FORM
// =============================================================================

interface EditTeacherFormProps {
  teacher: Teacher;
  branches: TeacherBranch[];
  linkableUsers: LinkableTeacherUser[];
}

export function EditTeacherForm({ teacher, branches, linkableUsers }: EditTeacherFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateTeacherSchema>({
    resolver: zodResolver(updateTeacherSchema),
    defaultValues: {
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      gender: teacher.gender ?? "",
      dateOfBirth: teacher.dateOfBirth
        ? new Date(teacher.dateOfBirth).toISOString().split("T")[0]
        : "",
      idType: teacher.idType ?? "",
      idNumber: teacher.idNumber ?? "",
      phone: teacher.phone ?? "",
      email: teacher.email ?? "",
      address: teacher.address ?? "",
      licenseNumber: teacher.licenseNumber ?? "",
      specialization: teacher.specialization ?? "",
      branchId: teacher.branch?.id ?? "",
      userId: teacher.userId ?? "",
      notes: teacher.notes ?? "",
      status: teacher.status as UpdateTeacherSchema["status"],
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateTeacherAction(teacher.id, data);
    if (result.success) {
      toast.success("Dados do professor atualizados");
      router.push(`/teachers/${teacher.id}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormSection title="Informação Pessoal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-firstName">Primeiro Nome *</Label>
            <Input id="edit-firstName" {...register("firstName")} />
            {errors.firstName && (
              <p className="text-xs text-destructive">{errors.firstName.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-lastName">Apelido *</Label>
            <Input id="edit-lastName" {...register("lastName")} />
            {errors.lastName && (
              <p className="text-xs text-destructive">{errors.lastName.message}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Género</Label>
            <Select
              defaultValue={teacher.gender ?? "none"}
              onValueChange={(v) => setValue("gender", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar género" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não especificado</SelectItem>
                {Object.entries(GENDER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-dateOfBirth">Data de Nascimento</Label>
            <Input id="edit-dateOfBirth" type="date" {...register("dateOfBirth")} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Contacto">
        <div className="space-y-1.5">
          <Label htmlFor="edit-phone">Telefone</Label>
          <Input id="edit-phone" {...register("phone")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-email">E-mail</Label>
          <Input id="edit-email" type="email" {...register("email")} />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-address">Morada</Label>
          <Input id="edit-address" {...register("address")} />
        </div>
      </FormSection>

      <FormSection title="Documento de Identificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Tipo de Documento</Label>
            <Select
              defaultValue={teacher.idType ?? "none"}
              onValueChange={(v) => setValue("idType", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não especificado</SelectItem>
                {Object.entries(ID_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-idNumber">Número do Documento</Label>
            <Input id="edit-idNumber" {...register("idNumber")} />
            {errors.idNumber && (
              <p className="text-xs text-destructive">{errors.idNumber.message}</p>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection title="Informação Profissional">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-licenseNumber">Número de Licença</Label>
            <Input id="edit-licenseNumber" {...register("licenseNumber")} />
            {errors.licenseNumber && (
              <p className="text-xs text-destructive">{errors.licenseNumber.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-specialization">Especialização</Label>
            <Input id="edit-specialization" {...register("specialization")} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Organização / Filial">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {branches.length > 0 && (
            <div className="space-y-1.5">
              <Label>Filial</Label>
              <Select
                defaultValue={teacher.branch?.id ?? "none"}
                onValueChange={(v) => setValue("branchId", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar filial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem filial</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branchId && (
                <p className="text-xs text-destructive">{errors.branchId.message}</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select
              defaultValue={teacher.status}
              onValueChange={(v) =>
                setValue("status", v as NonNullable<UpdateTeacherSchema["status"]>)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEACHER_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormSection>

      <FormSection title="Conta de Utilizador">
        <div className="space-y-1.5">
          <Label>Conta Vinculada</Label>
          <Select
            defaultValue={teacher.userId ?? "none"}
            onValueChange={(v) => setValue("userId", v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sem conta vinculada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem conta vinculada</SelectItem>
              {linkableUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.userId && <p className="text-xs text-destructive">{errors.userId.message}</p>}
          <p className="text-xs text-muted-foreground">
            Permite que este professor inicie sessão e veja apenas o seu próprio perfil 360.
          </p>
        </div>
      </FormSection>

      <FormSection title="Notas">
        <div className="space-y-1.5">
          <Label htmlFor="edit-notes">Observações</Label>
          <Textarea id="edit-notes" {...register("notes")} />
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
