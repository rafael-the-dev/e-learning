"use client";

import { useState, useEffect } from "react";
import { ClipboardCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/shared/components/ui/sheet";
import { SubjectPolicyPanel } from "@/modules/grades/components/subject-policy-panel";
import { fetchLevelSubjectPolicyAction } from "@/modules/grades/actions/grade.actions";
import type { LevelSubjectPolicyData } from "@/modules/grades/actions/grade.actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  levelSubjectId: string;
  subjectName: string;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canManageComponents: boolean;
}

export function LevelSubjectPolicyDrawer({
  open,
  onOpenChange,
  levelSubjectId,
  subjectName,
  canCreate,
  canEdit,
  canArchive,
  canManageComponents,
}: Props) {
  const [data, setData] = useState<LevelSubjectPolicyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetchLevelSubjectPolicyAction(levelSubjectId);
    if (res.success && res.data) {
      setData(res.data);
    } else if (!res.success) {
      setError(res.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
  }, [open, levelSubjectId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            <SheetTitle>Política de Avaliação</SheetTitle>
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
          <SubjectPolicyPanel
            levelSubjectId={levelSubjectId}
            policy={data.policy}
            components={data.components}
            canCreate={canCreate}
            canEdit={canEdit}
            canArchive={canArchive}
            canManageComponents={canManageComponents}
            onMutate={load}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
