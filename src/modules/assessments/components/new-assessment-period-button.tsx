"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { AssessmentPeriodDrawer } from "./assessment-period-drawer";

export function NewAssessmentPeriodButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1.5" />
        Novo Período
      </Button>
      <AssessmentPeriodDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
