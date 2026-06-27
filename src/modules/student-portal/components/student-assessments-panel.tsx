import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { ClipboardList } from "lucide-react";
import { ASSESSMENT_STATUS_LABELS } from "@/modules/student-portal/types";
import type { StudentAssessmentRow } from "@/modules/student-portal/types";

interface Props {
  assessments: StudentAssessmentRow[];
}

export function StudentAssessmentsPanel({ assessments }: Props) {
  return (
    <Card id="avaliacoes" className="scroll-mt-20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Avaliações</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {assessments.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-8" />}
            title="Sem avaliações para apresentar."
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Avaliação</TableHead>
                  <TableHead>Disciplina</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((a) => (
                  <TableRow key={a.assessmentId}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>{a.subjectName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.assessmentDate.toLocaleDateString("pt-PT")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.isPublished ? "success" : "secondary"}>
                        {a.isPublished ? "Publicada" : ASSESSMENT_STATUS_LABELS[a.status] ?? a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Score is shown only once results are published. */}
                      {a.isPublished && a.score != null ? `${a.score} / ${a.maxScore}` : "—"}
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
