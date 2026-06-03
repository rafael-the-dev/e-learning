"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { FormSection } from "@/shared/components/form/form-section";
import { toast } from "@/shared/hooks/use-toast";
import {
  updateSettingsSchema,
  type UpdateSettingsSchema,
} from "@/modules/organizations/schemas/settings.schema";
import { saveSettingsAction } from "@/modules/organizations/actions/organization.actions";
import type { OrganizationSettings } from "@prisma/client";

interface SettingsFormProps {
  organizationId: string;
  settings: OrganizationSettings | null;
}

const DEFAULT_VALUES: UpdateSettingsSchema = {
  currencyCode: "MZN",
  currencySymbol: "MT",
  dateFormat: "DD/MM/YYYY",
  invoicePrefix: "INV",
  receiptPrefix: "REC",
  allowLatePayments: true,
  gracePeriodDays: 7,
};

export function SettingsForm({ organizationId, settings }: SettingsFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateSettingsSchema>({
    resolver: zodResolver(updateSettingsSchema),
    defaultValues: settings
      ? {
          currencyCode: settings.currencyCode,
          currencySymbol: settings.currencySymbol,
          dateFormat: settings.dateFormat,
          taxRate: settings.taxRate ? Number(settings.taxRate) : undefined,
          taxName: settings.taxName ?? undefined,
          invoicePrefix: settings.invoicePrefix,
          receiptPrefix: settings.receiptPrefix,
          allowLatePayments: settings.allowLatePayments,
          gracePeriodDays: settings.gracePeriodDays,
        }
      : DEFAULT_VALUES,
  });

  const allowLate = watch("allowLatePayments");

  const onSubmit = handleSubmit(async (data) => {
    const result = await saveSettingsAction(organizationId, data);
    if (result.success) {
      toast.success("Configurações guardadas");
    } else {
      toast.error(result.error);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormSection
        title="Moeda"
        description="Utilizada em todas as faturas e pagamentos."
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="currencyCode">Código de Moeda</Label>
            <Input id="currencyCode" placeholder="MZN" maxLength={3} {...register("currencyCode")} />
            {errors.currencyCode && <p className="text-xs text-destructive">{errors.currencyCode.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currencySymbol">Símbolo</Label>
            <Input id="currencySymbol" placeholder="MT" maxLength={10} {...register("currencySymbol")} />
            {errors.currencySymbol && <p className="text-xs text-destructive">{errors.currencySymbol.message}</p>}
          </div>
        </div>
      </FormSection>

      <FormSection title="Data e Formatação">
        <div className="space-y-1.5">
          <Label htmlFor="dateFormat">Formato de Data</Label>
          <Input id="dateFormat" placeholder="DD/MM/YYYY" {...register("dateFormat")} />
        </div>
      </FormSection>

      <FormSection title="Impostos">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="taxName">Nome do Imposto</Label>
            <Input id="taxName" placeholder="IVA" {...register("taxName")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="taxRate">Taxa de Imposto (%)</Label>
            <Input id="taxRate" type="number" step="0.01" min="0" max="100" placeholder="17" {...register("taxRate", { valueAsNumber: true })} />
            {errors.taxRate && <p className="text-xs text-destructive">{errors.taxRate.message}</p>}
          </div>
        </div>
      </FormSection>

      <FormSection title="Documentos">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="invoicePrefix">Prefixo de Fatura</Label>
            <Input id="invoicePrefix" placeholder="FAT" maxLength={10} {...register("invoicePrefix")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receiptPrefix">Prefixo de Recibo</Label>
            <Input id="receiptPrefix" placeholder="REC" maxLength={10} {...register("receiptPrefix")} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Pagamentos">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Permitir Pagamentos em Atraso</p>
            <p className="text-xs text-muted-foreground">Aceitar pagamentos após a data de vencimento</p>
          </div>
          <Switch
            checked={allowLate}
            onCheckedChange={(v) => setValue("allowLatePayments", v, { shouldDirty: true })}
          />
        </div>
        {allowLate && (
          <div className="space-y-1.5">
            <Label htmlFor="gracePeriodDays">Período de Tolerância (dias)</Label>
            <Input
              id="gracePeriodDays"
              type="number"
              min={0}
              max={365}
              {...register("gracePeriodDays", { valueAsNumber: true })}
            />
            {errors.gracePeriodDays && (
              <p className="text-xs text-destructive">{errors.gracePeriodDays.message}</p>
            )}
          </div>
        )}
      </FormSection>

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Guardar Configurações
        </Button>
      </div>
    </form>
  );
}
