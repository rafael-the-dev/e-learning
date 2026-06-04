"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { CategoriesTable } from "@/modules/courses/components/categories-table";
import { CreateCategoryDrawer } from "@/modules/courses/components/category-form";
import { Plus } from "lucide-react";
import type { CourseCategoryWithCount } from "@/modules/courses/types";

interface CategoriesPageClientProps {
  categories: CourseCategoryWithCount[];
  defaultSearch?: string;
  defaultStatus?: string;
  totalActive: number;
  totalInactive: number;
  totalArchived: number;
  breadcrumb: React.ReactNode;
}

export function CategoriesPageClient({
  categories,
  defaultSearch,
  defaultStatus,
  totalActive,
  totalInactive,
  totalArchived,
  breadcrumb,
}: CategoriesPageClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Categorias de Cursos"
        description="Gerir as categorias de cursos da organização."
        breadcrumb={breadcrumb}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1.5" />
            Nova Categoria
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total" value={categories.length} />
          <StatCard label="Ativas" value={totalActive} />
          <StatCard label="Inativas" value={totalInactive} />
          <StatCard label="Arquivadas" value={totalArchived} />
        </div>

        <CategoriesTable
          categories={categories}
          defaultSearch={defaultSearch}
          defaultStatus={defaultStatus}
        />
      </div>

      <CreateCategoryDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
