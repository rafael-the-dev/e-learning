// =============================================================================
// TEACHERS MODULE TYPES
// =============================================================================

export interface Teacher {
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
  licenseNumber: string | null;
  specialization: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch: { id: string; name: string } | null;
}

export interface TeacherWithSubjects extends Teacher {
  teacherSubjects: TeacherSubjectItem[];
}

export interface TeacherSubjectItem {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  assignedAt: Date;
}

export interface TeacherBranch {
  id: string;
  name: string;
  code: string | null;
}

export const TEACHER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  INACTIVE: "Inativo",
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
