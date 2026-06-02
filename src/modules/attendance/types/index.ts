import type { AttendanceStatus } from "@/shared/types/common";

export interface AttendanceRecordDto {
  id: string;
  organizationId: string;
  classGroupId: string;
  studentId: string;
  subjectId: string | null;
  date: Date;
  status: AttendanceStatus;
  justification: string | null;
  markedBy: string | null;
  student?: { id: string; firstName: string; lastName: string; code: string | null };
  subject?: { id: string; name: string } | null;
}

export interface MarkAttendanceInput {
  organizationId: string;
  classGroupId: string;
  subjectId?: string;
  date: Date;
  records: {
    studentId: string;
    status: AttendanceStatus;
    justification?: string;
  }[];
}

export interface AttendanceSummary {
  studentId: string;
  studentName: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendanceRate: number;
}
