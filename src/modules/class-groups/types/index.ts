import type { ClassGroupStatus } from "@/shared/types/common";

export interface ClassGroupDto {
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
  status: ClassGroupStatus;
  createdAt: Date;
  course?: { id: string; name: string };
  courseLevel?: { id: string; name: string } | null;
  teacher?: { id: string; firstName: string; lastName: string } | null;
  schedules?: ClassScheduleDto[];
}

export interface ClassScheduleDto {
  id: string;
  classGroupId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
}

export interface CreateClassGroupInput {
  organizationId: string;
  branchId?: string;
  courseId: string;
  courseLevelId?: string;
  teacherId?: string;
  name: string;
  code?: string;
  capacity?: number;
  startDate?: Date;
  endDate?: Date;
  schedules?: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    room?: string;
  }[];
}
