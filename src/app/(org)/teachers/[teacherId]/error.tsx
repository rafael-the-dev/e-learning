"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";

export default function TeacherDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-4 sm:p-8">
      <EmptyState
        icon={<AlertTriangle className="size-8" />}
        title="Não foi possível carregar o perfil do professor"
        description="Ocorreu um erro inesperado. Tente novamente."
        action={<Button onClick={reset}>Tentar novamente</Button>}
      />
    </div>
  );
}
