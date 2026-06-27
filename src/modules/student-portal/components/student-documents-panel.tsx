import { EmptyState } from "@/shared/components/layout/empty-state";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { FileText, Download } from "lucide-react";
import { STUDENT_DOCUMENT_TYPE_LABELS, STUDENT_DOCUMENT_STATUS_LABELS } from "@/modules/student-portal/types";
import type { StudentDocumentRow } from "@/modules/student-portal/types";

interface Props {
  documents: StudentDocumentRow[];
}

const STATUS_BADGE: Record<string, "success" | "warning" | "destructive"> = {
  VERIFIED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
};

export function StudentDocumentsPanel({ documents }: Props) {
  if (documents.length === 0) {
    return <EmptyState icon={<FileText className="size-8" />} title="Sem documentos disponíveis." className="border-0" />;
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="rounded-md bg-muted/50 p-2 text-muted-foreground">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{doc.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {STUDENT_DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
            </p>
          </div>
          <Badge variant={STATUS_BADGE[doc.status] ?? "secondary"}>
            {STUDENT_DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
          </Badge>
          {/* View/download only — no upload or delete from the Portal. */}
          <Button asChild variant="ghost" size="sm">
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir documento">
              <Download className="size-4" />
            </a>
          </Button>
        </div>
      ))}
    </div>
  );
}
