import { StudentGradesPanel } from "@/modules/student-portal/components/student-grades-panel";
import type { StudentGradeRow } from "@/modules/student-portal/types";

// The guardian sees exactly the same published-grade view as the student — no
// duplicated rendering logic. Only rendered when the link's canViewAcademic is
// true (the parent page never mounts this otherwise).
export function GuardianGradesPanel({ grades }: { grades: StudentGradeRow[] }) {
  return <StudentGradesPanel grades={grades} />;
}
