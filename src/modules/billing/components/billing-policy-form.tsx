"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { Separator } from "@/shared/components/ui/separator";
import { useToast } from "@/shared/hooks/use-toast";
import { createBillingPolicyAction, updateBillingPolicyAction } from "@/modules/billing/actions/billing-policy.actions";
import { INVOICE_MODE_LABELS, ACTIVATION_RULE_LABELS } from "@/modules/billing/types";
import type { EnrollmentBillingPolicy } from "@/modules/billing/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: EnrollmentBillingPolicy | null;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
  description: string;
  autoGenerateInvoiceOnEnrollment: boolean;
  invoiceMode: string;
  activationRule: string;
  installmentsRequired: boolean;
  defaultNumberOfInstallments: string;
  minimumFirstPaymentAmount: string;
  allowWalletCreditOnEnrollment: boolean;
  isDefault: boolean;
}

export function BillingPolicyForm({ open, onOpenChange, policy, onSuccess }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const isEditing = !!policy;

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormValues>({
    defaultValues: {
      name: "",
      description: "",
      autoGenerateInvoiceOnEnrollment: true,
      invoiceMode: "SINGLE_INVOICE",
      activationRule: "MANUAL",
      installmentsRequired: false,
      defaultNumberOfInstallments: "",
      minimumFirstPaymentAmount: "",
      allowWalletCreditOnEnrollment: true,
      isDefault: false,
    },
  });

  useEffect(() => {
    if (policy) {
      reset({
        name: policy.name,
        description: policy.description ?? "",
        autoGenerateInvoiceOnEnrollment: policy.autoGenerateInvoiceOnEnrollment,
        invoiceMode: policy.invoiceMode,
        activationRule: policy.activationRule,
        installmentsRequired: policy.installmentsRequired,
        defaultNumberOfInstallments: policy.defaultNumberOfInstallments ? String(policy.defaultNumberOfInstallments) : "",
        minimumFirstPaymentAmount: policy.minimumFirstPaymentAmount ? String(policy.minimumFirstPaymentAmount) : "",
        allowWalletCreditOnEnrollment: policy.allowWalletCreditOnEnrollment,
        isDefault: policy.isDefault,
      });
    } else {
      reset({ name: "", description: "", autoGenerateInvoiceOnEnrollment: true, invoiceMode: "SINGLE_INVOICE", activationRule: "MANUAL", installmentsRequired: false, defaultNumberOfInstallments: "", minimumFirstPaymentAmount: "", allowWalletCreditOnEnrollment: true, isDefault: false });
    }
  }, [policy, reset]);

  const autoGen = watch("autoGenerateInvoiceOnEnrollment");
  const installmentsRequired = watch("installmentsRequired");

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const payload = {
        name: values.name,
        description: values.description || undefined,
        autoGenerateInvoiceOnEnrollment: values.autoGenerateInvoiceOnEnrollment,
        invoiceMode: values.invoiceMode as "MANUAL" | "SINGLE_INVOICE" | "INSTALLMENT_INVOICES",
        activationRule: values.activationRule as "MANUAL" | "AFTER_INVOICE_CREATED" | "AFTER_REGISTRATION_FEE" | "AFTER_FIRST_PAYMENT" | "AFTER_FULL_PAYMENT",
        installmentsRequired: values.installmentsRequired,
        defaultNumberOfInstallments: values.defaultNumberOfInstallments ? parseInt(values.defaultNumberOfInstallments) : null,
        minimumFirstPaymentAmount: values.minimumFirstPaymentAmount ? parseFloat(values.minimumFirstPaymentAmount) : null,
        allowWalletCreditOnEnrollment: values.allowWalletCreditOnEnrollment,
        isDefault: values.isDefault,
      };

      const result = isEditing
        ? await updateBillingPolicyAction({ policyId: policy!.id, ...payload })
        : await createBillingPolicyAction(payload);

      if (result.success) {
        toast({ title: isEditing ? "Política atualizada." : "Política criada." });
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
          <SheetTitle>{isEditing ? "Editar Política" : "Nova Política de Faturação"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input {...register("name")} placeholder="Política Padrão" />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea {...register("description")} rows={2} placeholder="Descrição opcional..." />
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label>Modo de Faturação</Label>
            <Select defaultValue="SINGLE_INVOICE" onValueChange={(v) => setValue("invoiceMode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(INVOICE_MODE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Regra de Ativação da Matrícula</Label>
            <Select defaultValue="MANUAL" onValueChange={(v) => setValue("activationRule", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ACTIVATION_RULE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch checked={autoGen} onCheckedChange={(v) => setValue("autoGenerateInvoiceOnEnrollment", v)} id="autoGen" />
              <Label htmlFor="autoGen">Gerar fatura automaticamente na matrícula</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={installmentsRequired} onCheckedChange={(v) => setValue("installmentsRequired", v)} id="installments" />
              <Label htmlFor="installments">Requer plano de prestações</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={watch("allowWalletCreditOnEnrollment")} onCheckedChange={(v) => setValue("allowWalletCreditOnEnrollment", v)} id="wallet" />
              <Label htmlFor="wallet">Permitir crédito de carteira na matrícula</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={watch("isDefault")} onCheckedChange={(v) => setValue("isDefault", v)} id="isDefault" />
              <Label htmlFor="isDefault">Definir como política padrão</Label>
            </div>
          </div>

          {installmentsRequired && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nº de Prestações *</Label>
                <Input {...register("defaultNumberOfInstallments")} type="number" min="2" max="60" placeholder="12" />
              </div>
              <div className="space-y-1.5">
                <Label>Valor Mínimo 1ª Prestação</Label>
                <Input {...register("minimumFirstPaymentAmount")} type="number" step="0.01" min="0" placeholder="0.00" />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={pending}>{isEditing ? "Guardar Alterações" : "Criar Política"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
