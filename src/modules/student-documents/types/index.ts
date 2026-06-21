export interface StudentDocument {
  id: string;
  organizationId: string;
  studentId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  status: string;
  notes: string | null;
  uploadedBy: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  IDENTIFICATION: "Identificação",
  PASSPORT: "Passaporte",
  CERTIFICATE: "Certificado",
  CONTRACT: "Contrato",
  PAYMENT_PROOF: "Comprovativo de Pagamento",
  PHOTO: "Fotografia",
  OTHER: "Outro",
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  VERIFIED: "Verificado",
  REJECTED: "Rejeitado",
};
