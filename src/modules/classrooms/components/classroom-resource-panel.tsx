"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
  createClassroomResourceAction,
  deleteClassroomResourceAction,
} from "@/modules/classrooms/actions/classroom-resource.actions";
import { createClassroomResourceSchema, type CreateClassroomResourceSchema } from "@/modules/classrooms/schemas/classroom-resource.schema";
import type { ClassroomResource } from "@/modules/classrooms/types";
import { Plus, Trash2 } from "lucide-react";

interface ClassroomResourcePanelProps {
  classroomId: string;
  resources: ClassroomResource[];
  canCreate: boolean;
  canDelete: boolean;
}

export function ClassroomResourcePanel({
  classroomId,
  resources,
  canCreate,
  canDelete,
}: ClassroomResourcePanelProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ClassroomResource | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const form = useForm<CreateClassroomResourceSchema>({
    resolver: zodResolver(createClassroomResourceSchema),
    defaultValues: { classroomId, name: "", quantity: 1, description: "" },
  });

  function onSubmit(values: CreateClassroomResourceSchema) {
    startTransition(async () => {
      const res = await createClassroomResourceAction(values);
      if (res.success) {
        toast.success("Recurso adicionado");
        form.reset({ classroomId, name: "", quantity: 1, description: "" });
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao guardar");
      }
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const res = await deleteClassroomResourceAction({ resourceId: deleteTarget.id, classroomId });
    setIsDeleting(false);
    if (res.success) {
      toast.success("Recurso eliminado");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      {resources.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum recurso registado.</p>
      )}
      <div className="space-y-2">
        {resources.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                {r.quantity} unidade(s){r.description ? ` · ${r.description}` : ""}
              </p>
            </div>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(r)}
              >
                <Trash2 className="size-4" />
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
              Adicionar Recurso
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Novo Recurso</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome</FormLabel>
                        <FormControl><Input placeholder="Ex: Computador" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantidade</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição (opcional)</FormLabel>
                        <FormControl><Input placeholder="Descrição..." {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isPending} className="w-full">
                    {isPending ? "A guardar..." : "Guardar"}
                  </Button>
                </form>
              </Form>
            </div>
          </SheetContent>
        </Sheet>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Recurso"
        description={`Tem a certeza que pretende eliminar "${deleteTarget?.name}"?`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
