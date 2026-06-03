// =============================================================================
// STUDENTS MODULE TYPES
// =============================================================================

export interface Student {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  address: string | null;
  idType: string | null;
  idNumber: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch: { id: string; name: string } | null;
}

export interface StudentBranch {
  id: string;
  name: string;
  code: string | null;
}

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  COMPLETED: "Concluído",
  DROPPED: "Abandonado",
};

export const GENDER_LABELS: Record<string, string> = {
  MALE: "Masculino",
  FEMALE: "Feminino",
  OTHER: "Outro",
};

export const ID_TYPE_LABELS: Record<string, string> = {
  BI: "Bilhete de Identidade",
  PASSPORT: "Passaporte",
  NUIT: "NUIT",
  OTHER: "Outro",
};
