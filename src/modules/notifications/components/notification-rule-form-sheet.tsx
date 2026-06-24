"use client";

import { useState, useTransition } from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { useToast } from "@/shared/hooks/use-toast";
import { updateNotificationEventRuleAction } from "@/modules/notifications/actions/notification-event-rule.actions";
import { getEventCatalogEntry } from "@/modules/notifications/catalog/notification-event-catalog";
import { NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_RULE_PRIORITY_LABELS } from "@/modules/notifications/types";
import type { NotificationEventRule, NotificationChannel, NotificationRulePriority } from "@/modules/notifications/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: NotificationEventRule | null;
  onSuccess: () => void;
}

/** Keyed by rule.id in the parent so switching the edit target remounts with fresh initial state — no synchronizing effect needed. */
function RuleFormFields({
  rule,
  onOpenChange,
  onSuccess,
}: {
  rule: NotificationEventRule;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [enabled, setEnabled] = useState(rule.enabled);
  const [channels, setChannels] = useState<NotificationChannel[]>(rule.channels);
  const [dedupeWindowMinutes, setDedupeWindowMinutes] = useState(rule.dedupeWindowMinutes);
  const [delayMinutes, setDelayMinutes] = useState(rule.delayMinutes);
  const [priority, setPriority] = useState<NotificationRulePriority>(rule.priority);

  function toggleChannel(channel: NotificationChannel, checked: boolean) {
    setChannels((prev) => (checked ? [...new Set([...prev, channel])] : prev.filter((c) => c !== channel)));
  }

  function onSubmit() {
    startTransition(async () => {
      const result = await updateNotificationEventRuleAction({
        ruleId: rule.id,
        enabled,
        channels,
        dedupeWindowMinutes,
        delayMinutes,
        priority,
      });

      if (result.success) {
        toast({ title: "Regra atualizada." });
        onOpenChange(false);
        onSuccess();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Evento ativo</p>
          <p className="text-xs text-muted-foreground">Quando desligado, nenhuma notificação é criada para este evento.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-2">
        <Label>Canais</Label>
        <div className="space-y-2">
          {Object.entries(NOTIFICATION_CHANNEL_LABELS).map(([value, label]) => {
            const isAvailable = value === "IN_APP" || value === "EMAIL";
            return (
              <div key={value} className="flex items-center gap-2">
                <Checkbox
                  checked={channels.includes(value as NotificationChannel)}
                  disabled={!isAvailable}
                  onCheckedChange={(checked) => toggleChannel(value as NotificationChannel, checked === true)}
                />
                <Label className="text-sm font-normal">
                  {label}
                  {!isAvailable && <span className="text-muted-foreground"> (em breve)</span>}
                </Label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Janela de deduplicação (minutos)</Label>
        <Input
          type="number"
          min={0}
          max={43200}
          value={dedupeWindowMinutes}
          onChange={(e) => setDedupeWindowMinutes(Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          Notificações repetidas para o mesmo evento e destinatário dentro desta janela são ignoradas. Máximo: 43200 minutos (30 dias).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Atraso (minutos)</Label>
        <Input
          type="number"
          min={0}
          max={43200}
          value={delayMinutes}
          onChange={(e) => setDelayMinutes(Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          Reservado para um futuro despachante — ainda não tem efeito (a notificação é criada de imediato).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Prioridade</Label>
        <Select value={priority} onValueChange={(v) => setPriority(v as NotificationRulePriority)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(NOTIFICATION_RULE_PRIORITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="button" loading={pending} onClick={onSubmit}>
          Guardar Alterações
        </Button>
      </div>
    </div>
  );
}

export function NotificationRuleFormSheet({ open, onOpenChange, rule, onSuccess }: Props) {
  if (!rule) return null;
  const catalogEntry = getEventCatalogEntry(rule.eventType);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{catalogEntry?.label ?? rule.eventType}</SheetTitle>
        </SheetHeader>

        <RuleFormFields key={rule.id} rule={rule} onOpenChange={onOpenChange} onSuccess={onSuccess} />
      </SheetContent>
    </Sheet>
  );
}
