"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export interface BarChartData {
  categories: string[];
  series: { name: string; data: number[] }[];
  colors?: string[];
}

interface ApexBarChartProps {
  data: BarChartData;
  height?: number;
  loading?: boolean;
  horizontal?: boolean;
  currency?: boolean;
  stacked?: boolean;
}

export function ApexBarChart({
  data,
  height = 220,
  loading = false,
  horizontal = false,
  currency = false,
  stacked = false,
}: ApexBarChartProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasData = data.series.some((s) => s.data.some((v) => v > 0));
  if (!hasData || data.categories.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Sem dados disponíveis.
      </div>
    );
  }

  const fmt = (val: number) =>
    currency
      ? val.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " MT"
      : val.toLocaleString("pt-PT");

  const options: ApexOptions = {
    chart: {
      type: "bar",
      stacked,
      toolbar: { show: false },
      animations: { enabled: true },
      fontFamily: "inherit",
    },
    colors: data.colors ?? ["#6366f1", "#22c55e", "#f59e0b", "#ef4444"],
    plotOptions: {
      bar: {
        horizontal,
        borderRadius: 4,
        borderRadiusApplication: "end",
        columnWidth: "55%",
        barHeight: "60%",
      },
    },
    xaxis: {
      categories: data.categories,
      labels: { style: { fontSize: "11px", colors: "#94a3b8" }, rotate: -30 },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { fontSize: "11px", colors: "#94a3b8" },
        formatter: (val) =>
          currency
            ? val.toLocaleString("pt-PT", { notation: "compact", maximumFractionDigits: 1 })
            : val.toLocaleString("pt-PT"),
      },
    },
    grid: { borderColor: "#f1f5f9", strokeDashArray: 4, yaxis: { lines: { show: true } } },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: fmt } },
    legend: {
      show: data.series.length > 1,
      position: "top",
      fontSize: "11px",
      markers: { size: 6 },
    },
    responsive: [{ breakpoint: 480, options: { chart: { height: 180 } } }],
  };

  return (
    <Chart
      type="bar"
      series={data.series}
      options={options}
      height={height}
      width="100%"
    />
  );
}
