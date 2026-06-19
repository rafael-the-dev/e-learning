import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";

interface Props {
  show: boolean;
}

export function WalletIntegrityWarningBanner({ show }: Props) {
  if (!show) return null;

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="size-4" />
      <AlertDescription>
        Existem inconsistências críticas em carteiras. O passivo pode não reflectir a realidade.{" "}
        <Link href="/reports/finance/integrity" className="underline font-medium">
          Ver problemas de integridade
        </Link>
      </AlertDescription>
    </Alert>
  );
}
