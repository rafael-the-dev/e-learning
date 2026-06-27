import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { PenLine } from "lucide-react";
import { STUDENT_GRADE_STATUS_LABELS } from "@/modules/student-portal/types";
import type { StudentGradeRow } from "@/modules/student-portal/types";

interface Props {
  grades: StudentGradeRow[];
}

export function StudentGradesPanel({ grades }: Props) {
  return (
    <Card id="notas" className="scroll-mt-20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <PenLine className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Notas Publicadas</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {grades.length === 0 ? (
          <EmptyState
            icon={<PenLine className="size-8" />}
            title="Ainda não há notas publicadas."
            description="As notas aparecem aqui assim que o professor as publicar."
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Disciplina</TableHead>
                  <TableHead>Avaliação</TableHead>
                  <TableHead className="text-right">Nota</TableHead>
                  <TableHead className="text-right">Percentagem</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Publicada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.subjectName}</TableCell>
                    <TableCell>{g.assessmentTitle}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {g.score} / {g.maxScore}
                    </TableCell>
                    <TableCell className="text-right">{g.percentage}%</TableCell>
                    <TableCell>
                      <Badge variant={g.percentage >= 50 ? "success" : "destructive"}>
                        {STUDENT_GRADE_STATUS_LABELS[g.status] ?? g.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {g.publishedAt ? g.publishedAt.toLocaleDateString("pt-PT") : "—"}
                    </TableCell>
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
