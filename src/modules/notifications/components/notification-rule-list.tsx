"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import { useToast } from "@/shared/hooks/use-toast";
import { updateNotificationEventRuleAction } from "@/modules/notifications/actions/notification-event-rule.actions";
import { NotificationRuleFormSheet } from "@/modules/notifications/components/notification-rule-form-sheet";
import { getEventCatalogEntry } from "@/modules/notifications/catalog/notification-event-catalog";
import { NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_RULE_PRIORITY_LABELS } from "@/modules/notifications/types";
import type { NotificationEventRule, NotificationRulePriority } from "@/modules/notifications/types";

interface Props {
  rules: NotificationEventRule[];
}

const PRIORITY_BADGE_VARIANT: Record<NotificationRulePriority, "secondary" | "info" | "warning" | "destructive"> = {
  LOW: "secondary",
  NORMAL: "info",
  HIGH: "warning",
  CRITICAL: "destructive",
};

export function NotificationRuleList({ rules }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [editTarget, setEditTarget] = useState<NotificationEventRule | null>(null);

  function handleToggleEnabled(rule: NotificationEventRule, enabled: boolean) {
    startTransition(async () => {
      const result = await updateNotificationEventRuleAction({ ruleId: rule.id, enabled });
      if (result.success) {
        toast({ title: enabled ? "Evento ativado." : "Evento desativado." });
        router.refresh();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-2">
      {rules.map((rule) => {
        const catalogEntry = getEventCatalogEntry(rule.eventType);
        return (
          <div key={rule.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <Switch checked={rule.enabled} onCheckedChange={(checked) => handleToggleEnabled(rule, checked)} />

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{catalogEntry?.label ?? rule.eventType}</p>
                <Badge variant={PRIORITY_BADGE_VARIANT[rule.priority]} className="text-[10px]">
                  {NOTIFICATION_RULE_PRIORITY_LABELS[rule.priority]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {rule.channels.map((c) => NOTIFICATION_CHANNEL_LABELS[c]).join(", ")} · Dedupe {rule.dedupeWindowMinutes} min
                {rule.delayMinutes > 0 && ` · Atraso ${rule.delayMinutes} min`}
              </p>
            </div>

            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setEditTarget(rule)}>
              <Pencil className="size-4" />
            </Button>
          </div>
        );
      })}

      <NotificationRuleFormSheet
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        rule={editTarget}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
