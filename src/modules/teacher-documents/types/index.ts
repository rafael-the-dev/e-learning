export interface TeacherDocument {
  id: string;
  organizationId: string;
  teacherId: string;
  type: string;
  name: string;
  url: string;
  mimeType: string | null;
  size: number | null;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const TEACHER_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Contrato",
  CV: "Currículo",
  CERTIFICATE: "Certificado",
  IDENTIFICATION: "Identificação",
  LICENSE: "Licença",
  OTHER: "Outro",
};
