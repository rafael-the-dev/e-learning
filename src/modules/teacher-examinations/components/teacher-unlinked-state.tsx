import { UserX } from "lucide-react";
import { EmptyState } from "@/shared/components/layout/empty-state";

// Shown when the authenticated user has no linked Teacher profile. Mirrors the
// teacher portal home empty state.
export function TeacherUnlinkedState() {
  return (
    <EmptyState
      icon={<UserX className="size-8" />}
      title="Esta conta ainda não está vinculada a um perfil de docente."
      description="Contacte um administrador para associar a sua conta a um perfil de docente existente."
    />
  );
}
