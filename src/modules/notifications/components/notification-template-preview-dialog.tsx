"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { previewNotificationTemplateAction } from "@/modules/notifications/actions/notification-template.actions";
import { getEventCatalogEntry } from "@/modules/notifications/catalog/notification-event-catalog";
import type { NotificationTemplate } from "@/modules/notifications/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: NotificationTemplate | null;
}

const PREVIEW_DEBOUNCE_MS = 400;

export function NotificationTemplatePreviewDialog({ open, onOpenChange, template }: Props) {
  const catalogEntry = template ? getEventCatalogEntry(template.eventType) : undefined;
  const initialVariables = (catalogEntry?.sampleVariables as Record<string, string>) ?? {};

  // draftVariables update the inputs immediately; queryVariables (debounced)
  // drive the server action call, so typing doesn't fire a request per keystroke.
  const [draftVariables, setDraftVariables] = useState<Record<string, string>>(initialVariables);
  const [queryVariables, setQueryVariables] = useState<Record<string, string>>(initialVariables);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleVariableChange(name: string, value: string) {
    setDraftVariables((prev) => ({ ...prev, [name]: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQueryVariables((prev) => ({ ...prev, [name]: value }));
    }, PREVIEW_DEBOUNCE_MS);
  }

  const { data: preview, isFetching } = useQuery({
    queryKey: ["notification-template-preview", template?.id, queryVariables],
    queryFn: async () => {
      const result = await previewNotificationTemplateAction(template!.id, queryVariables);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: open && !!template,
  });

  if (!template) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && catalogEntry) {
          const vars = catalogEntry.sampleVariables as Record<string, string>;
          setDraftVariables(vars);
          setQueryVariables(vars);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pré-visualização — {template.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {catalogEntry && Object.keys(draftVariables).length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Variáveis de exemplo</Label>
              {Object.entries(draftVariables).map(([name, value]) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-xs font-mono w-32 shrink-0">{`{{${name}}}`}</span>
                  <Input
                    value={value}
                    onChange={(e) => handleVariableChange(name, e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border p-4 space-y-2 bg-accent/30">
            {isFetching ? (
              <p className="text-sm text-muted-foreground">A gerar pré-visualização...</p>
            ) : preview ? (
              <>
                <p className="text-sm font-semibold">{preview.title}</p>
                <p className="text-sm">{preview.body}</p>
                {preview.missingVariables.length > 0 && (
                  <Badge variant="warning" className="text-[10px]">
                    Variáveis em falta: {preview.missingVariables.join(", ")}
                  </Badge>
                )}
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
