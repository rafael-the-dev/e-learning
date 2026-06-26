"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { toast } from "@/shared/hooks/use-toast";
import { UploadTeacherDocumentDrawer } from "@/modules/teachers/teacher-360/components/upload-teacher-document-drawer";
import { deleteTeacherDocumentAction } from "@/modules/teacher-documents/actions/teacher-document.actions";
import { TEACHER_DOCUMENT_TYPE_LABELS } from "@/modules/teacher-documents/types";
import { FileText, Download, Trash2, Upload } from "lucide-react";
import type { TeacherDocument } from "@/modules/teacher-documents/types";

interface TeacherDocumentsTabProps {
  teacherId: string;
  documents: TeacherDocument[];
  canUpload: boolean;
  canDelete: boolean;
}

export function TeacherDocumentsTab({ teacherId, documents, canUpload, canDelete }: TeacherDocumentsTabProps) {
  const router = useRouter();
  const [showUpload, setShowUpload] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<TeacherDocument | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const res = await deleteTeacherDocumentAction(deleteTarget.id, teacherId);
    setIsDeleting(false);
    if (res.success) {
      toast.success("Documento eliminado");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}>
            <Upload className="size-4 mr-1.5" />
            Carregar Documento
          </Button>
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-8" />}
          title="Sem documentos"
          description={
            canUpload
              ? "Carregue documentos do professor (contrato, currículo, certificados, etc.)."
              : "Nenhum documento carregado para este professor."
          }
          action={
            canUpload ? (
              <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}>
                <Upload className="size-4 mr-1.5" />
                Carregar Documento
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{doc.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {TEACHER_DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Carregado em {new Date(doc.createdAt).toLocaleDateString("pt-PT")}
                      {doc.size ? ` · ${(doc.size / 1024).toFixed(0)} KB` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button asChild size="icon" variant="ghost" className="size-7" title="Descarregar">
                      <a href={doc.url} target="_blank" rel="noopener noreferrer">
                        <Download className="size-4" />
                      </a>
                    </Button>
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive hover:text-destructive"
                        title="Eliminar"
                        onClick={() => setDeleteTarget(doc)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {canUpload && (
        <UploadTeacherDocumentDrawer teacherId={teacherId} open={showUpload} onOpenChange={setShowUpload} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Documento"
        description={deleteTarget ? `Tem a certeza que pretende eliminar "${deleteTarget.name}"?` : ""}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
