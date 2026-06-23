"use client";

import * as React from "react";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { toast } from "@/shared/hooks/use-toast";
import { useRouter } from "next/navigation";
import {
  createLessonAttachmentAction,
  updateLessonAttachmentAction,
  deleteLessonAttachmentAction,
} from "@/modules/lessons/actions/lesson-attachment.actions";
import {
  createLessonAttachmentSchema,
  updateLessonAttachmentSchema,
  type CreateLessonAttachmentSchema,
  type UpdateLessonAttachmentSchema,
} from "@/modules/lessons/schemas/lesson-attachment.schema";
import { FILE_TYPE_LABELS } from "@/modules/lessons/types";
import { Paperclip, Plus, Trash2, Download, Pencil } from "lucide-react";
import type { LessonAttachment } from "@/modules/lessons/types";

interface LessonAttachmentsPanelProps {
  lessonId: string;
  attachments: LessonAttachment[];
  canCreate: boolean;
  canDelete: boolean;
}

export function LessonAttachmentsPanel({
  lessonId,
  attachments,
  canCreate,
  canDelete,
}: LessonAttachmentsPanelProps) {
  const router = useRouter();
  const [showAdd, setShowAdd] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<LessonAttachment | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<LessonAttachment | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const res = await deleteLessonAttachmentAction(deleteTarget.id, lessonId);
    setIsDeleting(false);
    if (res.success) {
      toast.success("Anexo eliminado");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Paperclip className="size-4" />
          Anexos ({attachments.length})
        </h2>
        {canCreate && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="size-4 mr-1.5" />
            Adicionar Anexo
          </Button>
        )}
      </div>

      {attachments.length === 0 ? (
        <EmptyState
          icon={<Paperclip className="size-8" />}
          title="Sem anexos"
          description={canCreate ? "Adicione ficheiros de apoio a esta lição." : "Nenhum anexo disponível."}
          action={
            canCreate ? (
              <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                <Plus className="size-4 mr-1.5" />
                Adicionar Anexo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{a.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {FILE_TYPE_LABELS[a.fileType] ?? a.fileType}
                  {a.fileSize ? ` · ${(a.fileSize / 1024).toFixed(0)} KB` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.isDownloadable && (
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline flex items-center gap-1"
                  >
                    <Download className="size-3" />
                    Descarregar
                  </a>
                )}
                {canCreate && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setEditTarget(a)}
                    title="Editar anexo"
                  >
                    <Pencil className="size-4" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(a)}
                    title="Eliminar anexo"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <AddAttachmentDrawer
          lessonId={lessonId}
          open={showAdd}
          onOpenChange={setShowAdd}
          onSuccess={() => router.refresh()}
        />
      )}

      {editTarget && canCreate && (
        <EditAttachmentDrawer
          attachment={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Anexo"
        description={deleteTarget ? `Tem a certeza que pretende eliminar "${deleteTarget.fileName}"?` : ""}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </section>
  );
}

// =============================================================================
// ADD ATTACHMENT DRAWER
// =============================================================================

interface AddAttachmentDrawerProps {
  lessonId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// =============================================================================
// EDIT ATTACHMENT DRAWER
// =============================================================================

interface EditAttachmentDrawerProps {
  attachment: LessonAttachment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function EditAttachmentDrawer({ attachment, open, onOpenChange, onSuccess }: EditAttachmentDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateLessonAttachmentSchema>({
    resolver: zodResolver(updateLessonAttachmentSchema),
    defaultValues: {
      attachmentId: attachment.id,
      lessonId: attachment.lessonId,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileType: attachment.fileType as UpdateLessonAttachmentSchema["fileType"],
      fileSize: attachment.fileSize ?? undefined,
      isDownloadable: attachment.isDownloadable,
    },
  });

  async function onSubmit(data: UpdateLessonAttachmentSchema) {
    const res = await updateLessonAttachmentAction(data);
    if (res.success) {
      toast.success("Anexo atualizado");
      onOpenChange(false);
      onSuccess();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Editar Anexo</SheetTitle>
          <SheetDescription>Atualize os detalhes deste ficheiro.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <input type="hidden" {...register("attachmentId")} />
          <input type="hidden" {...register("lessonId")} />

          <div className="space-y-1.5">
            <Label htmlFor="edit-fileName">Nome do Ficheiro</Label>
            <Input id="edit-fileName" {...register("fileName")} />
            {errors.fileName && (
              <p className="text-xs text-destructive">{errors.fileName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-fileUrl">URL do Ficheiro</Label>
            <Input id="edit-fileUrl" type="url" {...register("fileUrl")} />
            {errors.fileUrl && (
              <p className="text-xs text-destructive">{errors.fileUrl.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de Ficheiro</Label>
            <Controller
              name="fileType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FILE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-fileSize">Tamanho (bytes)</Label>
            <Input
              id="edit-fileSize"
              type="number"
              min={0}
              {...register("fileSize", { valueAsNumber: true })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Permitir descarregar</p>
              <p className="text-xs text-muted-foreground">O aluno pode descarregar o ficheiro</p>
            </div>
            <Controller
              name="isDownloadable"
              control={control}
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "A guardar…" : "Guardar Alterações"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// ADD ATTACHMENT DRAWER
// =============================================================================

function AddAttachmentDrawer({ lessonId, open, onOpenChange, onSuccess }: AddAttachmentDrawerProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createLessonAttachmentSchema>, unknown, CreateLessonAttachmentSchema>({
    resolver: zodResolver(createLessonAttachmentSchema),
    defaultValues: {
      lessonId,
      fileType: "OTHER",
      isDownloadable: true,
    },
  });

  async function onSubmit(data: CreateLessonAttachmentSchema) {
    const res = await createLessonAttachmentAction(data);
    if (res.success) {
      toast.success("Anexo adicionado");
      reset();
      onOpenChange(false);
      onSuccess();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Adicionar Anexo</SheetTitle>
          <SheetDescription>
            Adicione um ficheiro de apoio a esta lição.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <input type="hidden" {...register("lessonId")} />

          <div className="space-y-1.5">
            <Label htmlFor="fileName">Nome do Ficheiro</Label>
            <Input
              id="fileName"
              placeholder="ex: Resumo da lição.pdf"
              {...register("fileName")}
            />
            {errors.fileName && (
              <p className="text-xs text-destructive">{errors.fileName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fileUrl">URL do Ficheiro</Label>
            <Input
              id="fileUrl"
              type="url"
              placeholder="https://..."
              {...register("fileUrl")}
            />
            {errors.fileUrl && (
              <p className="text-xs text-destructive">{errors.fileUrl.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de Ficheiro</Label>
            <Controller
              name="fileType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FILE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fileSize">Tamanho (bytes)</Label>
            <Input
              id="fileSize"
              type="number"
              min={0}
              placeholder="Opcional"
              {...register("fileSize", { valueAsNumber: true })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Permitir descarregar</p>
              <p className="text-xs text-muted-foreground">O aluno pode descarregar o ficheiro</p>
            </div>
            <Controller
              name="isDownloadable"
              control={control}
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "A guardar…" : "Adicionar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
