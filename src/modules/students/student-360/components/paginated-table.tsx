"use client";

import * as React from "react";
import { Button } from "@/shared/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface PaginatedTableProps<T> {
  data: T[];
  pageSize?: number;
  renderHeader: () => ReactNode;
  renderRow: (item: T, index: number) => ReactNode;
  emptyState: ReactNode;
}

export function PaginatedTable<T>({
  data,
  pageSize = 8,
  renderHeader,
  renderRow,
  emptyState,
}: PaginatedTableProps<T>) {
  const [page, setPage] = React.useState(1);

  if (data.length === 0) return <>{emptyState}</>;

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const start = (page - 1) * pageSize;
  const pageItems = data.slice(start, start + pageSize);

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">{renderHeader()}</thead>
          <tbody className="divide-y">{pageItems.map((item, i) => renderRow(item, start + i))}</tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
