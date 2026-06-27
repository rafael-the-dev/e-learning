import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { CalendarDays } from "lucide-react";
import type { StudentUpcomingClass } from "@/modules/student-portal/types";

interface Props {
  classes: StudentUpcomingClass[];
}

export function StudentUpcomingClasses({ classes }: Props) {
  return (
    <Card id="aulas" className="scroll-mt-20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Próximas Aulas</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">Próximos 7 dias</span>
        </div>
      </CardHeader>
      <CardContent>
        {classes.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title="Sem aulas agendadas para os próximos 7 dias."
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Disciplina</TableHead>
                  <TableHead>Professor</TableHead>
                  <TableHead>Sala</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">
                      {c.sessionDate.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.startTime}–{c.endTime}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {c.subjectName}
                        {c.status === "CANCELLED" && <Badge variant="destructive">Cancelada</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>{c.teacherName ?? "—"}</TableCell>
                    <TableCell>{c.classroomName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
