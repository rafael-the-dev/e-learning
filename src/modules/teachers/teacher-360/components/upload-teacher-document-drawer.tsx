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
import { toast } from "@/shared/hooks/use-toast";
import { useRouter } from "next/navigation";
import { createTeacherDocumentAction } from "@/modules/teacher-documents/actions/teacher-document.actions";
import {
  createTeacherDocumentSchema,
  type CreateTeacherDocumentSchema,
} from "@/modules/teacher-documents/schemas/teacher-document.schema";
import { TEACHER_DOCUMENT_TYPE_LABELS } from "@/modules/teacher-documents/types";
import { Upload } from "lucide-react";

interface UploadTeacherDocumentDrawerProps {
  teacherId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadTeacherDocumentDrawer({
  teacherId,
  open,
  onOpenChange,
}: UploadTeacherDocumentDrawerProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createTeacherDocumentSchema>, unknown, CreateTeacherDocumentSchema>({
    resolver: zodResolver(createTeacherDocumentSchema),
    defaultValues: { teacherId, type: "OTHER" },
  });

  async function onSubmit(data: CreateTeacherDocumentSchema) {
    const res = await createTeacherDocumentAction(data);
    if (res.success) {
      toast.success("Documento carregado");
      reset({ teacherId, type: "OTHER" });
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Carregar Documento</SheetTitle>
          <SheetDescription>
            Adicione um documento do professor através do URL do ficheiro.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <input type="hidden" {...register("teacherId")} />

          <div className="space-y-1.5">
            <Label>Tipo de Documento</Label>
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TEACHER_DOCUMENT_TYPE_LABELS).map(([value, label]) => (
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
            <Label htmlFor="doc-name">Nome do Documento</Label>
            <Input id="doc-name" placeholder="ex: Contrato 2026.pdf" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-url">URL do Ficheiro</Label>
            <Input id="doc-url" type="url" placeholder="https://..." {...register("url")} />
            {errors.url && <p className="text-xs text-destructive">{errors.url.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-mimeType">Tipo MIME</Label>
            <Input id="doc-mimeType" placeholder="ex: application/pdf" {...register("mimeType")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-size">Tamanho (bytes)</Label>
            <Input
              id="doc-size"
              type="number"
              min={0}
              placeholder="Opcional"
              {...register("size", { valueAsNumber: true })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Upload className="size-4 mr-1.5" />
              {isSubmitting ? "A carregar…" : "Carregar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
