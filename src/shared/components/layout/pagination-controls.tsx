"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface Props {
  meta: PaginationMeta;
}

export function PaginationControls({ meta }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (meta.totalPages <= 1) return null;

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`?${params.toString()}`);
  }

  const start = (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {start}–{end} de {meta.total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={!meta.hasPreviousPage}
          onClick={() => goToPage(meta.page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2">
          {meta.page} / {meta.totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={!meta.hasNextPage}
          onClick={() => goToPage(meta.page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
