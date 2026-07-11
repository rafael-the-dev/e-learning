"use client";

import { useQuery } from "@tanstack/react-query";
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
  // Fetch-on-open via TanStack Query (enabled: open) instead of a useEffect that
  // sets state synchronously — the latter trips react-hooks/set-state-in-effect and
  // causes an extra render. refetch() drives the post-mutation refresh.
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["level-subject-prerequisites", levelSubjectId],
    queryFn: async () => {
      const res = await fetchLevelSubjectPrerequisitesAction(levelSubjectId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: open,
  });

  const errorMessage = error instanceof Error ? error.message : null;

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

        {isFetching && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            A carregar...
          </div>
        )}

        {errorMessage && !isFetching && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {data && !isFetching && (
          <SubjectPrerequisitesPanel
            levelSubjectId={levelSubjectId}
            groups={data.groups}
            availableLevelSubjects={data.availableLevelSubjects}
            canManage={canManage}
            onMutate={() => {
              refetch();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
