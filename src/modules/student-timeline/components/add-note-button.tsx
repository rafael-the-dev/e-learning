"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Plus } from "lucide-react";
import { AddNoteDialog } from "./add-note-dialog";

export function AddNoteButton({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1.5" />
        Adicionar Nota
      </Button>
      <AddNoteDialog studentId={studentId} open={open} onOpenChange={setOpen} />
    </>
  );
}
