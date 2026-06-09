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
  academicYearId: string;
  academicTermId: string | null;
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
  academicYearName?: string;
  academicTermName?: string | null;
}

export const CLASS_GROUP_STATUS_LABELS: Record<string, string> = {
  FORMING: "Em Formação",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  ARCHIVED: "Arquivado",
};

