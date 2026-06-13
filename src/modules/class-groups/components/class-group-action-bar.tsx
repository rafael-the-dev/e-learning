"use client";

import Link from "next/link";
import { Clock, AlertTriangle, ShieldAlert } from "lucide-react";

interface Props {
  formingCount: number;
  lowOccupancyCount: number;
  pendingOperationalIssues: number;
}

export function ClassGroupActionBar({ formingCount, lowOccupancyCount, pendingOperationalIssues }: Props) {
  if (formingCount === 0 && lowOccupancyCount === 0 && pendingOperationalIssues === 0) return null;

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-4 sm:px-8 py-2 flex items-center gap-2 flex-wrap">
      {formingCount > 0 && (
        <Link
          href="/class-groups?status=FORMING"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <Clock className="size-3" />
          {formingCount} em formação
        </Link>
      )}
      {lowOccupancyCount > 0 && (
        <Link
          href="/class-groups?status=ACTIVE"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
        >
          <AlertTriangle className="size-3" />
          {lowOccupancyCount} baixa ocupação
        </Link>
      )}
      {pendingOperationalIssues > 0 && (
        <Link
          href="/class-groups"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
        >
          <ShieldAlert className="size-3" />
          {pendingOperationalIssues} problemas operacionais
        </Link>
      )}
    </div>
  );
}
