import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { calculateStudentSubjectAttendance } from "@/modules/attendance/services/attendance-calculator.service";

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.ATTENDANCE_SESSIONS_VIEW);
    const { searchParams } = req.nextUrl;
    const classGroupId = searchParams.get("classGroupId");

    if (!classGroupId) {
      return NextResponse.json({ error: "classGroupId obrigatório" }, { status: 400 });
    }

    const db = await getDb();

    const classGroup = await db.classGroup.findFirst({
      where: { id: classGroupId, organizationId: context.organizationId, deletedAt: null },
      select: { id: true, courseLevelId: true, academicYearId: true, academicTermId: true },
    });
    if (!classGroup?.courseLevelId) {
      return NextResponse.json([]);
    }

    const [enrollments, levelSubjects] = await Promise.all([
      db.enrollment.findMany({
        where: {
          classGroupId,
          organizationId: context.organizationId,
          status: "ACTIVE",
          deletedAt: null,
        },
        select: {
          id: true,
          studentId: true,
          student: { select: { id: true, firstName: true, lastName: true, code: true } },
        },
        orderBy: [{ student: { firstName: "asc" } }],
      }),
      db.levelSubject.findMany({
        where: {
          courseLevelId: classGroup.courseLevelId,
          organizationId: context.organizationId,
          status: "ACTIVE",
          deletedAt: null,
        },
        select: { id: true },
        orderBy: { order: "asc" },
      }),
    ]);

    const report = await Promise.all(
      enrollments.map(async (enrollment) => {
        const subjects = await Promise.all(
          levelSubjects.map((ls) =>
            calculateStudentSubjectAttendance(
              enrollment.studentId,
              enrollment.id,
              classGroupId,
              ls.id,
              context.organizationId
            ).catch(() => null)
          )
        );

        return {
          studentId: enrollment.studentId,
          studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
          studentCode: enrollment.student.code,
          subjects: subjects.filter(Boolean),
        };
      })
    );

    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
