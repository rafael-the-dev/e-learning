"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { toast } from "@/shared/hooks/use-toast";
import { archiveClassroomAction } from "@/modules/classrooms/actions/classroom.actions";
import { Pencil, Archive } from "lucide-react";

interface ClassroomDetailActionsProps {
  classroomId: string;
  classroomName: string;
  canEdit: boolean;
  canArchive: boolean;
  isArchived: boolean;
}

export function ClassroomDetailActions({
  classroomId,
  classroomName,
  canEdit,
  canArchive,
  isArchived,
}: ClassroomDetailActionsProps) {
  const router = useRouter();
  const [showArchive, setShowArchive] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  async function handleArchive() {
    setIsProcessing(true);
    const res = await archiveClassroomAction(classroomId);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`"${classroomName}" arquivada`);
      setShowArchive(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        {canEdit && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/classrooms/${classroomId}/edit`}>
              <Pencil className="size-4 mr-1.5" />
              Editar
            </Link>
          </Button>
        )}
        {canArchive && !isArchived && (
          <Button size="sm" variant="outline" onClick={() => setShowArchive(true)}>
            <Archive className="size-4 mr-1.5" />
            Arquivar
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={showArchive}
        onOpenChange={setShowArchive}
        title="Arquivar Sala"
        description={`Tem a certeza que pretende arquivar "${classroomName}"?`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleArchive}
      />
    </>
  );
}
