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
  createStudentSchema,
  updateStudentSchema,
  type CreateStudentSchema,
  type UpdateStudentSchema,
} from "@/modules/students/schemas/student.schema";
import {
  createStudentAction,
  updateStudentAction,
} from "@/modules/students/actions/student.actions";
import {
  GENDER_LABELS,
  ID_TYPE_LABELS,
  STUDENT_STATUS_LABELS,
} from "@/modules/students/types";
import type { Student, StudentBranch } from "@/modules/students/types";

// =============================================================================
// CREATE FORM
// =============================================================================

interface CreateStudentFormProps {
  branches: StudentBranch[];
}

export function CreateStudentForm({ branches }: CreateStudentFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateStudentSchema>({
    resolver: zodResolver(createStudentSchema),
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
      branchId: "",
      notes: "",
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createStudentAction(data);
    if (result.success) {
      toast.success("Aluno registado com sucesso");
      router.push(`/students/${result.data.id}`);
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
          <Input id="email" type="email" placeholder="joao@exemplo.co.mz" {...register("email")} />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Morada</Label>
          <Input id="address" placeholder="Av. Eduardo Mondlane, Maputo" {...register("address")} />
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

      {branches.length > 0 && (
        <FormSection title="Atribuição">
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
            placeholder="Informações adicionais sobre o aluno..."
            {...register("notes")}
          />
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Registar Aluno
        </Button>
      </div>
    </form>
  );
}

// =============================================================================
// EDIT FORM
// =============================================================================

interface EditStudentFormProps {
  student: Student;
  branches: StudentBranch[];
}

export function EditStudentForm({ student, branches }: EditStudentFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateStudentSchema>({
    resolver: zodResolver(updateStudentSchema),
    defaultValues: {
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender ?? "",
      dateOfBirth: student.dateOfBirth
        ? new Date(student.dateOfBirth).toISOString().split("T")[0]
        : "",
      idType: student.idType ?? "",
      idNumber: student.idNumber ?? "",
      phone: student.phone ?? "",
      email: student.email ?? "",
      address: student.address ?? "",
      branchId: student.branch?.id ?? "",
      notes: student.notes ?? "",
      status: student.status,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateStudentAction(student.id, data);
    if (result.success) {
      toast.success("Dados do aluno atualizados");
      router.push(`/students/${student.id}`);
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
              defaultValue={student.gender ?? "none"}
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
              defaultValue={student.idType ?? "none"}
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

      <FormSection title="Atribuição">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {branches.length > 0 && (
            <div className="space-y-1.5">
              <Label>Filial</Label>
              <Select
                defaultValue={student.branch?.id ?? "none"}
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
              defaultValue={student.status}
              onValueChange={(v) => setValue("status", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
