"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { useToast } from "@/shared/hooks/use-toast";
import {
  createOrganizationRoleAction,
  updateOrganizationRoleAction,
} from "@/modules/roles/actions/role.actions";

interface EditableRole {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: EditableRole | null;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
  code: string;
  description: string;
}

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function slugifyCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function RoleFormSheet({ open, onOpenChange, role, onSuccess }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const isEditing = !!role;

  const { register, handleSubmit, setValue, reset, formState } = useForm<FormValues>({
    defaultValues: { name: "", code: "", description: "" },
  });

  useEffect(() => {
    if (role) {
      reset({ name: role.name, code: role.code ?? "", description: role.description ?? "" });
    } else {
      reset({ name: "", code: "", description: "" });
    }
  }, [role, reset]);

  function handleNameChange(value: string) {
    setValue("name", value);
    if (!isEditing && !formState.touchedFields.code) {
      setValue("code", slugifyCode(value));
    }
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result =
        isEditing && role
          ? await updateOrganizationRoleAction(role.id, {
              name: values.name,
              description: values.description || undefined,
            })
          : await createOrganizationRoleAction({
              name: values.name,
              code: values.code,
              description: values.description || undefined,
            });

      if (result.success) {
        toast({ title: isEditing ? "Role atualizada." : "Role criada." });
        onOpenChange(false);
        onSuccess();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar Role" : "Nova Role"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input
              {...register("name")}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Recepcionista"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Código *</Label>
            <Input
              {...register("code")}
              onChange={(e) => setValue("code", slugifyCode(e.target.value))}
              disabled={isEditing}
              placeholder="RECEPCIONISTA"
              className="font-mono"
            />
            {!isEditing && (
              <p className="text-xs text-muted-foreground">
                Identificador único, gerado automaticamente a partir do nome. Não pode ser alterado depois de criado.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea {...register("description")} rows={3} placeholder="Descrição opcional..." />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              {isEditing ? "Guardar Alterações" : "Criar Role"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
