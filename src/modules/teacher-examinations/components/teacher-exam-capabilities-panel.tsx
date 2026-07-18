import { CheckCircle2, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import type { TeacherExamCapabilitiesDto } from "@/modules/teacher-examinations/types";

// Informational-only view of the teacher's OWN capabilities on the session.
// Sprint 1 = READS ONLY: this shows availability/block state as text — there are
// deliberately NO action buttons. The engine remains the sole authority.

function CapabilityRow({ label, blockReason }: { label: string; blockReason: string | null }) {
  const available = blockReason == null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        {!available && <p className="text-xs text-muted-foreground">{blockReason}</p>}
      </div>
      {available ? (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="size-3.5" /> Disponível
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1">
          <Lock className="size-3.5" /> Bloqueado
        </Badge>
      )}
    </div>
  );
}

export function TeacherExamCapabilitiesPanel({
  capabilities,
}: {
  capabilities: TeacherExamCapabilitiesDto;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">As tuas capacidades</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <CapabilityRow label="Presença" blockReason={capabilities.attendanceBlockReason} />
        <CapabilityRow label="Resultados" blockReason={capabilities.resultsBlockReason} />
      </CardContent>
    </Card>
  );
}
