"use client";

import { useRouter, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import type { Student360TabKey } from "@/modules/students/student-360/types";
import type { ReactNode } from "react";

export interface Student360TabDef {
  key: Student360TabKey;
  label: string;
  icon: ReactNode;
  count?: number;
}

interface Student360TabsNavProps {
  active: Student360TabKey;
  tabs: Student360TabDef[];
}

export function Student360TabsNav({ active, tabs }: Student360TabsNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      value={active}
      onValueChange={(value) => router.push(`${pathname}?tab=${value}`, { scroll: false })}
    >
      <div className="overflow-x-auto -mx-4 px-4 sm:-mx-8 sm:px-8">
        <TabsList className="w-max">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5 whitespace-nowrap">
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1 rounded-full bg-muted-foreground/20 px-1.5 py-px text-xs font-medium tabular-nums">
                  {tab.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
