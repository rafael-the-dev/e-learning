import "dotenv/config";
import { getDb } from "../src/server/db";
import type { PrismaClient } from "@prisma/client";

// =============================================================================
// ACADEMIC DEMO SEED — idempotent
// Run with: pnpm db:seed-academic
//
// Populates a demonstration academic dataset (students, enrollments, TWO
// assessment periods, assessment events and grades) for an EXISTING
// organization (Elton Training Center), targeting the Inglês / Beginner course
// level — the only level with assessment policies + components configured.
//
// This file NEVER touches prisma/seed.ts territory (permissions/roles/super-admin).
// It is fully idempotent: re-running creates nothing new and only reports counts.
// All writes are scoped to the Elton organization (multi-tenant safe).
// =============================================================================

// -----------------------------------------------------------------------------
// Confirmed real IDs (already validated against the database).
// -----------------------------------------------------------------------------
const ORGANIZATION_ID = "cmq7p932i0000xoc31tb9zro3";
const ACADEMIC_YEAR_ID = "cmq7vytfc004exoc3ln66x5v8"; // "2026": 2026-03-03 → 2026-10-30
const ACADEMIC_TERM_ID = "cmq7w05bg004gxoc3ygi5sfa1"; // "2 Trimestre": 2026-07-01 → 2026-08-28
const COURSE_ID = "cmq7ppl2t000kxoc3uaxlx77r";
const COURSE_LEVEL_ID = "cmq7pxe1v000xxoc32qmgdkr5";
const CLASS_GROUP_ID = "cmq7w5qx1004ixoc3rvmkryhj";

// -----------------------------------------------------------------------------
// Two demo assessment periods, both inside the "2 Trimestre" window
// (2026-07-01 → 2026-08-28) and therefore inside the academic year.
// Each period is upserted by its code (@@unique([organizationId, code])).
// -----------------------------------------------------------------------------
interface PeriodSpec {
  code: string;
  name: string;
  order: number;
  startDate: Date;
  endDate: Date;
  assessmentDate: Date; // event date, inside the period
  gradedAt: Date;
}

const PERIODS: PeriodSpec[] = [
  {
    code: "DEMO-P1-2026",
    name: "1º Período (Demo)",
    order: 1,
    startDate: new Date("2026-07-01T00:00:00Z"),
    endDate: new Date("2026-07-31T23:59:59Z"),
    assessmentDate: new Date("2026-07-15T09:00:00Z"),
    gradedAt: new Date("2026-07-20T12:00:00Z"),
  },
  {
    code: "DEMO-P2-2026",
    name: "2º Período (Demo)",
    order: 2,
    startDate: new Date("2026-08-01T00:00:00Z"),
    endDate: new Date("2026-08-28T23:59:59Z"),
    assessmentDate: new Date("2026-08-15T09:00:00Z"),
    gradedAt: new Date("2026-08-20T12:00:00Z"),
  },
];

// Enrollment date within the academic year (start of the term).
const ENROLLMENT_DATE = new Date("2026-07-02T09:00:00Z");

// -----------------------------------------------------------------------------
// Gradeable level subjects of the Beginner level. Each has one AssessmentPolicy
// and a set of AssessmentComponents. These IDs are reconfirmed at runtime before
// any write (defensive — fail loudly if the configuration drifted).
// -----------------------------------------------------------------------------
interface ComponentSpec {
  id: string;
  label: string;
}
interface SubjectSpec {
  label: string;
  levelSubjectId: string;
  subjectId: string;
  policyId: string;
  components: ComponentSpec[];
}

