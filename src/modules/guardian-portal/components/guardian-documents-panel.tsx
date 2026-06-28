import { StudentDocumentsPanel } from "@/modules/student-portal/components/student-documents-panel";
import type { StudentDocumentRow } from "@/modules/student-portal/types";

// Reuses the Student Portal documents panel (read-only — no upload/delete in
// Guardian Portal v1). Only rendered when the link's canViewDocuments is true.
export function GuardianDocumentsPanel({ documents }: { documents: StudentDocumentRow[] }) {
  return <StudentDocumentsPanel documents={documents} />;
}
