"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/shared/components/ui/button";

// URL-driven prev/next pager for the guardian exam History list (READ-ONLY). The
// server refetches on the updated `page` param — it holds no data, only shifts the
// page. All other filters (student/year/subjectId/status) are preserved.

export function GuardianExamHistoryPager({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goTo(nextPage: number): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        página {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
        >
          Seguinte
        </Button>
      </div>
    </div>
  );
}
