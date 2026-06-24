"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { Input } from "@/shared/components/ui/input";
import { NOTIFICATION_SEVERITY_LABELS, NOTIFICATION_STATUS_LABELS } from "@/modules/notifications/types";

interface NotificationFiltersProps {
  defaultStatus?: string;
  defaultSeverity?: string;
  defaultType?: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
}

export function NotificationFilters({
  defaultStatus,
  defaultSeverity,
  defaultType,
  defaultDateFrom,
  defaultDateTo,
}: NotificationFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const activeExtraFilters = [defaultSeverity, defaultType, defaultDateFrom, defaultDateTo].filter(
    Boolean
  ).length;

  return (
    <div className="flex items-center gap-2 flex-wrap pt-2">
      <Select defaultValue={defaultStatus ?? "ACTIVE"} onValueChange={(v) => updateParam("status", v === "ACTIVE" ? undefined : v)}>
        <SelectTrigger className="w-44 h-8 text-sm">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ACTIVE">Não lidas e lidas</SelectItem>
          {Object.entries(NOTIFICATION_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
          <SelectItem value="ALL">Todas</SelectItem>
        </SelectContent>
      </Select>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <SlidersHorizontal className="size-3.5" />
            Filtros
            {activeExtraFilters > 0 && (
              <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 flex items-center justify-center">
                {activeExtraFilters}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Severidade</Label>
              <Select
                defaultValue={defaultSeverity ?? "ALL"}
                onValueChange={(v) => updateParam("severity", v === "ALL" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as severidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as severidades</SelectItem>
                  {Object.entries(NOTIFICATION_SEVERITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Input
                placeholder="Ex: PAYMENT_RECEIVED"
                defaultValue={defaultType}
                onChange={(e) => {
                  const v = e.target.value;
                  const t = setTimeout(() => updateParam("type", v || undefined), 400);
                  return () => clearTimeout(t);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>De</Label>
              <Input
                type="date"
                defaultValue={defaultDateFrom}
                onChange={(e) => updateParam("dateFrom", e.target.value || undefined)}
              />
            </div>

            <div className="space-y-2">
              <Label>Até</Label>
              <Input
                type="date"
                defaultValue={defaultDateTo}
                onChange={(e) => updateParam("dateTo", e.target.value || undefined)}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
