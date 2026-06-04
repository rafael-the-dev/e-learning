"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Archive, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import {
  archiveCourseAction,
  deleteCourseAction,
} from "@/modules/courses/actions/course.actions";
import { toast } from "@/shared/hooks/use-toast";
import type { Course } from "@/modules/courses/types";

interface CourseDetailActionsProps {
  course: Course;
}

export function CourseDetailActions({ course }: CourseDetailActionsProps) {
  const router = useRouter();
  const [showArchive, setShowArchive] = React.useState(false);
  const [showDelete, setShowDelete] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  async function handleArchive() {
    setIsProcessing(true);
    const res = await archiveCourseAction(course.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Curso arquivado");
      setShowArchive(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    setIsProcessing(true);
    const res = await deleteCourseAction(course.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Curso eliminado");
      setShowDelete(false);
      router.push("/courses");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Ações</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {course.status !== "ARCHIVED" && (
            <DropdownMenuItem
              onClick={() => setShowArchive(true)}
              className="text-destructive focus:text-destructive"
            >
              <Archive className="size-4" />
              Arquivar Curso
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setShowDelete(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" />
            Eliminar Curso
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={showArchive}
        onOpenChange={setShowArchive}
        title="Arquivar Curso"
        description={`Tem a certeza que pretende arquivar "${course.name}"?`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Eliminar Curso"
        description={`Tem a certeza que pretende eliminar "${course.name}"? Esta ação é irreversível.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDelete}
      />
    </>
  );
}
