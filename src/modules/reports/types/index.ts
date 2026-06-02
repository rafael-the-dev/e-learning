export interface ReportFilter {
  organizationId: string;
  branchId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface StudentReportRow {
  studentId: string;
  code: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  enrollmentCount: number;
  activeEnrollments: number;
  totalPaid: number;
  totalDue: number;
  attendanceRate: number;
}

export interface EnrollmentReportRow {
  enrollmentId: string;
  studentName: string;
  courseName: string;
  levelName: string | null;
  classGroupName: string | null;
  status: string;
  enrollmentDate: Date;
  startDate: Date | null;
  endDate: Date | null;
}

export interface FinancialReportRow {
  period: string;
  totalInvoiced: number;
  totalCollected: number;
  totalPending: number;
  totalOverdue: number;
  paymentCount: number;
}

export interface AttendanceReportRow {
  studentId: string;
  studentName: string;
  classGroupName: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
}