const SUBJECTS: SubjectSpec[] = [
  {
    label: "Gramática Inglesa",
    levelSubjectId: "cmq7ruka00039xoc3w6ais0yz",
    subjectId: "cmq7qcsc8001zxoc3o234f2az",
    policyId: "cmq929y3o000bggc375yiyd2p",
    components: [
      { id: "cmq92aty5000dggc3mbhbffpq", label: "Teste 1" },
      { id: "cmq92bkzw000fggc3sr3isoqm", label: "Teste 2" },
      { id: "cmq92c2v6000hggc3tclnoppe", label: "Exame Final" },
    ],
  },
  {
    label: "Conversação em Inglês",
    levelSubjectId: "cmq7rxt2u003dxoc3qk88opmi",
    subjectId: "cmq7qdxcs0023xoc355ix51a9",
    policyId: "cmq9cih2x001c68c315pkhduf",
    components: [
      { id: "cmq9cj63e001e68c3qgx5k9nr", label: "Componente 1" },
      { id: "cmq9cjq0a001g68c3dhq2bfw2", label: "Componente 2" },
      { id: "cmq9ckv5r001j68c31o3e7s9j", label: "Componente 3" },
    ],
  },
  {
    label: "Listening",
    levelSubjectId: "cmq7ryvh7003fxoc3bf9ojzq9",
    subjectId: "cmq7qedoi0025xoc3d0c9iei2",
    policyId: "cmq8hhivp000vbwc3xdyn54bl",
    components: [
      { id: "cmq91khy50001ggc3f3vn2w03", label: "Teste 1" },
      { id: "cmq91kzlx0003ggc3dj6urvh2", label: "Trabalho" },
      { id: "cmq91lhx70005ggc3ex9gc7c2", label: "Teste 2" },
    ],
  },
];

// -----------------------------------------------------------------------------
// 12 demo students — deterministic codes DEMO-ENG-001..DEMO-ENG-012.
// Realistic PT-PT names.
// -----------------------------------------------------------------------------
const STUDENT_NAMES: Array<{ firstName: string; lastName: string }> = [
  { firstName: "Ana", lastName: "Sousa" },
  { firstName: "Bruno", lastName: "Marques" },
  { firstName: "Carla", lastName: "Pereira" },
  { firstName: "Diogo", lastName: "Fernandes" },
  { firstName: "Eduarda", lastName: "Costa" },
  { firstName: "Filipe", lastName: "Rodrigues" },
  { firstName: "Gabriela", lastName: "Almeida" },
  { firstName: "Hugo", lastName: "Carvalho" },
  { firstName: "Inês", lastName: "Gonçalves" },
  { firstName: "João", lastName: "Ferreira" },
  { firstName: "Luísa", lastName: "Martins" },
  { firstName: "Miguel", lastName: "Ribeiro" },
];

function studentCode(index: number): string {
  return `DEMO-ENG-${String(index + 1).padStart(3, "0")}`;
}

// Deterministic, varied grade in the realistic 8–19 range. Pure function of the
// student index and a component salt so re-runs (and verification) are stable.
function deterministicGrade(studentIndex: number, salt: number): number {
  const v = 8 + ((studentIndex * 7 + salt * 13 + 5) % 12); // 8..19
  return v;
}

