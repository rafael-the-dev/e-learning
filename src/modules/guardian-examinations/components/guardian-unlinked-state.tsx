import { Users } from "lucide-react";
import { EmptyState } from "@/shared/components/layout/empty-state";

/**
 * Blocked state shown in the Guardian Examination Portal when the account has no
 * ACTIVE student links (overview.hasLinks === false). Mirrors the guardian portal
 * "not linked" gate; the secretaria is who links educandos to a guardian account.
 */
export function GuardianUnlinkedState() {
  return (
    <EmptyState
      icon={<Users className="size-8" />}
      title="Esta conta não está associada a nenhum educando."
      description="Contacte a secretaria para associar os seus educandos a esta conta de encarregado."
    />
  );
}
