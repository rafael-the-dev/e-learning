"use client";

import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  FileText,
  CreditCard,
  Receipt,
  Wallet,
  Coins,
  ArrowUpCircle,
  BookOpen,
  Users,
  Building2,
  Bell,
  StickyNote,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  AlertOctagon,
} from "lucide-react";
import type { TimelineEventType } from "@/modules/student-timeline/types";
import { cn } from "@/shared/lib/utils";

const ICON_MAP: Record<TimelineEventType, { Icon: React.ElementType; colorClass: string }> = {
  ENROLLMENT_CREATED: { Icon: GraduationCap, colorClass: "text-blue-500 bg-blue-50 dark:bg-blue-950/40" },
  ENROLLMENT_ACTIVATED: { Icon: CheckCircle2, colorClass: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" },
  ENROLLMENT_CANCELLED: { Icon: XCircle, colorClass: "text-red-500 bg-red-50 dark:bg-red-950/40" },
  INVOICE_CREATED: { Icon: FileText, colorClass: "text-amber-500 bg-amber-50 dark:bg-amber-950/40" },
  INVOICE_PAID: { Icon: CheckCircle2, colorClass: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" },
  PAYMENT_CONFIRMED: { Icon: CreditCard, colorClass: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" },
  RECEIPT_ISSUED: { Icon: Receipt, colorClass: "text-teal-500 bg-teal-50 dark:bg-teal-950/40" },
  WALLET_DEPOSIT_CREATED: { Icon: Wallet, colorClass: "text-blue-500 bg-blue-50 dark:bg-blue-950/40" },
  WALLET_CREDIT_APPLIED: { Icon: Coins, colorClass: "text-purple-500 bg-purple-50 dark:bg-purple-950/40" },
  WALLET_OVERPAYMENT_CREATED: { Icon: ArrowUpCircle, colorClass: "text-orange-500 bg-orange-50 dark:bg-orange-950/40" },
  LESSON_COMPLETED: { Icon: BookOpen, colorClass: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" },
  CLASS_GROUP_ASSIGNED: { Icon: Users, colorClass: "text-blue-500 bg-blue-50 dark:bg-blue-950/40" },
  CLASSROOM_BOOKING_CHANGED: { Icon: Building2, colorClass: "text-slate-500 bg-slate-100 dark:bg-slate-800/60" },
  NOTIFICATION_SENT: { Icon: Bell, colorClass: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40" },
  MANUAL_NOTE: { Icon: StickyNote, colorClass: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40" },
  ATTENDANCE_JUSTIFICATION_APPROVED: { Icon: ShieldCheck, colorClass: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" },
  ATTENDANCE_JUSTIFICATION_REJECTED: { Icon: ShieldX, colorClass: "text-red-500 bg-red-50 dark:bg-red-950/40" },
  ATTENDANCE_AT_RISK: { Icon: AlertTriangle, colorClass: "text-amber-500 bg-amber-50 dark:bg-amber-950/40" },
  ATTENDANCE_BELOW_REQUIRED: { Icon: AlertOctagon, colorClass: "text-red-600 bg-red-50 dark:bg-red-950/40" },
};

export function TimelineEventIcon({
  eventType,
  size = "md",
}: {
  eventType: TimelineEventType;
  size?: "sm" | "md" | "lg";
}) {
  const { Icon, colorClass } = ICON_MAP[eventType] ?? ICON_MAP.MANUAL_NOTE;

  const sizeClass = {
    sm: "size-6 [&_svg]:size-3",
    md: "size-8 [&_svg]:size-3.5",
    lg: "size-10 [&_svg]:size-5",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full flex-shrink-0",
        sizeClass,
        colorClass
      )}
    >
      <Icon />
    </span>
  );
}
