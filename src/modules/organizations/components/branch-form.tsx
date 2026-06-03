"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from "@/shared/components/ui/sheet";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { FormSection } from "@/shared/components/form/form-section";
import { toast } from "@/shared/hooks/use-toast";
import {
  createBranchSchema,
  updateBranchSchema,
  type CreateBranchSchema,
  type UpdateBranchSchema,
} from "@/modules/organizations/schemas/branch.schema";
import {
  createBranchAction,
  updateBranchAction,
} from "@/modules/organizations/actions/branch.actions";
import type { Branch } from "@prisma/client";

// =============================================================================
// CREATE BRANCH
// =============================================================================

interface CreateBranchFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onSuccess?: (branch: Branch) => void;
}

export function CreateBranchForm({
  open,
  onOpenChange,
  organizationId,
  onSuccess,
}: CreateBranchFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateBranchSchema>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: { isDefault: false },
  });

  const isDefault = watch("isDefault");

  const onSubmit = handleSubmit(async (data) => {
    const result = await createBranchAction(organizationId, data);
    if (result.success) {
      toast.success("Filial criada");
      reset();
      onOpenChange(false);
      onSuccess?.(result.data);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Adicionar Filial</SheetTitle>
          <SheetDescription>Criar uma nova filial para esta organização.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <SheetBody className="flex-1">
            <FormSection title="Detalhes da Filial">
              <div className="space-y-1.5">
                <Label htmlFor="b-name">Nome *</Label>
                <Input id="b-name" placeholder="Filial Central" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-code">Código</Label>
                <Input id="b-code" placeholder="FC01" {...register("code")} />
              </div>
            </FormSection>
            <FormSection title="Contacto">
              <div className="space-y-1.5">
                <Label htmlFor="b-email">E-mail</Label>
                <Input id="b-email" type="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-phone">Telefone</Label>
                <Input id="b-phone" {...register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-address">Morada</Label>
                <Input id="b-address" {...register("address")} />
              </div>
            </FormSection>
            <FormSection title="Configurações">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Filial Principal</p>
                  <p className="text-xs text-muted-foreground">Definir como filial principal</p>
                </div>
                <Switch
                  checked={isDefault}
                  onCheckedChange={(v) => setValue("isDefault", v)}
                />
              </div>
            </FormSection>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting}>Criar Filial</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// EDIT BRANCH
// =============================================================================

interface EditBranchFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  branch: Branch;
  onSuccess?: (branch: Branch) => void;
}

export function EditBranchForm({
  open,
  onOpenChange,
  organizationId,
  branch,
  onSuccess,
}: EditBranchFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateBranchSchema>({
    resolver: zodResolver(updateBranchSchema),
    defaultValues: {
      name: branch.name,
      code: branch.code ?? "",
      email: branch.email ?? "",
      phone: branch.phone ?? "",
      address: branch.address ?? "",
      isDefault: branch.isDefault,
    },
  });

  const isDefault = watch("isDefault");

  React.useEffect(() => {
    reset({
      name: branch.name,
      code: branch.code ?? "",
      email: branch.email ?? "",
      phone: branch.phone ?? "",
      address: branch.address ?? "",
      isDefault: branch.isDefault,
    });
  }, [branch, reset]);

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateBranchAction(organizationId, branch.id, data);
    if (result.success) {
      toast.success("Filial atualizada");
      onOpenChange(false);
      onSuccess?.(result.data);
    } else {
      toast.error(result.error);
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Editar Filial</SheetTitle>
          <SheetDescription>{branch.name}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <SheetBody className="flex-1">
            <FormSection title="Detalhes da Filial">
              <div className="space-y-1.5">
                <Label htmlFor="eb-name">Nome *</Label>
                <Input id="eb-name" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eb-code">Código</Label>
                <Input id="eb-code" {...register("code")} />
              </div>
            </FormSection>
            <FormSection title="Contacto">
              <div className="space-y-1.5">
                <Label htmlFor="eb-email">E-mail</Label>
                <Input id="eb-email" type="email" {...register("email")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eb-phone">Telefone</Label>
                <Input id="eb-phone" {...register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eb-address">Morada</Label>
                <Input id="eb-address" {...register("address")} />
              </div>
            </FormSection>
            <FormSection title="Configurações">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Filial Principal</p>
                  <p className="text-xs text-muted-foreground">Definir como filial principal</p>
                </div>
                <Switch
                  checked={isDefault ?? false}
                  onCheckedChange={(v) => setValue("isDefault", v)}
                  disabled={branch.isDefault}
                />
              </div>
            </FormSection>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting}>Guardar Alterações</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
