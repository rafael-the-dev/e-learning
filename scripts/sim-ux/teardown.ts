import "dotenv/config";
import { getDb } from "../../src/server/db";

// =============================================================================
// SIM-UX teardown — removes everything the fixture (and the simulation run)
// created, in FK-safe order (relations are NoAction, so children go first).
// Everything is scoped to ORG_ID; the login user is removed by email.
// =============================================================================

const ORG_ID = "simux-org";
const USER_EMAIL = "secretaria@sim-ux.test";

async function main(): Promise<void> {
  const db = await getDb();
  const org = { organizationId: ORG_ID } as const;
  const byEnrollmentOrg = { enrollment: { organizationId: ORG_ID } } as const;

  // Ordered: exam graph → grades/progression → academic child rows → enrollments/students
  // → catalog → membership → user → org. Each step tolerated (0 rows is fine).
  const steps: Array<[string, () => Promise<{ count: number }>]> = [
    ["examEvent", () => db.examEvent.deleteMany({ where: org })],
    ["examInvigilatorAssignment", () => db.examInvigilatorAssignment.deleteMany({ where: org })],
    ["examIncident", () => db.examIncident.deleteMany({ where: org })],
    ["examGradeComponentBinding", () => db.examGradeComponentBinding.deleteMany({ where: org })],
    ["examAppeal", () => db.examAppeal.deleteMany({ where: org })],
    ["examResultRevision", () => db.examResultRevision.deleteMany({ where: org })],
    ["examPublication", () => db.examPublication.deleteMany({ where: org })],
    ["examResult", () => db.examResult.deleteMany({ where: org })],
    ["examAttendance", () => db.examAttendance.deleteMany({ where: org })],
    ["examCandidate", () => db.examCandidate.deleteMany({ where: org })],
    ["examAttempt", () => db.examAttempt.deleteMany({ where: org })],
    ["examSession", () => db.examSession.deleteMany({ where: org })],
    ["examRoom", () => db.examRoom.deleteMany({ where: org })],
    ["examPeriod", () => db.examPeriod.deleteMany({ where: org })],
    ["gradeChangeLog", () => db.gradeChangeLog.deleteMany({ where: org })],
    ["studentAssessmentResult", () => db.studentAssessmentResult.deleteMany({ where: org })],
    ["studentSubjectProgress", () => db.studentSubjectProgress.deleteMany({ where: org })],
    ["studentLevelProgress", () => db.studentLevelProgress.deleteMany({ where: org })],
    ["studentCourseProgress", () => db.studentCourseProgress.deleteMany({ where: org })],
    ["levelProgressionRequest", () => db.levelProgressionRequest.deleteMany({ where: org })],
    ["studentTimelineEvent", () => db.studentTimelineEvent.deleteMany({ where: org })],
    ["enrollmentStatusHistory", () => db.enrollmentStatusHistory.deleteMany({ where: byEnrollmentOrg })],
    ["enrollment", () => db.enrollment.deleteMany({ where: org })],
    ["student", () => db.student.deleteMany({ where: org })],
    ["levelSubject", () => db.levelSubject.deleteMany({ where: org })],
    ["courseLevel", () => db.courseLevel.deleteMany({ where: { course: { organizationId: ORG_ID } } })],
    ["course", () => db.course.deleteMany({ where: org })],
    ["subject", () => db.subject.deleteMany({ where: org })],
    ["academicYear", () => db.academicYear.deleteMany({ where: org })],
    ["teacher", () => db.teacher.deleteMany({ where: org })],
    ["auditLog", () => db.auditLog.deleteMany({ where: org })],
    ["userRole", () => db.userRole.deleteMany({ where: org })],
    ["userOrganization", () => db.userOrganization.deleteMany({ where: org })],
    ["branch", () => db.branch.deleteMany({ where: org })],
    ["user", () => db.user.deleteMany({ where: { email: USER_EMAIL } })],
    ["organization", () => db.organization.deleteMany({ where: { id: ORG_ID } })],
  ];

  for (const [name, fn] of steps) {
    try {
      const { count } = await fn();
      if (count > 0) console.log(`  deleted ${count} ${name}`);
    } catch (e) {
      console.warn(`  ! ${name}: ${String(e).slice(0, 140)}`);
    }
  }

  console.log("SIM-UX teardown complete.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
