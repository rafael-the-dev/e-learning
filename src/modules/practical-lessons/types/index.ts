import type { PracticalLessonStatus } from "@/shared/types/common";

export interface PracticalLessonDto {
  id: string;
  organizationId: string;
  studentId: string;
  teacherId: string | null;
  vehicleId: string | null;
  date: Date;
  startTime: string;
  endTime: string;
  durationMinutes: number | null;
  status: PracticalLessonStatus;
  evaluation: string | null;
  notes: string | null;
  createdAt: Date;
  student?: { id: string; firstName: string; lastName: string };
  teacher?: { id: string; firstName: string; lastName: string } | null;
  vehicle?: { id: string; plate: string; brand: string | null; model: string | null } | null;
}

export interface SchedulePracticalLessonInput {
  organizationId: string;
  studentId: string;
  teacherId?: string;
  vehicleId?: string;
  date: Date;
  startTime: string;
  endTime: string;
  notes?: string;
}

export interface UpdatePracticalLessonInput {
  teacherId?: string;
  vehicleId?: string;
  date?: Date;
  startTime?: string;
  endTime?: string;
  status?: PracticalLessonStatus;
  evaluation?: string;
  notes?: string;
}
