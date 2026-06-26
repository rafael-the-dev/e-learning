import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components/ui/tabs";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ClipboardList, CheckSquare, ClipboardCheck, Send } from "lucide-react";
import type { TeacherPendingWork } from "@/modules/teacher-portal/types";

interface Props {
  pendingWork: TeacherPendingWork;
}

export function TeacherPendingWorkCard({ pendingWork }: Props) {
  const { attendancePending, assessmentsToGrade, resultsToPublish } = pendingWork;

  return (
    <Card id="pending-work">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Trabalho Pendente</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="attendance">
          <TabsList>
            <TabsTrigger value="attendance">Presenças ({attendancePending.length})</TabsTrigger>
            <TabsTrigger value="grading">Avaliações ({assessmentsToGrade.length})</TabsTrigger>
            <TabsTrigger value="publish">Publicar ({resultsToPublish.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance">
            {attendancePending.length === 0 ? (
              <EmptyState
                icon={<CheckSquare className="size-8" />}
                title="Sem presenças pendentes."
                className="border-0"
              />
            ) : (
              <ul className="divide-y">
                {attendancePending.map((row) => (
                  <li key={row.sessionId} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {row.classGroupName} <span className="text-muted-foreground">— {row.subjectName}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(row.sessionDate).toLocaleDateString("pt-PT")} às {row.startTime}
                      </p>
                    </div>
                    <Badge variant="warning" className="shrink-0">{row.missingCount} em falta</Badge>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`/attendance/sessions/${row.sessionId}/mark`}>Marcar</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="grading">
            {assessmentsToGrade.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="size-8" />}
                title="Sem avaliações por corrigir."
                className="border-0"
              />
            ) : (
              <ul className="divide-y">
                {assessmentsToGrade.map((row) => (
                  <li key={row.assessmentId} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{row.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.classGroupName} — {row.subjectName} · Prazo: {new Date(row.dueDate).toLocaleDateString("pt-PT")}
                      </p>
                    </div>
                    <Badge variant="info" className="shrink-0">
                      {row.submittedCount} entregues / {row.pendingCount} pendentes
                    </Badge>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`/assessments/${row.assessmentId}/grade`}>Corrigir</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="publish">
            {resultsToPublish.length === 0 ? (
              <EmptyState icon={<Send className="size-8" />} title="Sem resultados por publicar." className="border-0" />
            ) : (
              <ul className="divide-y">
                {resultsToPublish.map((row) => (
                  <li key={row.assessmentId} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{row.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.classGroupName} — {row.subjectName}
                      </p>
                    </div>
                    <Badge variant="success" className="shrink-0">{row.readyCount} prontos</Badge>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`/assessments/${row.assessmentId}`}>Publicar</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
