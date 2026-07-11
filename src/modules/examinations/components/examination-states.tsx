import type { ReactNode } from "react";

// Empty + error states for the examination portal. Presentational only.

export function ExaminationEmptyState({
  title = "Sem resultados",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ExaminationErrorState({
  title = "Ocorreu um erro",
  description = "Não foi possível carregar os dados. Tente novamente.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center">
      <p className="text-sm font-medium text-destructive">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
