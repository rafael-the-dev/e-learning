// =============================================================================
// ACADEMIC CALENDAR MODULE — TYPES
// =============================================================================

export const ACADEMIC_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
} as const;

export type AcademicStatus = (typeof ACADEMIC_STATUS)[keyof typeof ACADEMIC_STATUS];

export const ACADEMIC_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  ARCHIVED: "Arquivado",
};

export const ACADEMIC_EVENT_TYPE = {
  GENERAL: "GENERAL",
  EXAM_PERIOD: "EXAM_PERIOD",
  ENROLLMENT_PERIOD: "ENROLLMENT_PERIOD",
  PAYMENT_DEADLINE: "PAYMENT_DEADLINE",
  HOLIDAY: "HOLIDAY",
  TEACHER_MEETING: "TEACHER_MEETING",
  GRADUATION: "GRADUATION",
  OTHER: "OTHER",
} as const;

export type AcademicEventType = (typeof ACADEMIC_EVENT_TYPE)[keyof typeof ACADEMIC_EVENT_TYPE];

export const ACADEMIC_EVENT_TYPE_LABELS: Record<string, string> = {
  GENERAL: "Geral",
  EXAM_PERIOD: "Período de Exames",
  ENROLLMENT_PERIOD: "Período de Matrículas",
  PAYMENT_DEADLINE: "Prazo de Pagamento",
  HOLIDAY: "Feriado",
  TEACHER_MEETING: "Reunião de Professores",
  GRADUATION: "Formatura",
  OTHER: "Outro",
};

export interface AcademicYear {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  status: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  termsCount?: number;
}

export interface AcademicTerm {
  id: string;
  organizationId: string;
  academicYearId: string;
  name: string;
  code: string;
  startDate: Date;
  endDate: Date;
  order: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  yearName?: string;
  yearCode?: string;
}

export interface AcademicHoliday {
  id: string;
  organizationId: string;
  academicYearId: string | null;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  isRecurring: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  yearName?: string | null;
}

export interface AcademicEvent {
  id: string;
  organizationId: string;
  academicYearId: string | null;
  academicTermId: string | null;
  title: string;
  description: string | null;
  eventType: string;
  startDate: Date;
  endDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  yearName?: string | null;
  termName?: string | null;
}
