import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { BookOpen } from "lucide-react";
import {
  TeacherSubjectsAssignControl,
  TeacherSubjectRemoveButton,
} from "@/modules/teachers/teacher-360/components/tabs/teacher-subjects-manager";
import type { TeacherWithSubjects } from "@/modules/teachers/types";
import type { TeacherSubjectTabRow } from "@/modules/teachers/teacher-360/repositories/teacher-360.repository";
import type { Subject } from "@/modules/courses/types";

interface TeacherSubjectsTabProps {
  teacher: TeacherWithSubjects;
  rows: TeacherSubjectTabRow[];
  availableSubjects: Subject[];
  canAssign: boolean;
  canRemove: boolean;
}

export function TeacherSubjectsTab({
  teacher,
  rows,
  availableSubjects,
  canAssign,
  canRemove,
}: TeacherSubjectsTabProps) {
  const rowsBySubject = new Map(rows.map((r) => [r.subjectId, r]));

  return (
    <div className="space-y-6">
      {canAssign && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Atribuir Disciplina</CardTitle>
          </CardHeader>
          <CardContent>
            <TeacherSubjectsAssignControl
              teacherId={teacher.id}
              availableSubjects={availableSubjects}
              canAssign={canAssign}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Disciplinas Atribuídas</CardTitle>
        </CardHeader>
        <CardContent>
          {teacher.teacherSubjects.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="size-8" />}
              title="Nenhuma disciplina atribuída"
              description="As disciplinas podem ser atribuídas após configurar os cursos."
            />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Disciplina</th>
                    <th className="px-3 py-2">Turmas Associadas</th>
                    <th className="px-3 py-2">Alunos</th>
                    <th className="px-3 py-2">Carga Horária</th>
                    {canRemove && <th className="px-3 py-2 w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {teacher.teacherSubjects.map((ts) => {
                    const row = rowsBySubject.get(ts.subjectId);
                    return (
                      <tr key={ts.id}>
                        <td className="px-3 py-2 font-medium">
                          {ts.subjectName}
                          {ts.subjectCode && <span className="text-muted-foreground"> ({ts.subjectCode})</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row?.classGroupCount ?? 0}</td>
                        <td className="px-3 py-2 tabular-nums">{row?.studentCount ?? 0}</td>
                        <td className="px-3 py-2">{row?.workloadHours != null ? `${row.workloadHours}h` : "—"}</td>
                        {canRemove && (
                          <td className="px-3 py-2">
                            <TeacherSubjectRemoveButton
                              teacherId={teacher.id}
                              subjectId={ts.subjectId}
                              subjectName={ts.subjectName}
                              canRemove={canRemove}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
