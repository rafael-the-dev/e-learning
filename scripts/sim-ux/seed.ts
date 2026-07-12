import "dotenv/config";
import bcrypt from "bcryptjs";
import { getDb } from "../../src/server/db";
import { SYSTEM_ROLES } from "../../src/server/auth/permissions";

// =============================================================================
// SIM-UX — isolated UX-simulation fixture (Sprint 2.1 gate).
// Creates a DEDICATED test organization with an org-admin login and 250 students
// with ACTIVE enrollments so the examinations portal can be driven end-to-end at
// season scale. Everything is scoped to ORG_ID and removable by scripts/sim-ux/teardown.ts.
// Idempotent (stable ids + upsert). Requires the base `pnpm db:seed` (ORG_ADMIN role).
// =============================================================================

const ORG_ID = "simux-org";
const USER_EMAIL = "secretaria@sim-ux.test";
const N = 250;

async function main(): Promise<void> {
  const db = await getDb();

  await db.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: "SIM-UX (teste UX)", slug: "sim-ux-teste" },
  });

  await db.branch.upsert({
    where: { id: "simux-branch" },
    update: {},
    create: { id: "simux-branch", organizationId: ORG_ID, name: "Sede" },
  });

  await db.academicYear.upsert({
    where: { id: "simux-ay" },
    update: {},
    create: {
      id: "simux-ay",
      organizationId: ORG_ID,
      name: "2026",
      code: "SIMUX-2026",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
    },
  });

  await db.subject.upsert({ where: { id: "simux-subj" }, update: {}, create: { id: "simux-subj", organizationId: ORG_ID, name: "Inglês" } });
  await db.course.upsert({ where: { id: "simux-course" }, update: {}, create: { id: "simux-course", organizationId: ORG_ID, name: "Inglês Geral" } });
  await db.courseLevel.upsert({ where: { id: "simux-level" }, update: {}, create: { id: "simux-level", courseId: "simux-course", name: "Iniciante" } });
  await db.levelSubject.upsert({
    where: { id: "simux-ls" },
    update: {},
    create: { id: "simux-ls", organizationId: ORG_ID, courseId: "simux-course", courseLevelId: "simux-level", subjectId: "simux-subj" },
  });

  await db.examRoom.upsert({ where: { id: "simux-room-a" }, update: {}, create: { id: "simux-room-a", organizationId: ORG_ID, branchId: "simux-branch", name: "Sala A", capacity: 150 } });
  await db.examRoom.upsert({ where: { id: "simux-room-b" }, update: {}, create: { id: "simux-room-b", organizationId: ORG_ID, branchId: "simux-branch", name: "Sala B", capacity: 300 } });

  for (let i = 1; i <= 3; i++) {
    await db.teacher.upsert({
      where: { id: `simux-teacher-${i}` },
      update: {},
      create: { id: `simux-teacher-${i}`, organizationId: ORG_ID, branchId: "simux-branch", firstName: "Vigilante", lastName: `${i}`, status: "ACTIVE" },
    });
  }

  // Org-admin login (ORG_ADMIN grants exams.* via Object.values).
  const passwordHash = await bcrypt.hash("123456", 12);
  const user = await db.user.upsert({
    where: { email: USER_EMAIL },
    update: { passwordHash, isActive: true },
    create: { id: "simux-user", email: USER_EMAIL, name: "Secretaria SIM-UX", passwordHash, isActive: true },
  });
  const orgAdmin = await db.role.findFirst({ where: { name: SYSTEM_ROLES.ORG_ADMIN, isSystem: true, organizationId: null }, select: { id: true } });
  if (!orgAdmin) throw new Error("ORG_ADMIN role not found — run `pnpm db:seed` first.");
  await db.userOrganization.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: ORG_ID } },
    update: {},
    create: { userId: user.id, organizationId: ORG_ID },
  });
  await db.userRole.upsert({
    where: { userId_roleId_organizationId: { userId: user.id, roleId: orgAdmin.id, organizationId: ORG_ID } },
    update: {},
    create: { userId: user.id, roleId: orgAdmin.id, organizationId: ORG_ID },
  });

  // 250 students + ACTIVE enrollments (distinct enrollmentNumber — SQL Server one-NULL @unique rule).
  for (let i = 1; i <= N; i++) {
    const num = String(i).padStart(4, "0");
    const sid = `simux-stu-${i}`;
    await db.student.upsert({
      where: { id: sid },
      update: {},
      create: { id: sid, organizationId: ORG_ID, branchId: "simux-branch", firstName: "Aluno", lastName: num, code: `SIMUX-STU-${num}` },
    });
    await db.enrollment.upsert({
      where: { id: `simux-enr-${i}` },
      update: { status: "ACTIVE" },
      create: {
        id: `simux-enr-${i}`,
        organizationId: ORG_ID,
        studentId: sid,
        courseId: "simux-course",
        academicYearId: "simux-ay",
        branchId: "simux-branch",
        currentLevelId: "simux-level",
        enrollmentNumber: `SIMUX-ENR-${num}`,
        status: "ACTIVE",
      },
    });
    if (i % 50 === 0) console.log(`  …${i}/${N} students`);
  }

  console.log(`\nSIM-UX ready.`);
  console.log(`  Org:      ${ORG_ID}`);
  console.log(`  Login:    ${USER_EMAIL} / 123456`);
  console.log(`  Students: ${N} (course "Inglês Geral" / level "Iniciante")`);
  console.log(`  Rooms:    Sala A (150), Sala B (300); Teachers: 3; LevelSubject: simux-ls`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
