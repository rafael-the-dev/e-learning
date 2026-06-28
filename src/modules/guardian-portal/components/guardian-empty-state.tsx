import { Users } from "lucide-react";
import { EmptyState } from "@/shared/components/layout/empty-state";

/**
 * Blocked state shown when a guardian account has no ACTIVE student links.
 * Mirrors the Student/Teacher Portal "not linked" gate.
 */
export function GuardianEmptyState() {
  return (
    <EmptyState
      icon={<Users className="size-8" />}
      title="Esta conta ainda não tem alunos associados."
      description="Contacte a secretaria para associar os seus educandos a esta conta de encarregado."
    />
  );
}
