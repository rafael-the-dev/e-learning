"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Info, CheckCircle2, AlertTriangle, AlertOctagon, MoreHorizontal, Archive, MailOpen } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import type { Notification, NotificationSeverity } from "@/modules/notifications/types";

const SEVERITY_ICON: Record<NotificationSeverity, typeof Info> = {
  INFO: Info,
  SUCCESS: CheckCircle2,
  WARNING: AlertTriangle,
  CRITICAL: AlertOctagon,
};

const SEVERITY_BADGE_VARIANT: Record<NotificationSeverity, "info" | "success" | "warning" | "destructive"> = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  CRITICAL: "destructive",
};

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} dia(s)`;
  return new Date(date).toLocaleDateString("pt-PT");
}

interface NotificationCardProps {
  notification: Notification;
  compact?: boolean;
  onMarkRead?: (id: string) => Promise<void> | void;
  onArchive?: (id: string) => Promise<void> | void;
}

export function NotificationCard({ notification, compact, onMarkRead, onArchive }: NotificationCardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const Icon = SEVERITY_ICON[notification.severity];
  const isUnread = notification.status === "UNREAD";

  function handleOpen() {
    if (isUnread) onMarkRead?.(notification.id);
    if (notification.actionUrl) {
      startTransition(() => router.push(notification.actionUrl!));
    }
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        isUnread ? "bg-accent/40" : "bg-transparent",
        notification.actionUrl && "cursor-pointer hover:bg-accent"
      )}
      onClick={notification.actionUrl ? handleOpen : undefined}
      role={notification.actionUrl ? "button" : undefined}
    >
      <Icon className={cn("size-4 mt-0.5 shrink-0", isUnread ? "text-foreground" : "text-muted-foreground")} />

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm truncate", isUnread ? "font-semibold" : "font-medium text-muted-foreground")}>
            {notification.title}
          </p>
          {isUnread && <span className="size-1.5 rounded-full bg-primary shrink-0" />}
        </div>
        <p className={cn("text-sm", compact ? "line-clamp-2" : "")}>{notification.message}</p>
        <div className="flex items-center gap-2">
          <Badge variant={SEVERITY_BADGE_VARIANT[notification.severity]} className="text-[10px]">
            {notification.type}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(notification.createdAt)}</span>
        </div>
      </div>

      {(onMarkRead || onArchive) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {onMarkRead && isUnread && (
              <DropdownMenuItem onClick={() => onMarkRead(notification.id)}>
                <MailOpen className="size-3.5" />
                Marcar como lida
              </DropdownMenuItem>
            )}
            {onArchive && notification.status !== "ARCHIVED" && (
              <DropdownMenuItem onClick={() => onArchive(notification.id)}>
                <Archive className="size-3.5" />
                Arquivar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
