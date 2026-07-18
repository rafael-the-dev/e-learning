import { UserX } from "lucide-react";
import { EmptyState } from "@/shared/components/layout/empty-state";

// The SAME "conta não vinculada" empty state used by the student portal home,
// shown when the authenticated user has no linked Student profile.
export function StudentUnlinkedState() {
  return (
    <EmptyState
      icon={<UserX className="size-8" />}
      title="Esta conta ainda não está vinculada a um perfil de aluno."
      description="Contacte a secretaria para associar a sua conta a um perfil de aluno existente."
    />
  );
}
