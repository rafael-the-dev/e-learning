import { TrendingUp, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { FinancialOverview as FinancialOverviewData } from "@/modules/dashboard/types";

function formatCurrency(value: number, symbol: string) {
  return `${symbol} ${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface FinancialItem {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClass?: string;
}

interface FinancialOverviewProps {
  data: FinancialOverviewData;
}

export function FinancialOverview({ data }: FinancialOverviewProps) {
  const { currencySymbol: sym } = data;

  const items: FinancialItem[] = [
    {
      label: "Receita este mês",
      value: formatCurrency(data.revenueThisMonth, sym),
      icon: <TrendingUp className="size-4 text-emerald-600" />,
      valueClass: "text-emerald-700",
    },
    {
      label: "Pagamentos hoje",
      value: formatCurrency(data.paymentsToday, sym),
      icon: <CheckCircle className="size-4 text-blue-600" />,
      valueClass: "text-blue-700",
    },
    {
      label: "Valor pendente",
      value: formatCurrency(data.pendingAmount, sym),
      icon: <Clock className="size-4 text-amber-600" />,
      valueClass: "text-amber-700",
    },
    {
      label: "Valor em atraso",
      value: formatCurrency(data.overdueAmount, sym),
      icon: <AlertTriangle className="size-4 text-red-600" />,
      valueClass: "text-red-700",
    },
  ];

  return (
    <div className="rounded-xl border bg-card">
      <div className="px-6 py-4 border-b">
        <h2 className="text-sm font-semibold">Resumo Financeiro</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Visão geral das finanças do mês atual</p>
      </div>
      <div className="divide-y">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between px-6 py-3.5">
            <div className="flex items-center gap-2.5">
              {item.icon}
              <span className="text-sm text-muted-foreground">{item.label}</span>
            </div>
            <span className={cn("text-sm font-semibold tabular-nums", item.valueClass)}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
