"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { toast } from "@/shared/hooks/use-toast";
import { useRouter } from "next/navigation";
import { createStudentDocumentAction } from "@/modules/student-documents/actions/student-document.actions";
import {
  createStudentDocumentSchema,
  type CreateStudentDocumentSchema,
} from "@/modules/student-documents/schemas/student-document.schema";
import { DOCUMENT_TYPE_LABELS } from "@/modules/student-documents/types";
import { Upload } from "lucide-react";

interface UploadDocumentDrawerProps {
  studentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function UploadDocumentDrawer({ studentId, open, onOpenChange, onSuccess }: UploadDocumentDrawerProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateStudentDocumentSchema>({
    resolver: zodResolver(createStudentDocumentSchema),
    defaultValues: { studentId, documentType: "OTHER" },
  });

  async function onSubmit(data: CreateStudentDocumentSchema) {
    const res = await createStudentDocumentAction(data);
    if (res.success) {
      toast.success("Documento carregado");
      reset({ studentId, documentType: "OTHER" });
      onOpenChange(false);
      onSuccess?.();
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
            Adicione um documento do aluno através do URL do ficheiro.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <input type="hidden" {...register("studentId")} />

          <div className="space-y-1.5">
            <Label>Tipo de Documento</Label>
            <Controller
              name="documentType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
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
            <Label htmlFor="doc-fileName">Nome do Ficheiro</Label>
            <Input
              id="doc-fileName"
              placeholder="ex: Bilhete de Identidade.pdf"
              {...register("fileName")}
            />
            {errors.fileName && <p className="text-xs text-destructive">{errors.fileName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-fileUrl">URL do Ficheiro</Label>
            <Input id="doc-fileUrl" type="url" placeholder="https://..." {...register("fileUrl")} />
            {errors.fileUrl && <p className="text-xs text-destructive">{errors.fileUrl.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-fileSize">Tamanho (bytes)</Label>
            <Input
              id="doc-fileSize"
              type="number"
              min={0}
              placeholder="Opcional"
              {...register("fileSize", { valueAsNumber: true })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-notes">Notas</Label>
            <Textarea id="doc-notes" placeholder="Opcional" {...register("notes")} />
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
