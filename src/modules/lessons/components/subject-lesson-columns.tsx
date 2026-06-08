"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { MoreHorizontal, Settings, Trash2 } from "lucide-react";
import { LESSON_TYPE_LABELS, LESSON_STATUS_LABELS } from "@/modules/lessons/types";
import type { SubjectLesson } from "@/modules/lessons/types";

interface SubjectLessonColumnsOptions {
  onEdit: (sl: SubjectLesson) => void;
  onRemove: (sl: SubjectLesson) => void;
  canEdit: boolean;
  canRemove: boolean;
}

export function getSubjectLessonColumns(
  options: SubjectLessonColumnsOptions
): ColumnDef<SubjectLesson>[] {
  return [
    {
      accessorKey: "order",
      header: "#",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm font-mono">{row.original.order + 1}</span>
      ),
    },
    {
      id: "lesson",
      header: "Lição",
      cell: ({ row }) => {
        const lesson = row.original.lesson;
        if (!lesson) return null;
        return (
          <div>
            <p className="font-medium">{lesson.title}</p>
            <p className="text-xs text-muted-foreground">
              {LESSON_TYPE_LABELS[lesson.lessonType] ?? lesson.lessonType}
              {lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ""}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "isRequired",
      header: "Obrigatória",
      cell: ({ row }) => (
        <Badge variant={row.original.isRequired ? "default" : "secondary"}>
          {row.original.isRequired ? "Obrigatória" : "Opcional"}
        </Badge>
      ),
    },
    {
      accessorKey: "minWatchPercentage",
      header: "Min. Visualização",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.minWatchPercentage}%</span>
      ),
    },
    {
      id: "lessonStatus",
      header: "Estado da Lição",
      cell: ({ row }) => {
        const status = row.original.lesson?.status;
        if (!status) return null;
        const variant =
          status === "PUBLISHED" ? "default" : status === "DRAFT" ? "secondary" : "outline";
        return (
          <Badge variant={variant}>
            {LESSON_STATUS_LABELS[status] ?? status}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const sl = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {options.canEdit && (
                <DropdownMenuItem onClick={() => options.onEdit(sl)}>
                  <Settings className="size-4 mr-2" />
                  Configurar
                </DropdownMenuItem>
              )}
              {options.canRemove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => options.onRemove(sl)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Remover
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
