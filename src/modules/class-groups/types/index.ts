// =============================================================================
// CLASS GROUPS MODULE — TYPES
// =============================================================================

export interface ClassGroup {
  id: string;
  organizationId: string;
  branchId: string | null;
  courseId: string;
  courseLevelId: string | null;
  teacherId: string | null;
  name: string;
  code: string | null;
  capacity: number;
  currentCount: number;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // joined fields
  courseName?: string;
  courseLevelName?: string | null;
  teacherName?: string | null;
  branchName?: string | null;
  enrollmentsCount?: number;
  schedulesCount?: number;
}

export interface ClassGroupWithSchedules extends ClassGroup {
  schedules: ClassSchedule[];
}

export interface ClassSchedule {
  id: string;
  classGroupId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CLASS_GROUP_STATUS_LABELS: Record<string, string> = {
  FORMING: "Em Formação",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  ARCHIVED: "Arquivado",
};

export const DAY_OF_WEEK_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

export const DAY_OF_WEEK_SHORT: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};