// -----------------------------------------------------------------------------
// Defensive precheck: reconfirm the configured components still exist.
// -----------------------------------------------------------------------------
async function reconfirmConfig(db: PrismaClient): Promise<void> {
  const errors: string[] = [];

  const org = await db.organization.findUnique({ where: { id: ORGANIZATION_ID } });
  if (!org) errors.push(`Organization ${ORGANIZATION_ID} not found.`);

  const year = await db.academicYear.findUnique({ where: { id: ACADEMIC_YEAR_ID } });
  if (!year) errors.push(`AcademicYear ${ACADEMIC_YEAR_ID} not found.`);

  const term = await db.academicTerm.findUnique({ where: { id: ACADEMIC_TERM_ID } });
  if (!term) errors.push(`AcademicTerm ${ACADEMIC_TERM_ID} not found.`);

  const classGroup = await db.classGroup.findUnique({ where: { id: CLASS_GROUP_ID } });
  if (!classGroup) errors.push(`ClassGroup ${CLASS_GROUP_ID} not found.`);
  else if (classGroup.organizationId !== ORGANIZATION_ID)
    errors.push(`ClassGroup ${CLASS_GROUP_ID} belongs to a different organization.`);

  for (const subject of SUBJECTS) {
    const policy = await db.assessmentPolicy.findUnique({ where: { id: subject.policyId } });
    if (!policy) {
      errors.push(`AssessmentPolicy ${subject.policyId} (${subject.label}) not found.`);
    } else if (policy.organizationId !== ORGANIZATION_ID) {
      errors.push(`AssessmentPolicy ${subject.policyId} belongs to a different organization.`);
    }

    for (const comp of subject.components) {
      const component = await db.assessmentComponent.findUnique({ where: { id: comp.id } });
      if (!component) {
        errors.push(`AssessmentComponent ${comp.id} (${subject.label} / ${comp.label}) not found.`);
      } else if (component.assessmentPolicyId !== subject.policyId) {
        errors.push(
          `AssessmentComponent ${comp.id} is not linked to policy ${subject.policyId} (${subject.label}).`
        );
      } else if (component.organizationId !== ORGANIZATION_ID) {
        errors.push(`AssessmentComponent ${comp.id} belongs to a different organization.`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Academic demo seed precheck failed:\n - ${errors.join("\n - ")}`);
  }
}

// -----------------------------------------------------------------------------
// Snapshot counts (org-scoped) for the before/after report.
// -----------------------------------------------------------------------------
async function snapshot(db: PrismaClient) {
  const [students, enrollments, periods, assessments, studentAssessmentResults, assessmentResults] =
    await Promise.all([
      db.student.count({ where: { organizationId: ORGANIZATION_ID } }),
      db.enrollment.count({ where: { organizationId: ORGANIZATION_ID } }),
      db.assessmentPeriod.count({ where: { organizationId: ORGANIZATION_ID } }),
      db.assessment.count({ where: { organizationId: ORGANIZATION_ID } }),
      db.studentAssessmentResult.count({ where: { organizationId: ORGANIZATION_ID } }),
      db.assessmentResult.count({ where: { organizationId: ORGANIZATION_ID } }),
    ]);
  return { students, enrollments, periods, assessments, studentAssessmentResults, assessmentResults };
}

// Returns the current max numeric enrollmentNumber for the org. The next free
// number is this value + 1.
async function maxEnrollmentNumber(db: PrismaClient): Promise<number> {
  const existing = await db.enrollment.findMany({
    where: { organizationId: ORGANIZATION_ID, enrollmentNumber: { not: null } },
    select: { enrollmentNumber: true },
  });
  let max = 0;
  for (const row of existing) {
    const n = Number(row.enrollmentNumber);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

async function main(): Promise<void> {
  const db = await getDb();

  console.log("== Academic demo seed (Elton Training Center / Inglês Beginner) ==\n");

  await reconfirmConfig(db);
  console.log("✓ Configuration reconfirmed (org, year, term, class group, policies, components).\n");

  const before = await snapshot(db);

  const created = {
    students: 0,
    enrollments: 0,
    periods: 0,
    assessments: 0,
    studentAssessmentResults: 0,
    assessmentResults: 0,
  };
  const skipped = {
    students: 0,
    enrollments: 0,
    periods: 0,
    assessments: 0,
    studentAssessmentResults: 0,
    assessmentResults: 0,
  };

  // ---------------------------------------------------------------------------
  // 1) Students — skip-if-exists by deterministic code.
  // ---------------------------------------------------------------------------
  const studentIdByIndex: string[] = [];
  for (let i = 0; i < STUDENT_NAMES.length; i++) {
    const code = studentCode(i);
    const { firstName, lastName } = STUDENT_NAMES[i];

    let student = await db.student.findFirst({
      where: { organizationId: ORGANIZATION_ID, code },
    });

    if (student) {
      skipped.students++;
    } else {
      student = await db.student.create({
        data: {
          organizationId: ORGANIZATION_ID,
          branchId: null,
          code,
          firstName,
          lastName,
          email: `${code.toLowerCase()}@demo.elton.local`,
          status: "ACTIVE",
        },
      });
      created.students++;
    }
    studentIdByIndex.push(student.id);
  }

  // ---------------------------------------------------------------------------
  // 2) Enrollments — one ACTIVE enrollment per student. Skip-if-exists by the
  //    (student, course, courseLevel, academicYear) tuple. New enrollment
  //    numbers continue after the current org max (no collisions).
  // ---------------------------------------------------------------------------
  let enrollmentSeq = await maxEnrollmentNumber(db);
  const enrollmentIdByIndex: string[] = [];
  let newEnrollmentsForClassGroup = 0;

  for (let i = 0; i < studentIdByIndex.length; i++) {
    const studentId = studentIdByIndex[i];

    let enrollment = await db.enrollment.findFirst({
      where: {
        organizationId: ORGANIZATION_ID,
        studentId,
        courseId: COURSE_ID,
        courseLevelId: COURSE_LEVEL_ID,
        academicYearId: ACADEMIC_YEAR_ID,
      },
    });

    if (enrollment) {
      skipped.enrollments++;
    } else {
      enrollmentSeq++;
      const enrollmentNumber = String(enrollmentSeq).padStart(6, "0");
      enrollment = await db.enrollment.create({
        data: {
          organizationId: ORGANIZATION_ID,
          branchId: null,
          studentId,
          courseId: COURSE_ID,
          courseLevelId: COURSE_LEVEL_ID,
          classGroupId: CLASS_GROUP_ID,
          academicYearId: ACADEMIC_YEAR_ID,
          academicTermId: ACADEMIC_TERM_ID,
          enrollmentNumber,
          enrollmentDate: ENROLLMENT_DATE,
          initialLevelId: COURSE_LEVEL_ID,
          currentLevelId: COURSE_LEVEL_ID,
          status: "ACTIVE",
        },
      });
      created.enrollments++;
      newEnrollmentsForClassGroup++;
    }
    enrollmentIdByIndex.push(enrollment.id);
  }

  // Keep ClassGroup.currentCount in sync with the newly created enrollments only.
  if (newEnrollmentsForClassGroup > 0) {
    await db.classGroup.update({
      where: { id: CLASS_GROUP_ID },
      data: { currentCount: { increment: newEnrollmentsForClassGroup } },
    });
    console.log(`✓ ClassGroup.currentCount incremented by ${newEnrollmentsForClassGroup}.`);
  }

  // ---------------------------------------------------------------------------
  // 3) Two assessment periods — upsert by (org, code).
  // 4) Assessment events (1 per component, per period) + grades.
  //
  // For each period we generate the full set of events/grades. Grades vary by
  // student, component AND period (period.order folded into the salt) so the
  // two periods don't carry identical numbers.
  // ---------------------------------------------------------------------------
  for (const periodSpec of PERIODS) {
    let period = await db.assessmentPeriod.findFirst({
      where: { organizationId: ORGANIZATION_ID, code: periodSpec.code },
    });
    if (period) {
      skipped.periods++;
    } else {
      period = await db.assessmentPeriod.create({
        data: {
          organizationId: ORGANIZATION_ID,
          academicYearId: ACADEMIC_YEAR_ID,
          academicTermId: ACADEMIC_TERM_ID,
          name: periodSpec.name,
          code: periodSpec.code,
          startDate: periodSpec.startDate,
          endDate: periodSpec.endDate,
          order: periodSpec.order,
          status: "ACTIVE",
        },
      });
      created.periods++;
    }
    const periodId = period.id;

    for (const subject of SUBJECTS) {
      for (let cIdx = 0; cIdx < subject.components.length; cIdx++) {
        const comp = subject.components[cIdx];
        const component = await db.assessmentComponent.findUniqueOrThrow({
          where: { id: comp.id },
        });
        const maxScore = component.maxGrade; // Decimal (20)

        // Assessment event — skip-if-exists by (period, component, classGroup).
        let assessment = await db.assessment.findFirst({
          where: {
            organizationId: ORGANIZATION_ID,
            assessmentPeriodId: periodId,
            assessmentComponentId: comp.id,
            classGroupId: CLASS_GROUP_ID,
          },
        });
        if (assessment) {
          skipped.assessments++;
        } else {
          assessment = await db.assessment.create({
            data: {
              organizationId: ORGANIZATION_ID,
              assessmentPolicyId: subject.policyId,
              assessmentComponentId: comp.id,
              assessmentPeriodId: periodId,
              academicYearId: ACADEMIC_YEAR_ID,
              academicTermId: ACADEMIC_TERM_ID,
              classGroupId: CLASS_GROUP_ID,
              courseId: COURSE_ID,
              courseLevelId: COURSE_LEVEL_ID,
              levelSubjectId: subject.levelSubjectId,
              subjectId: subject.subjectId,
              title: `${subject.label} — ${comp.label} (${periodSpec.name})`,
              assessmentDate: periodSpec.assessmentDate,
              maxScore,
              status: "GRADED",
            },
          });
          created.assessments++;
        }
        const assessmentId = assessment.id;

        // Grades — one per enrolled student.
        const salt = cIdx + subject.label.length + periodSpec.order * 3;
        for (let sIdx = 0; sIdx < studentIdByIndex.length; sIdx++) {
          const studentId = studentIdByIndex[sIdx];
          const enrollmentId = enrollmentIdByIndex[sIdx];
          const grade = deterministicGrade(sIdx, salt);
          const normalizedGrade = grade; // maxGrade is 20 → normalized to /20 equals grade

          // 4a) StudentAssessmentResult — unified engine; unique [enrollment, component].
          // NOTE: this unique is per (enrollment, component) regardless of period.
          // With two periods reusing the same components we cannot store two SAR
          // rows per component for the same enrollment, so the SAR (continuous
          // grade book) is written once per component and reflects the LATEST
          // period processed. The full per-period detail lives in the Assessment
          // events + AssessmentResult rows below.
          const existingSar = await db.studentAssessmentResult.findUnique({
            where: {
              enrollmentId_assessmentComponentId: {
                enrollmentId,
                assessmentComponentId: comp.id,
              },
            },
          });
          if (existingSar) {
            skipped.studentAssessmentResults++;
          } else {
            await db.studentAssessmentResult.create({
              data: {
                organizationId: ORGANIZATION_ID,
                enrollmentId,
                studentId,
                levelSubjectId: subject.levelSubjectId,
                subjectId: subject.subjectId,
                assessmentComponentId: comp.id,
                assessmentEventId: assessmentId,
                sourceType: "SCHEDULED_EVENT",
                grade,
                maxGrade: 20,
                normalizedGrade,
                status: "GRADED",
                gradedAt: periodSpec.gradedAt,
              },
            });
            created.studentAssessmentResults++;
          }

          // 4b) AssessmentResult — event model; unique [assessment, student].
          // This is per-event, so each period gets its own distinct rows.
          const existingAr = await db.assessmentResult.findUnique({
            where: { assessmentId_studentId: { assessmentId, studentId } },
          });
          if (existingAr) {
            skipped.assessmentResults++;
          } else {
            await db.assessmentResult.create({
              data: {
                organizationId: ORGANIZATION_ID,
                assessmentId,
                studentId,
                enrollmentId,
                score: grade,
                normalizedScore: normalizedGrade,
                status: "GRADED",
                gradedAt: periodSpec.gradedAt,
              },
            });
            created.assessmentResults++;
          }
        }
      }
    }
  }

  const after = await snapshot(db);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n== Resumo ==");
  console.log("Criados:", created);
  console.log("Já existentes (ignorados):", skipped);
  console.log("\n== Contagens (org Elton) ==");
  console.table({
    Antes: before,
    Depois: after,
  });

  console.log("\n✓ Academic demo seed concluído.");
}

main()
  .then(async () => {
    const db = await getDb();
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("✗ Academic demo seed falhou:");
    console.error(err);
    try {
      const db = await getDb();
      await db.$disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
