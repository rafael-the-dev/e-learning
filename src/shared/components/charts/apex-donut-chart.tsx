"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export interface DonutChartData {
  labels: string[];
  series: number[];
  colors?: string[];
}

interface ApexDonutChartProps {
  data: DonutChartData;
  height?: number;
  loading?: boolean;
}

const DEFAULT_COLORS = [
  "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#94a3b8",
];

export function ApexDonutChart({ data, height = 220, loading = false }: ApexDonutChartProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasData = data.series.some((v) => v > 0);
  if (!hasData) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Sem dados disponíveis.
      </div>
    );
  }

  const options: ApexOptions = {
    chart: { type: "donut", toolbar: { show: false }, animations: { enabled: true } },
    labels: data.labels,
    colors: data.colors ?? DEFAULT_COLORS,
    legend: {
      position: "bottom",
      fontSize: "11px",
      markers: { size: 6 },
      itemMargin: { horizontal: 6, vertical: 2 },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => `${Math.round(val)}%`,
      style: { fontSize: "11px" },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "62%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Total",
              fontSize: "12px",
              color: "#64748b",
              formatter: (w) => w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0).toString(),
            },
          },
        },
      },
    },
    tooltip: {
      y: { formatter: (val) => val.toLocaleString("pt-PT") },
    },
    stroke: { width: 2 },
    responsive: [{ breakpoint: 480, options: { chart: { height: 200 } } }],
  };

  return (
    <Chart
      type="donut"
      series={data.series}
      options={options}
      height={height}
      width="100%"
    />
  );
}
