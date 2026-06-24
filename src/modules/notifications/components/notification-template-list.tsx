"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Pencil, Eye, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { useToast } from "@/shared/hooks/use-toast";
import {
  activateNotificationTemplateAction,
  deactivateNotificationTemplateAction,
} from "@/modules/notifications/actions/notification-template.actions";
import { NotificationTemplateFormSheet } from "@/modules/notifications/components/notification-template-form-sheet";
import { NotificationTemplatePreviewDialog } from "@/modules/notifications/components/notification-template-preview-dialog";
import { getEventCatalogEntry } from "@/modules/notifications/catalog/notification-event-catalog";
import { NOTIFICATION_CHANNEL_LABELS } from "@/modules/notifications/types";
import type { NotificationTemplate } from "@/modules/notifications/types";

interface Props {
  templates: NotificationTemplate[];
}

export function NotificationTemplateList({ templates }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [formTarget, setFormTarget] = useState<NotificationTemplate | null | "new">(null);
  const [previewTarget, setPreviewTarget] = useState<NotificationTemplate | null>(null);

  function handleToggleActive(template: NotificationTemplate) {
    startTransition(async () => {
      const result = template.isActive
        ? await deactivateNotificationTemplateAction(template.id)
        : await activateNotificationTemplateAction(template.id);

      if (result.success) {
        toast({ title: template.isActive ? "Modelo desativado." : "Modelo ativado." });
        router.refresh();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setFormTarget("new")}>
          <Plus className="size-4" />
          Novo Modelo
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState title="Nenhum modelo encontrado." description="Crie um modelo para um evento da lista." />
      ) : (
        <div className="space-y-2">
          {templates.map((template) => {
            const catalogEntry = getEventCatalogEntry(template.eventType);
            return (
              <div key={template.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{template.name}</p>
                    <Badge variant={template.isActive ? "success" : "secondary"} className="text-[10px]">
                      {template.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {NOTIFICATION_CHANNEL_LABELS[template.channel]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {catalogEntry?.label ?? template.eventType} · {template.titleTemplate}
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8 shrink-0">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setFormTarget(template)}>
                      <Pencil className="size-3.5" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPreviewTarget(template)}>
                      <Eye className="size-3.5" />
                      Pré-visualizar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleToggleActive(template)}>
                      {template.isActive ? (
                        <>
                          <XCircle className="size-3.5" />
                          Desativar
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-3.5" />
                          Ativar
                        </>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <NotificationTemplateFormSheet
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
        template={formTarget === "new" ? null : formTarget}
        onSuccess={() => router.refresh()}
      />

      <NotificationTemplatePreviewDialog
        open={previewTarget !== null}
        onOpenChange={(open) => !open && setPreviewTarget(null)}
        template={previewTarget}
      />
    </div>
  );
}
