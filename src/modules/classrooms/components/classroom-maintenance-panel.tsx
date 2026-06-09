"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { toast } from "@/shared/hooks/use-toast";
import {
  createClassroomMaintenanceAction,
  cancelClassroomMaintenanceAction,
} from "@/modules/classrooms/actions/classroom-maintenance.actions";
import { createClassroomMaintenanceSchema, type CreateClassroomMaintenanceSchema } from "@/modules/classrooms/schemas/classroom-maintenance.schema";
import { CLASSROOM_MAINTENANCE_STATUS_LABELS, type ClassroomMaintenance } from "@/modules/classrooms/types";
import { Plus, XCircle } from "lucide-react";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SCHEDULED: "secondary",
  IN_PROGRESS: "default",
  COMPLETED: "outline",
  CANCELLED: "outline",
};

interface ClassroomMaintenancePanelProps {
  classroomId: string;
  maintenances: ClassroomMaintenance[];
  canCreate: boolean;
  canCancel: boolean;
}

export function ClassroomMaintenancePanel({
  classroomId,
  maintenances,
  canCreate,
  canCancel,
}: ClassroomMaintenancePanelProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [cancelTarget, setCancelTarget] = React.useState<ClassroomMaintenance | null>(null);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const form = useForm<CreateClassroomMaintenanceSchema>({
    resolver: zodResolver(createClassroomMaintenanceSchema),
    defaultValues: { classroomId, title: "", description: "", startDate: "", endDate: "" },
  });

  function onSubmit(values: CreateClassroomMaintenanceSchema) {
    startTransition(async () => {
      const res = await createClassroomMaintenanceAction(values);
      if (res.success) {
        toast.success("Manutenção agendada");
        form.reset({ classroomId, title: "", description: "", startDate: "", endDate: "" });
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao guardar");
      }
    });
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setIsCancelling(true);
    const res = await cancelClassroomMaintenanceAction({ maintenanceId: cancelTarget.id, classroomId });
    setIsCancelling(false);
    if (res.success) {
      toast.success("Manutenção cancelada");
      setCancelTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      {maintenances.length === 0 && (
        <p className="text-sm text-muted-foreground">Sem histórico de manutenções.</p>
      )}
      <div className="space-y-2">
        {maintenances.map((m) => (
          <div key={m.id} className="flex items-start justify-between rounded-md border px-3 py-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{m.title}</p>
                <Badge variant={STATUS_VARIANTS[m.status] ?? "outline"}>
                  {CLASSROOM_MAINTENANCE_STATUS_LABELS[m.status] ?? m.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(m.startDate).toLocaleDateString("pt-PT")} →{" "}
                {new Date(m.endDate).toLocaleDateString("pt-PT")}
              </p>
              {m.description && (
                <p className="text-xs text-muted-foreground">{m.description}</p>
              )}
            </div>
            {canCancel && ["SCHEDULED", "IN_PROGRESS"].includes(m.status) && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => setCancelTarget(m)}
              >
                <XCircle className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {canCreate && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="size-4 mr-1.5" />
              Agendar Manutenção
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Nova Manutenção</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Título</FormLabel>
                        <FormControl><Input placeholder="Ex: Pintura da sala" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data de Início</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data de Fim</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição (opcional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Detalhes..." {...field} value={field.value ?? ""} rows={3} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isPending} className="w-full">
                    {isPending ? "A guardar..." : "Agendar"}
                  </Button>
                </form>
              </Form>
            </div>
          </SheetContent>
        </Sheet>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancelar Manutenção"
        description={`Tem a certeza que pretende cancelar "${cancelTarget?.title}"?`}
        confirmLabel="Cancelar Manutenção"
        variant="destructive"
        loading={isCancelling}
        onConfirm={handleCancel}
      />
    </div>
  );
}
