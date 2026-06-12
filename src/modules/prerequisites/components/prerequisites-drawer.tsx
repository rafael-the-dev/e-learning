"use client";

import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/shared/components/ui/sheet";
import { SubjectPrerequisitesPanel } from "@/modules/prerequisites/components/subject-prerequisites-panel";
import { fetchLevelSubjectPrerequisitesAction } from "@/modules/prerequisites/actions/prerequisite.actions";
import type { PrerequisiteDrawerData } from "@/modules/prerequisites/actions/prerequisite.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  levelSubjectId: string;
  subjectName: string;
  canManage: boolean;
}

export function PrerequisitesDrawer({
  open,
  onOpenChange,
  levelSubjectId,
  subjectName,
  canManage,
}: Props) {
  const [data, setData] = useState<PrerequisiteDrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetchLevelSubjectPrerequisitesAction(levelSubjectId).then((res) => {
      if (res.success && res.data) {
        setData(res.data);
      } else if (!res.success) {
        setError(res.error);
      }
      setLoading(false);
    });
  }, [open, levelSubjectId]);

  // Refresh data after mutations inside the panel
  function handleRefresh() {
    setLoading(true);
    fetchLevelSubjectPrerequisitesAction(levelSubjectId).then((res) => {
      if (res.success && res.data) setData(res.data);
      setLoading(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            <SheetTitle>Pré-requisitos</SheetTitle>
          </div>
          <SheetDescription>{subjectName}</SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            A carregar...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {data && !loading && (
          <SubjectPrerequisitesPanel
            levelSubjectId={levelSubjectId}
            groups={data.groups}
            availableLevelSubjects={data.availableLevelSubjects}
            canManage={canManage}
            onMutate={handleRefresh}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
