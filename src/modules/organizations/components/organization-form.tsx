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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { FormSection } from "@/shared/components/form/form-section";
import { slugify } from "@/shared/lib/utils";
import { toast } from "@/shared/hooks/use-toast";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationSchema,
  type UpdateOrganizationSchema,
} from "@/modules/organizations/schemas/organization.schema";
import {
  createOrganizationAction,
  updateOrganizationAction,
} from "@/modules/organizations/actions/organization.actions";
import type { Organization } from "@prisma/client";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Africa/Maputo", label: "Africa/Maputo (CAT)" },
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg (SAST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "America/New_York", label: "America/New_York (EST)" },
];

// =============================================================================
// CREATE FORM
// =============================================================================

interface CreateOrganizationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (org: Organization) => void;
}

export function CreateOrganizationForm({
  open,
  onOpenChange,
  onSuccess,
}: CreateOrganizationFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationSchema>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { timezone: "UTC", locale: "en" },
  });

  const nameValue = watch("name");

  React.useEffect(() => {
    if (nameValue) setValue("slug", slugify(nameValue));
  }, [nameValue, setValue]);

  const onSubmit = handleSubmit(async (data) => {
    const result = await createOrganizationAction(data);
    if (result.success) {
      toast.success("Organização criada");
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
          <SheetTitle>Criar Organização</SheetTitle>
          <SheetDescription>
            Adicionar uma nova escola ou centro de formação à plataforma.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <SheetBody className="flex-1">
            <FormSection title="Informação Básica">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome da Organização *</Label>
                <Input id="name" placeholder="Escola de Condução Central" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug *</Label>
                <Input id="slug" placeholder="escola-conducao-central" {...register("slug")} />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
                <p className="text-xs text-muted-foreground">Utilizado nos URLs. Gerado automaticamente a partir do nome.</p>
              </div>
            </FormSection>

            <FormSection title="Contacto">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" placeholder="contacto@escola.co.mz" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" placeholder="+258 84 000 0000" {...register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Morada</Label>
                <Input id="address" placeholder="Av. Karl Marx, 1234, Maputo" {...register("address")} />
              </div>
            </FormSection>

            <FormSection title="Localidade">
              <div className="space-y-1.5">
                <Label>Fuso Horário</Label>
                <Select
                  defaultValue="UTC"
                  onValueChange={(v) => setValue("timezone", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar fuso horário" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FormSection>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Criar Organização
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// EDIT FORM
// =============================================================================

interface EditOrganizationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization;
  onSuccess?: (org: Organization) => void;
}

export function EditOrganizationForm({
  open,
  onOpenChange,
  organization,
  onSuccess,
}: EditOrganizationFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateOrganizationSchema>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      name: organization.name,
      email: organization.email ?? "",
      phone: organization.phone ?? "",
      address: organization.address ?? "",
      timezone: organization.timezone,
      locale: organization.locale,
    },
  });

  React.useEffect(() => {
    reset({
      name: organization.name,
      email: organization.email ?? "",
      phone: organization.phone ?? "",
      address: organization.address ?? "",
      timezone: organization.timezone,
      locale: organization.locale,
    });
  }, [organization, reset]);

  const onSubmit = handleSubmit(async (data) => {
    const result = await updateOrganizationAction(organization.id, data);
    if (result.success) {
      toast.success("Organização atualizada");
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
          <SheetTitle>Editar Organização</SheetTitle>
          <SheetDescription>{organization.name}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <SheetBody className="flex-1">
            <FormSection title="Informação Básica">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Nome *</Label>
                <Input id="edit-name" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
            </FormSection>
            <FormSection title="Contacto">
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">E-mail</Label>
                <Input id="edit-email" type="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Telefone</Label>
                <Input id="edit-phone" {...register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-address">Morada</Label>
                <Input id="edit-address" {...register("address")} />
              </div>
            </FormSection>
            <FormSection title="Localidade">
              <div className="space-y-1.5">
                <Label>Fuso Horário</Label>
                <Select
                  defaultValue={organization.timezone}
                  onValueChange={(v) => setValue("timezone", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FormSection>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Guardar Alterações
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
