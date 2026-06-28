import Link from "next/link";
import { FileText, Info } from "lucide-react";
import type { SecretaryDocumentsCompliance } from "@/modules/secretary-portal/types";

interface Props {
  compliance: SecretaryDocumentsCompliance;
}

export function SecretaryDocumentsCompliance({ compliance }: Props) {
  return (
    <div className="space-y-3">
      <Link
        href="/students"
        className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
      >
        <span className="rounded-md bg-muted/60 p-2 text-muted-foreground shrink-0">
          <FileText className="size-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Documentos por rever</p>
          <p className="text-xs text-muted-foreground">Carregados, a aguardar verificação</p>
        </div>
        <span className="text-lg font-semibold tabular-nums shrink-0">{compliance.pendingReviewCount}</span>
      </Link>

      {!compliance.requiredDocsConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-3">
          <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Documentos obrigatórios ainda não configurados. Não é possível calcular documentos em falta.
          </p>
        </div>
      )}

      {compliance.expiredCount === null && (
        <p className="text-xs text-muted-foreground">A validade de documentos não é registada nesta versão.</p>
      )}
    </div>
  );
}
