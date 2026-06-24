"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { useToast } from "@/shared/hooks/use-toast";
import {
  createNotificationTemplateAction,
  updateNotificationTemplateAction,
} from "@/modules/notifications/actions/notification-template.actions";
import { listEventCatalog, getEventCatalogEntry } from "@/modules/notifications/catalog/notification-event-catalog";
import { NOTIFICATION_CHANNEL_LABELS } from "@/modules/notifications/types";
import type { NotificationTemplate, NotificationChannel } from "@/modules/notifications/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: NotificationTemplate | null;
  onSuccess: () => void;
}

interface FormValues {
  eventType: string;
  channel: NotificationChannel;
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
}

/**
 * Keyed by template?.id in the parent so switching targets (or closing and
 * reopening for "new") fully remounts this component — initial state comes
 * straight from props, no synchronizing effect needed.
 */
function TemplateFormFields({
  template,
  onOpenChange,
  onSuccess,
}: {
  template?: NotificationTemplate | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const isEditing = !!template;
  const [eventType, setEventType] = useState(template?.eventType ?? "");

  const { register, handleSubmit, setValue, watch } = useForm<FormValues>({
    defaultValues: {
      eventType: template?.eventType ?? "",
      channel: template?.channel ?? "IN_APP",
      name: template?.name ?? "",
      titleTemplate: template?.titleTemplate ?? "",
      bodyTemplate: template?.bodyTemplate ?? "",
    },
  });

  const catalogEntry = getEventCatalogEntry(eventType);
  const channel = watch("channel");

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result =
        isEditing && template
          ? await updateNotificationTemplateAction({
              templateId: template.id,
              name: values.name,
              titleTemplate: values.titleTemplate,
              bodyTemplate: values.bodyTemplate,
            })
          : await createNotificationTemplateAction({
              eventType: values.eventType,
              channel: values.channel,
              name: values.name,
              titleTemplate: values.titleTemplate,
              bodyTemplate: values.bodyTemplate,
            });

      if (result.success) {
        toast({ title: isEditing ? "Modelo atualizado." : "Modelo criado." });
        onOpenChange(false);
        onSuccess();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label>Evento *</Label>
        <Select
          value={eventType}
          onValueChange={(v) => {
            setEventType(v);
            setValue("eventType", v);
          }}
          disabled={isEditing}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o evento" />
          </SelectTrigger>
          <SelectContent>
            {listEventCatalog().map((event) => (
              <SelectItem key={event.eventType} value={event.eventType}>
                {event.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Canal *</Label>
        <Select
          value={channel}
          onValueChange={(v) => setValue("channel", v as NotificationChannel)}
          disabled={isEditing}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o canal" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(NOTIFICATION_CHANNEL_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value} disabled={value !== "IN_APP"}>
                {label}
                {value !== "IN_APP" && " (em breve)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Nome *</Label>
        <Input {...register("name")} placeholder="Modelo padrão" />
      </div>

      <div className="space-y-1.5">
        <Label>Título *</Label>
        <Input {...register("titleTemplate")} placeholder="Pagamento confirmado" />
      </div>

      <div className="space-y-1.5">
        <Label>Mensagem *</Label>
        <Textarea {...register("bodyTemplate")} rows={4} placeholder="O pagamento {{paymentNumber}} foi confirmado." />
      </div>

      {catalogEntry && (
        <p className="text-xs text-muted-foreground">
          Variáveis permitidas para este evento:{" "}
          <span className="font-mono">
            {catalogEntry.variables.map((v) => `{{${v}}}`).join(", ")}
          </span>
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending}>
          {isEditing ? "Guardar Alterações" : "Criar Modelo"}
        </Button>
      </div>
    </form>
  );
}

export function NotificationTemplateFormSheet({ open, onOpenChange, template, onSuccess }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{template ? "Editar Modelo" : "Novo Modelo"}</SheetTitle>
        </SheetHeader>

        <TemplateFormFields
          key={template?.id ?? "new"}
          template={template}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />
      </SheetContent>
    </Sheet>
  );
}
