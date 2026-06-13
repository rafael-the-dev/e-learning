import { getDb } from "@/server/db";

export interface GradeWatchlistItem {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  subjectName: string;
  finalGrade: number | null;
  status: string;
  enrollmentId: string;
}

export async function getGradeWatchlist(organizationId: string): Promise<GradeWatchlistItem[]> {
  const db = await getDb();

  const failed = await db.studentSubjectProgress.findMany({
    where: { organizationId, status: "FAILED" },
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: {
      id: true,
      studentId: true,
      enrollmentId: true,
      finalGrade: true,
      status: true,
      student: { select: { firstName: true, lastName: true, code: true } },
      levelSubject: { select: { subject: { select: { name: true } } } },
    },
  });

  return failed.map((f) => ({
    id: f.id,
    studentId: f.studentId,
    studentName: [f.student.firstName, f.student.lastName].filter(Boolean).join(" "),
    studentCode: f.student.code,
    subjectName: f.levelSubject?.subject?.name ?? "—",
    finalGrade: f.finalGrade != null ? Math.round(Number(f.finalGrade) * 10) / 10 : null,
    status: f.status,
    enrollmentId: f.enrollmentId,
  }));
}
