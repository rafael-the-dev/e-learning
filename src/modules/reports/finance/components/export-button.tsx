"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";

interface ExportButtonProps {
  reportType: "accounts-receivable" | "aging" | "payments" | "refunds" | "student-debt" | "collections" | "branch-revenue" | "wallets" | "course-revenue" | "reconciliation" | "closing" | "revenue-trend" | "wallet-liability" | "taxes" | "discounts" | "payment-methods" | "refund-analysis";
  filters?: Record<string, string | undefined>;
  label?: string;
}

export function ExportButton({ reportType, filters = {}, label = "Exportar CSV" }: ExportButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.set(k, v);
      }
      const url = `/api/reports/finance/export/${reportType}?${params.toString()}`;
      const res = await fetch(url);

      if (!res.ok) {
        toast({ title: "Erro ao exportar relatório", variant: "destructive" });
        return;
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `${reportType}.csv`;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      toast({ title: "Relatório exportado com sucesso" });
    } catch {
      toast({ title: "Erro ao exportar relatório", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
      {label}
    </Button>
  );
}
