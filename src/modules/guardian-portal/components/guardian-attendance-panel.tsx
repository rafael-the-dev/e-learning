import { StudentAttendancePanel } from "@/modules/student-portal/components/student-attendance-panel";
import type {
  StudentAttendanceKpis,
  StudentAttendanceMonthlyPoint,
  StudentAttendanceSessionRow,
} from "@/modules/student-portal/types";

interface Props {
  kpis: StudentAttendanceKpis;
  trend: StudentAttendanceMonthlyPoint[];
  sessions: StudentAttendanceSessionRow[];
}

// Reuses the Student Portal attendance panel verbatim. Only rendered when the
// link's canViewAttendance flag is true.
export function GuardianAttendancePanel({ kpis, trend, sessions }: Props) {
  return <StudentAttendancePanel kpis={kpis} trend={trend} sessions={sessions} />;
}
