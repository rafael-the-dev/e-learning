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
import { toast } from "@/shared/hooks/use-toast";
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserSchema,
  type UpdateUserSchema,
} from "@/modules/users/schemas/user.schema";
import {
  createOrgUserAction,
  updateOrgUserAction,
  assignUserRoleAction,
} from "@/modules/users/actions/user.actions";
import { ROLE_LABELS } from "@/modules/users/types";
import type { OrgUser, AssignableRole } from "@/modules/users/types";

// =============================================================================
// CREATE FORM
// =============================================================================

interface CreateUserFormProps {
  roles: AssignableRole[];
}

export function CreateUserForm({ roles }: CreateUserFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserSchema>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", phone: "", password: "", roleId: "" },
  });

  const onSubmit = handleSubmit(async (data) => {
    const result = await createOrgUserAction(data);
    if (result.success) {
      toast.success("Utilizador criado com sucesso");
      router.push("/users");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormSection title="Informação Pessoal">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome completo *</Label>
          <Input id="name" placeholder="João Silva" {...register("name")} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail *</Label>
          <Input
            id="email"
            type="email"
            placeholder="joao@escola.co.mz"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" placeholder="+258 84 000 0000" {...register("phone")} />
        </div>
      </FormSection>

      <FormSection title="Acesso">
        <div className="space-y-1.5">
          <Label>Papel *</Label>
          <Select onValueChange={(v) => setValue("roleId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar papel" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {ROLE_LABELS[r.name] ?? r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.roleId && (
            <p className="text-xs text-destructive">{errors.roleId.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Palavra-passe temporária *</Label>
          <Input
            id="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            O utilizador deverá alterar a palavra-passe no primeiro acesso.
            {/* TODO: substituir por fluxo de convite por e-mail */}
          </p>
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Criar Utilizador
        </Button>
      </div>
    </form>
  );
}

// =============================================================================
// EDIT FORM
// =============================================================================

interface EditUserFormProps {
  user: OrgUser;
  roles: AssignableRole[];
}

export function EditUserForm({ user, roles }: EditUserFormProps) {
  const router = useRouter();
  const currentRoleId = user.roles[0]?.id ?? "";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateUserSchema>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { name: user.name, phone: user.phone ?? "" },
  });

  const [selectedRoleId, setSelectedRoleId] = React.useState(currentRoleId);

  const onSubmit = handleSubmit(async (data) => {
    const [updateResult, roleResult] = await Promise.all([
      updateOrgUserAction(user.id, data),
      selectedRoleId && selectedRoleId !== currentRoleId
        ? assignUserRoleAction(user.id, selectedRoleId)
        : Promise.resolve({ success: true as const, data: undefined }),
    ]);

    if (!updateResult.success) {
      toast.error(updateResult.error);
      return;
    }
    if (!roleResult.success) {
      toast.error(roleResult.error);
      return;
    }

    toast.success("Utilizador atualizado");
    router.push(`/users/${user.id}`);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormSection title="Informação Pessoal">
        <div className="space-y-1.5">
          <Label htmlFor="edit-name">Nome completo *</Label>
          <Input id="edit-name" {...register("name")} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-email">E-mail</Label>
          <Input
            id="edit-email"
            type="email"
            value={user.email}
            disabled
            className="opacity-60"
          />
          <p className="text-xs text-muted-foreground">
            O e-mail não pode ser alterado por razões de segurança.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-phone">Telefone</Label>
          <Input id="edit-phone" {...register("phone")} />
        </div>
      </FormSection>

      <FormSection title="Acesso">
        <div className="space-y-1.5">
          <Label>Papel</Label>
          <Select
            value={selectedRoleId}
            onValueChange={setSelectedRoleId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar papel" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {ROLE_LABELS[r.name] ?? r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3 pt-2">
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
