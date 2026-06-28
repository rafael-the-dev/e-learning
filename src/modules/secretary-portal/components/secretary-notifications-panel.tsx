"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { NotificationCard } from "@/modules/notifications/components/notification-card";
import { markNotificationReadAction, archiveNotificationAction } from "@/modules/notifications/actions/notification.actions";
import type { Notification } from "@/modules/notifications/types";

interface Props {
  notifications: Notification[];
}

export function SecretaryNotificationsPanel({ notifications }: Props) {
  const router = useRouter();

  async function handleMarkRead(id: string) {
    await markNotificationReadAction(id);
    router.refresh();
  }

  async function handleArchive(id: string) {
    await archiveNotificationAction(id);
    router.refresh();
  }

  if (notifications.length === 0) {
    return <EmptyState icon={<BellOff className="size-8" />} title="Sem notificações novas." className="border-0" />;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            compact
            onMarkRead={handleMarkRead}
            onArchive={handleArchive}
          />
        ))}
      </div>
      <Button asChild variant="ghost" size="sm" className="w-full text-xs">
        <Link href="/notifications">Ver todas</Link>
      </Button>
    </div>
  );
}
