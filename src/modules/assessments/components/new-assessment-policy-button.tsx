"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { AssessmentPolicyDrawer } from "./assessment-policy-drawer";

interface Props {
  levelSubjectOptions: { id: string; subjectName: string; courseLevelName: string }[];
}

export function NewAssessmentPolicyButton({ levelSubjectOptions }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1.5" />
        Nova Política
      </Button>
      <AssessmentPolicyDrawer
        open={open}
        onClose={() => setOpen(false)}
        levelSubjectOptions={levelSubjectOptions}
      />
    </>
  );
}
