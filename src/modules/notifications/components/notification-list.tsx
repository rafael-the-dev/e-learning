"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BellOff, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { NotificationCard } from "@/modules/notifications/components/notification-card";
import type { Notification } from "@/modules/notifications/types";
import type { PaginatedResult } from "@/shared/types/common";

interface NotificationListProps {
  result: PaginatedResult<Notification>;
  onMarkRead?: (id: string) => Promise<void> | void;
  onArchive?: (id: string) => Promise<void> | void;
}

export function NotificationList({ result, onMarkRead, onArchive }: NotificationListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`${pathname}?${params.toString()}`);
  }

  if (result.data.length === 0) {
    return (
      <EmptyState
        icon={<BellOff className="size-8" />}
        title="Sem notificações novas."
        description="Quando houver novidades para si, vai vê-las aqui."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {result.data.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            onMarkRead={onMarkRead}
            onArchive={onArchive}
          />
        ))}
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            Página {result.page} de {result.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!result.hasPreviousPage}
              onClick={() => goToPage(result.page - 1)}
            >
              <ChevronLeft className="size-3.5" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!result.hasNextPage}
              onClick={() => goToPage(result.page + 1)}
            >
              Seguinte
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
