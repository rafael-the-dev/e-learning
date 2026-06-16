import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";

interface IntegrityWarningBannerProps {
  criticalCount: number;
}

export function IntegrityWarningBanner({ criticalCount }: IntegrityWarningBannerProps) {
  if (criticalCount === 0) return null;

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="size-4" />
      <AlertDescription>
        Existem <strong>{criticalCount}</strong> inconsistência(s) financeira(s) crítica(s). Os
        relatórios podem não reflectir a realidade.{" "}
        <Link href="/reports/finance/integrity" className="underline font-medium">
          Ver problemas de integridade
        </Link>
      </AlertDescription>
    </Alert>
  );
}
