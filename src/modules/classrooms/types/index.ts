// =============================================================================
// CLASSROOMS MODULE — TYPES
// =============================================================================

export interface Classroom {
  id: string;
  organizationId: string;
  branchId: string | null;
  code: string;
  name: string;
  description: string | null;
  classroomType: string;
  capacity: number;
  location: string | null;
  floor: string | null;
  meetingProvider: string | null;
  meetingUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // joined
  branchName?: string | null;
  featuresCount?: number;
  resourcesCount?: number;
  bookingsCount?: number;
}

export interface ClassroomFeature {
  id: string;
  organizationId: string;
  classroomId: string;
  feature: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassroomResource {
  id: string;
  organizationId: string;
  classroomId: string;
  name: string;
  quantity: number;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ClassroomMaintenance {
  id: string;
  organizationId: string;
  classroomId: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ClassroomBooking {
  id: string;
  organizationId: string;
  branchId: string | null;
  classroomId: string;
  classGroupId: string | null;
  scheduleSlotId: string | null;
  academicYearId: string;
  academicTermId: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  // joined
  classroomName?: string;
  classroomCode?: string;
  classGroupName?: string | null;
  branchName?: string | null;
  academicYearName?: string;
  academicTermName?: string | null;
  scheduleSlotDay?: string | null;
  scheduleSlotStart?: string | null;
  scheduleSlotEnd?: string | null;
}

// ─── Label Maps ──────────────────────────────────────────────────────────────

export const CLASSROOM_TYPE_LABELS: Record<string, string> = {
  STANDARD_ROOM: "Sala Padrão",
  COMPUTER_LAB: "Laboratório de Informática",
  LANGUAGE_LAB: "Laboratório de Línguas",
  DESIGN_STUDIO: "Estúdio de Design",
  DRIVING_ROOM: "Sala de Condução",
  MEETING_ROOM: "Sala de Reuniões",
  ONLINE_ROOM: "Sala Online",
  OTHER: "Outro",
};

export const CLASSROOM_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  MAINTENANCE: "Em Manutenção",
  INACTIVE: "Inativa",
  ARCHIVED: "Arquivada",
};

export const CLASSROOM_FEATURE_LABELS: Record<string, string> = {
  AIR_CONDITIONING: "Ar Condicionado",
  INTERNET: "Internet",
  PROJECTOR: "Projetor",
  SMART_BOARD: "Quadro Interativo",
  RECORDING: "Gravação",
  ACCESSIBLE: "Acessível",
  SOUND_SYSTEM: "Sistema de Som",
  CCTV: "Videovigilância",
  GENERATOR: "Gerador",
  OTHER: "Outro",
};

export const CLASSROOM_RESOURCE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const CLASSROOM_MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada",
  IN_PROGRESS: "Em Curso",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const CLASSROOM_BOOKING_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  ARCHIVED: "Arquivada",
};

export const MEETING_PROVIDER_LABELS: Record<string, string> = {
  ZOOM: "Zoom",
  GOOGLE_MEET: "Google Meet",
  MICROSOFT_TEAMS: "Microsoft Teams",
  CUSTOM: "Personalizado",
};
