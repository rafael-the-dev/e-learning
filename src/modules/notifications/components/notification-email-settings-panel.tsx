"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import { StatusBadge } from "@/shared/components/data/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import {
  upsertNotificationEmailSettingsAction,
  enableNotificationEmailSettingsAction,
  disableNotificationEmailSettingsAction,
  testNotificationEmailSettingsAction,
} from "@/modules/notifications/actions/notification-email-settings.actions";
import {
  NOTIFICATION_EMAIL_PROVIDER_TYPE_LABELS,
} from "@/modules/notifications/types";
import type { NotificationEmailProviderType, NotificationEmailSettings } from "@/modules/notifications/types";

interface Props {
  settings: NotificationEmailSettings | null;
}

interface FormValues {
  providerType: NotificationEmailProviderType;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpSecure: boolean;
}

export function NotificationEmailSettingsPanel({ settings }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [togglePending, startToggleTransition] = useTransition();
  const [testPending, startTestTransition] = useTransition();
  const [recipientEmail, setRecipientEmail] = useState("");

  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      providerType: settings?.providerType ?? "SMTP",
      fromName: settings?.fromName ?? "",
      fromEmail: settings?.fromEmail ?? "",
      replyTo: settings?.replyTo ?? "",
      smtpHost: settings?.smtpHost ?? "",
      smtpPort: settings?.smtpPort ? String(settings.smtpPort) : "",
      smtpUsername: settings?.smtpUsername ?? "",
      smtpPassword: "",
      smtpSecure: settings?.smtpSecure ?? true,
    },
  });

  const providerType = watch("providerType");
  const smtpSecure = watch("smtpSecure");

  function buildDraft(values: FormValues) {
    return {
      providerType: values.providerType,
      fromName: values.fromName,
      fromEmail: values.fromEmail,
      replyTo: values.replyTo || undefined,
      smtpHost: values.smtpHost || undefined,
      smtpPort: values.smtpPort ? Number(values.smtpPort) : undefined,
      smtpUsername: values.smtpUsername || undefined,
      smtpPassword: values.smtpPassword || undefined,
      smtpSecure: values.smtpSecure,
    };
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await upsertNotificationEmailSettingsAction(buildDraft(values));
      if (result.success) {
        toast({ title: "Definições de email guardadas." });
        setValue("smtpPassword", "");
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  function handleToggleEnabled(checked: boolean) {
    startToggleTransition(async () => {
      const result = checked
        ? await enableNotificationEmailSettingsAction()
        : await disableNotificationEmailSettingsAction();
      if (result.success) {
        toast({ title: checked ? "Email ativado." : "Email desativado." });
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  function handleSendTest() {
    if (!recipientEmail) {
      toast({ title: "Indique um destinatário para o email de teste.", variant: "destructive" });
      return;
    }
    startTestTransition(async () => {
      const result = await testNotificationEmailSettingsAction({ ...buildDraft(watch()), recipientEmail });
      if (result.success && result.data?.success) {
        toast({ title: "Email de teste enviado com sucesso." });
      } else {
        toast({
          title: result.success ? result.data?.errorMessage ?? "Falha ao enviar o email de teste." : result.error,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Email ativo</p>
          <p className="text-xs text-muted-foreground">
            Quando desligado, as entregas por email falham com &quot;Fornecedor não configurado&quot;.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {settings?.lastTestStatus && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Último teste:
              <StatusBadge status={settings.lastTestStatus} />
            </div>
          )}
          <Switch
            checked={settings?.isEnabled ?? false}
            disabled={!settings || togglePending}
            onCheckedChange={handleToggleEnabled}
          />
        </div>
      </div>

      {settings?.lastTestError && (
        <p className="text-xs text-destructive">Erro do último teste: {settings.lastTestError}</p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Fornecedor</Label>
          <Select value={providerType} onValueChange={(v) => setValue("providerType", v as NotificationEmailProviderType)}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(NOTIFICATION_EMAIL_PROVIDER_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value} disabled={value !== "SMTP"}>
                  {label}
                  {value !== "SMTP" && " (em breve)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nome do remetente *</Label>
            <Input {...register("fromName")} placeholder="Secretaria" />
          </div>
          <div className="space-y-1.5">
            <Label>Email do remetente *</Label>
            <Input {...register("fromEmail")} type="email" placeholder="secretaria@escola.pt" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Responder para</Label>
          <Input {...register("replyTo")} type="email" placeholder="suporte@escola.pt" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Servidor SMTP *</Label>
            <Input {...register("smtpHost")} placeholder="smtp.exemplo.pt" />
          </div>
          <div className="space-y-1.5">
            <Label>Porta SMTP *</Label>
            <Input {...register("smtpPort")} type="number" placeholder="587" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Utilizador SMTP *</Label>
            <Input {...register("smtpUsername")} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label>Palavra-passe SMTP</Label>
            <Input {...register("smtpPassword")} type="password" autoComplete="new-password" placeholder="••••••••" />
            <p className="text-xs text-muted-foreground">Deixe em branco para manter a palavra-passe atual.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={smtpSecure} onCheckedChange={(v) => setValue("smtpSecure", v)} />
          <Label className="text-sm font-normal">Ligação segura (TLS/SSL)</Label>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={pending}>Guardar Alterações</Button>
        </div>
      </form>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label>Enviar email de teste</Label>
          {settings?.isEnabled && <Badge variant="outline">Ativo</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="email"
            className="w-64"
            placeholder="destinatario@exemplo.pt"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
          />
          <Button type="button" variant="secondary" loading={testPending} onClick={handleSendTest}>
            Enviar Teste
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O teste usa os valores acima (mesmo que ainda não guardados) e não cria notificações nem entregas.
        </p>
      </div>
    </div>
  );
}
