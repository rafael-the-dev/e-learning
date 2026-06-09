"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import {
  AssignSubjectDrawer,
  EditLevelSubjectDrawer,
} from "@/modules/courses/components/level-subject-form";
import { removeSubjectFromLevelAction } from "@/modules/courses/actions/level-subject.actions";
import { toast } from "@/shared/hooks/use-toast";
import {
  BookOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  Award,
  CheckCircle2,
} from "lucide-react";
import type { LevelSubject, Subject } from "@/modules/courses/types";

interface LevelSubjectsPanelProps {
  courseId: string;
  courseLevelId: string;
  levelSubjects: LevelSubject[];
  availableSubjects: Subject[];
  canManage: boolean;
}

export function LevelSubjectsPanel({
  courseId,
  courseLevelId,
  levelSubjects,
  availableSubjects,
  canManage,
}: LevelSubjectsPanelProps) {
  const router = useRouter();
  const [showAssign, setShowAssign] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<LevelSubject | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<LevelSubject | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const assignedSubjectIds = new Set(levelSubjects.map((ls) => ls.subjectId));
  const unassignedSubjects = availableSubjects.filter(
    (s) => !assignedSubjectIds.has(s.id)
  );

  async function handleRemove() {
    if (!removeTarget) return;
    setIsProcessing(true);
    const res = await removeSubjectFromLevelAction(courseId, courseLevelId, removeTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Disciplina removida do nível");
      setRemoveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {levelSubjects.length} disciplina(s) associada(s)
          </p>
          {canManage && (
            <Button
              size="sm"
              onClick={() => setShowAssign(true)}
              disabled={unassignedSubjects.length === 0}
            >
              <Plus className="size-4 mr-1.5" />
              Associar Disciplina
            </Button>
          )}
        </div>

        {levelSubjects.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-8" />}
            title="Nenhuma disciplina associada"
            description="Associe disciplinas a este nível para definir o currículo."
          />
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Disciplina</TableHead>
                  <TableHead className="text-center">Carga (h)</TableHead>
                  <TableHead className="text-center">Nota mín.</TableHead>
                  <TableHead className="text-center">Freq. mín.</TableHead>
                  <TableHead className="text-center">Obrigatória</TableHead>
                  <TableHead className="text-center">Certificado</TableHead>
                  <TableHead>Estado</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {levelSubjects.map((ls) => (
                  <TableRow key={ls.id}>
                    {/* Ordem */}
                    <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                      {ls.order + 1}
                    </TableCell>

                    {/* Disciplina */}
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{ls.subjectName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {ls.subjectCode && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {ls.subjectCode}
                            </span>
                          )}
                          {ls.theoryHours != null || ls.practicalHours != null ? (
                            <span className="text-xs text-muted-foreground">
                              {[
                                ls.theoryHours != null ? `${ls.theoryHours}h T` : null,
                                ls.practicalHours != null ? `${ls.practicalHours}h P` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>

                    {/* Carga horária total */}
                    <TableCell className="text-center">
                      {ls.workloadHours != null ? (
                        <span className="text-sm tabular-nums">{ls.workloadHours}h</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Nota mínima */}
                    <TableCell className="text-center">
                      {ls.minimumPassingGrade != null ? (
                        <span className="text-sm tabular-nums">{ls.minimumPassingGrade}%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Frequência mínima */}
                    <TableCell className="text-center">
                      {ls.minimumAttendancePercentage != null ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm tabular-nums cursor-default">
                              {ls.minimumAttendancePercentage}%
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {ls.maxAbsences != null
                              ? `Máx. ${ls.maxAbsences} falta(s)`
                              : "Sem limite de faltas definido"}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Obrigatória */}
                    <TableCell className="text-center">
                      {ls.isRequired ? (
                        <Badge variant="secondary" className="text-xs">
                          <CheckCircle2 className="size-3 mr-1" />
                          Sim
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não</span>
                      )}
                    </TableCell>

                    {/* Certificado */}
                    <TableCell className="text-center">
                      {ls.certificateRequired ? (
                        <Badge variant="outline" className="text-xs">
                          <Award className="size-3 mr-1" />
                          Sim
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não</span>
                      )}
                    </TableCell>

                    {/* Estado */}
                    <TableCell>
                      <StatusBadge status={ls.status} />
                    </TableCell>

                    {/* Ações */}
                    {canManage && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditTarget(ls)}>
                              <Pencil className="size-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setRemoveTarget(ls)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-4" />
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {canManage && (
          <AssignSubjectDrawer
            courseId={courseId}
            courseLevelId={courseLevelId}
            availableSubjects={unassignedSubjects}
            open={showAssign}
            onOpenChange={setShowAssign}
            onSuccess={() => router.refresh()}
          />
        )}

        {editTarget && canManage && (
          <EditLevelSubjectDrawer
            courseId={courseId}
            courseLevelId={courseLevelId}
            levelSubject={editTarget}
            open={!!editTarget}
            onOpenChange={(open) => !open && setEditTarget(null)}
            onSuccess={() => router.refresh()}
          />
        )}

        <ConfirmDialog
          open={!!removeTarget}
          onOpenChange={(open) => !open && setRemoveTarget(null)}
          title="Remover Disciplina do Nível"
          description={`Tem a certeza que pretende remover "${removeTarget?.subjectName}" deste nível?`}
          confirmLabel="Remover"
          variant="destructive"
          loading={isProcessing}
          onConfirm={handleRemove}
        />
      </div>
    </TooltipProvider>
  );
}
