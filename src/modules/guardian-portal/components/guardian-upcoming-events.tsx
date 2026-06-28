import { StudentUpcomingClasses } from "@/modules/student-portal/components/student-upcoming-classes";
import { StudentAssessmentsPanel } from "@/modules/student-portal/components/student-assessments-panel";
import type { StudentUpcomingClass, StudentAssessmentRow } from "@/modules/student-portal/types";

interface Props {
  classes: StudentUpcomingClass[];
  /** null when the link forbids academic visibility — assessments are then hidden. */
  assessments: StudentAssessmentRow[] | null;
}

/**
 * Próximas aulas/avaliações for the selected student (next 7 days). Reuses the
 * Student Portal panels. The assessments block only renders when academic
 * visibility is granted (assessments !== null).
 */
export function GuardianUpcomingEvents({ classes, assessments }: Props) {
  return (
    <div className="space-y-6">
      <StudentUpcomingClasses classes={classes} />
      {assessments !== null && <StudentAssessmentsPanel assessments={assessments} />}
    </div>
  );
}
