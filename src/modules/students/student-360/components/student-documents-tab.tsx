"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { toast } from "@/shared/hooks/use-toast";
import { UploadDocumentDrawer } from "@/modules/students/student-360/components/upload-document-drawer";
import {
  deleteStudentDocumentAction,
  verifyStudentDocumentAction,
} from "@/modules/student-documents/actions/student-document.actions";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS } from "@/modules/student-documents/types";
import { FileText, Download, Trash2, CheckCircle2, XCircle, Upload } from "lucide-react";
import type { StudentDocument } from "@/modules/student-documents/types";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  VERIFIED: "secondary",
  REJECTED: "destructive",
};

interface StudentDocumentsTabProps {
  studentId: string;
  documents: StudentDocument[];
  canUpload: boolean;
  canDelete: boolean;
  canVerify: boolean;
}

export function StudentDocumentsTab({
  studentId,
  documents,
  canUpload,
  canDelete,
  canVerify,
}: StudentDocumentsTabProps) {
  const router = useRouter();
  const [showUpload, setShowUpload] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<StudentDocument | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [verifyingId, setVerifyingId] = React.useState<string | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const res = await deleteStudentDocumentAction(deleteTarget.id, studentId);
    setIsDeleting(false);
    if (res.success) {
      toast.success("Documento eliminado");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleVerify(documentId: string, status: "VERIFIED" | "REJECTED") {
    setVerifyingId(documentId);
    const res = await verifyStudentDocumentAction({ documentId, studentId, status });
    setVerifyingId(null);
    if (res.success) {
      toast.success(status === "VERIFIED" ? "Documento verificado" : "Documento rejeitado");
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
              ? "Carregue documentos do aluno (identificação, contratos, comprovativos, etc.)."
              : "Nenhum documento carregado para este aluno."
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
                      <span className="text-sm font-medium truncate">{doc.fileName}</span>
                      <Badge variant="outline" className="text-xs">
                        {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                      </Badge>
                      <Badge variant={STATUS_VARIANT[doc.status] ?? "outline"} className="text-xs">
                        {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Carregado em {new Date(doc.createdAt).toLocaleDateString("pt-PT")}
                      {doc.fileSize ? ` · ${(doc.fileSize / 1024).toFixed(0)} KB` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button asChild size="icon" variant="ghost" className="size-7" title="Descarregar">
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="size-4" />
                      </a>
                    </Button>
                    {canVerify && doc.status === "PENDING" && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-emerald-600 hover:text-emerald-600"
                          title="Verificar"
                          disabled={verifyingId === doc.id}
                          onClick={() => handleVerify(doc.id, "VERIFIED")}
                        >
                          <CheckCircle2 className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive hover:text-destructive"
                          title="Rejeitar"
                          disabled={verifyingId === doc.id}
                          onClick={() => handleVerify(doc.id, "REJECTED")}
                        >
                          <XCircle className="size-4" />
                        </Button>
                      </>
                    )}
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
        <UploadDocumentDrawer
          studentId={studentId}
          open={showUpload}
          onOpenChange={setShowUpload}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Documento"
        description={deleteTarget ? `Tem a certeza que pretende eliminar "${deleteTarget.fileName}"?` : ""}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
