import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { UsersRound } from "lucide-react";
import type { TeacherClassGroupRow } from "@/modules/teacher-portal/types";

interface Props {
  classGroups: TeacherClassGroupRow[];
  total: number;
  canViewOrgWide: boolean;
}

export function TeacherMyClasses({ classGroups, total, canViewOrgWide }: Props) {
  return (
    <Card id="my-classes">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersRound className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">As Minhas Turmas</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">{total}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {classGroups.length === 0 ? (
          <EmptyState
            icon={<UsersRound className="size-8" />}
            title="Sem turmas ativas."
            description="Ainda não tem turmas atribuídas."
            className="border-0"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Turma</th>
                    <th className="py-2 pr-3 font-medium">Curso / Nível</th>
                    <th className="py-2 pr-3 font-medium">Alunos</th>
                    <th className="py-2 pr-3 font-medium">Ocupação</th>
                    <th className="py-2 pr-3 font-medium">Próxima Aula</th>
                    <th className="py-2 pr-3 font-medium">Presença</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {classGroups.map((cg) => (
                    <tr key={cg.id}>
                      <td className="py-2.5 pr-3 font-medium">{cg.name}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {cg.courseName}
                        {cg.courseLevelName ? ` · ${cg.courseLevelName}` : ""}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">{cg.studentCount}/{cg.capacity}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{cg.occupancyPercent}%</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{cg.nextClassLabel ?? "—"}</td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        {cg.attendanceRate != null ? `${cg.attendanceRate}%` : "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/class-groups/${cg.id}`}>Abrir</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canViewOrgWide && (
              <div className="mt-3 flex justify-end">
                <Button asChild size="sm" variant="outline">
                  <Link href="/class-groups">Ver todas</Link>
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
