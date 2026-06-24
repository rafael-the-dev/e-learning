"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { NotificationCard } from "@/modules/notifications/components/notification-card";
import {
  getNotificationBellDataAction,
  markNotificationReadAction,
} from "@/modules/notifications/actions/notification.actions";

const BELL_QUERY_KEY = ["notification-bell"];

export function NotificationBell() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: BELL_QUERY_KEY,
    queryFn: async () => {
      const res = await getNotificationBellDataAction();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });

  const unreadCount = data?.unreadCount ?? 0;
  const latest = data?.latest ?? [];

  async function handleMarkRead(id: string) {
    await markNotificationReadAction(id);
    queryClient.invalidateQueries({ queryKey: BELL_QUERY_KEY });
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) queryClient.invalidateQueries({ queryKey: BELL_QUERY_KEY });
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8 shrink-0">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">Notificações</span>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">{unreadCount} não lida(s)</span>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {latest.length === 0 ? (
            <EmptyState title="Sem notificações novas." className="border-none p-6" />
          ) : (
            <div className="space-y-1">
              {latest.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  compact
                  onMarkRead={handleMarkRead}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full text-xs">
            <Link href="/notifications">Ver todas</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
