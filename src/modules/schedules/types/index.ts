// =============================================================================
// SCHEDULES MODULE — TYPES
// =============================================================================

export const SCHEDULE_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUS)[keyof typeof SCHEDULE_STATUS];

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const DAY_OF_WEEK = {
  MONDAY: "MONDAY",
  TUESDAY: "TUESDAY",
  WEDNESDAY: "WEDNESDAY",
  THURSDAY: "THURSDAY",
  FRIDAY: "FRIDAY",
  SATURDAY: "SATURDAY",
  SUNDAY: "SUNDAY",
} as const;

export type DayOfWeek = (typeof DAY_OF_WEEK)[keyof typeof DAY_OF_WEEK];

export const DAY_OF_WEEK_LABELS: Record<string, string> = {
  MONDAY: "Segunda-feira",
  TUESDAY: "Terça-feira",
  WEDNESDAY: "Quarta-feira",
  THURSDAY: "Quinta-feira",
  FRIDAY: "Sexta-feira",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

export const DAY_OF_WEEK_SHORT: Record<string, string> = {
  MONDAY: "Seg",
  TUESDAY: "Ter",
  WEDNESDAY: "Qua",
  THURSDAY: "Qui",
  FRIDAY: "Sex",
  SATURDAY: "Sáb",
  SUNDAY: "Dom",
};

export const DAY_OF_WEEK_ORDER: Record<string, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
};

export interface SchedulePeriod {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  slotsCount?: number;
}

export interface ScheduleSlot {
  id: string;
  organizationId: string;
  schedulePeriodId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  periodName?: string;
  periodCode?: string;
}

export interface ClassGroupSchedule {
  id: string;
  organizationId: string;
  classGroupId: string;
  scheduleSlotId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  slot?: ScheduleSlot;
}

export interface ClassGroupScheduleWithSlot extends ClassGroupSchedule {
  slot: ScheduleSlot & {
    periodName: string;
    periodCode: string;
  };
}
