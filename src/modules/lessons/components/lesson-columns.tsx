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
import { MoreHorizontal, Eye, Pencil, Send, Archive, Trash2 } from "lucide-react";
import {
  LESSON_STATUS_LABELS,
  LESSON_TYPE_LABELS,
  VIDEO_PROVIDER_LABELS,
} from "@/modules/lessons/types";
import type { Lesson } from "@/modules/lessons/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  ARCHIVED: "outline",
};

interface LessonColumnsOptions {
  onView: (lesson: Lesson) => void;
  onEdit: (lesson: Lesson) => void;
  onPublish: (lesson: Lesson) => void;
  onArchive: (lesson: Lesson) => void;
  onDelete: (lesson: Lesson) => void;
  canEdit: boolean;
  canPublish: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function getLessonColumns(options: LessonColumnsOptions): ColumnDef<Lesson>[] {
  return [
    {
      accessorKey: "title",
      header: "Título",
      cell: ({ row }) => (
        <div className="max-w-[280px]">
          <p className="font-medium truncate">{row.original.title}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.original.slug}</p>
        </div>
      ),
    },
    {
      accessorKey: "lessonType",
      header: "Tipo",
      cell: ({ row }) => (
        <span className="text-sm">{LESSON_TYPE_LABELS[row.original.lessonType] ?? row.original.lessonType}</span>
      ),
    },
    {
      accessorKey: "durationMinutes",
      header: "Duração",
      cell: ({ row }) => {
        const mins = row.original.durationMinutes;
        if (!mins) return <span className="text-muted-foreground text-sm">—</span>;
        return <span className="text-sm">{mins} min</span>;
      },
    },
    {
      accessorKey: "videoProvider",
      header: "Vídeo",
      cell: ({ row }) => {
        const p = row.original.videoProvider;
        if (p === "NONE") return <span className="text-muted-foreground text-sm">—</span>;
        return <span className="text-sm">{VIDEO_PROVIDER_LABELS[p] ?? p}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? "secondary"}>
          {LESSON_STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Criada em",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.createdAt.toLocaleDateString("pt-PT")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const lesson = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => options.onView(lesson)}>
                <Eye className="size-4 mr-2" />
                Ver Detalhe
              </DropdownMenuItem>
              {options.canEdit && (
                <DropdownMenuItem onClick={() => options.onEdit(lesson)}>
                  <Pencil className="size-4 mr-2" />
                  Editar
                </DropdownMenuItem>
              )}
              {options.canPublish && lesson.status === "DRAFT" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => options.onPublish(lesson)}>
                    <Send className="size-4 mr-2" />
                    Publicar
                  </DropdownMenuItem>
                </>
              )}
              {options.canArchive && lesson.status !== "ARCHIVED" && (
                <DropdownMenuItem onClick={() => options.onArchive(lesson)}>
                  <Archive className="size-4 mr-2" />
                  Arquivar
                </DropdownMenuItem>
              )}
              {options.canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => options.onDelete(lesson)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Eliminar
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
