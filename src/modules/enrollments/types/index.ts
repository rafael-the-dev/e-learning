import type { EnrollmentStatus } from "@/shared/types/common";

export interface EnrollmentDto {
  id: string;
  organizationId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string | null;
  classGroupId: string | null;
  enrollmentDate: Date;
  startDate: Date | null;
  endDate: Date | null;
  status: EnrollmentStatus;
  notes: string | null;
  createdAt: Date;
  student?: { id: string; firstName: string; lastName: string; code: string | null };
  course?: { id: string; name: string };
  courseLevel?: { id: string; name: string } | null;
  classGroup?: { id: string; name: string } | null;
}

export interface CreateEnrollmentInput {
  organizationId: string;
  studentId: string;
  courseId: string;
  courseLevelId?: string;
  classGroupId?: string;
  startDate?: Date;
  notes?: string;
}

export interface UpdateEnrollmentStatusInput {
  enrollmentId: string;
  status: EnrollmentStatus;
  reason?: string;
}

export interface EnrollmentFilters {
  search?: string;
  status?: EnrollmentStatus;
  courseId?: string;
  courseLevelId?: string;
  classGroupId?: string;
  studentId?: string;
}
