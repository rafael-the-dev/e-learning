"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { type ColumnDef, type PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Activity, ExternalLink } from "lucide-react";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import {
  DOMAIN_EVENT_STATUS_LABELS,
  DOMAIN_EVENT_TYPE_LABELS,
  DOMAIN_AGGREGATE_TYPE_LABELS,
} from "../types";
import type { DomainEventRecord } from "../types";
import type { PaginatedResult } from "@/shared/types/common";

interface DomainEventsTableProps {
  result: PaginatedResult<DomainEventRecord>;
  defaultSearch?: string;
  defaultStatus?: string;
  defaultEventType?: string;
  defaultAggregateType?: string;
  currentPage: number;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  PROCESSING: "outline",
  PROCESSED: "default",
  FAILED: "destructive",
  CANCELLED: "secondary",
};

const EVENT_TYPES = Object.values(DomainEventType).sort();
const AGGREGATE_TYPES = Object.values(DomainAggregateType).sort();

export function DomainEventsTable({
  result,
  defaultSearch,
  defaultStatus,
  defaultEventType,
  defaultAggregateType,
  currentPage,
}: DomainEventsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch ?? "");
  const [status, setStatus] = React.useState(defaultStatus ?? "");
  const [eventType, setEventType] = React.useState(defaultEventType ?? "");
  const [aggregateType, setAggregateType] = React.useState(defaultAggregateType ?? "");

  function applyFilters(
    s: string,
    st: string,
    et: string,
    at: string,
    page?: string
  ) {
    const params = new URLSearchParams(searchParams.toString());
    if (s) params.set("search", s); else params.delete("search");
    if (st) params.set("status", st); else params.delete("status");
    if (et) params.set("eventType", et); else params.delete("eventType");
    if (at) params.set("aggregateType", at); else params.delete("aggregateType");
    params.set("page", page ?? "1");
    router.push(`?${params.toString()}`);
  }

  const columns: ColumnDef<DomainEventRecord>[] = [
    {
      accessorKey: "eventType",
      header: "Tipo de Evento",
      cell: ({ row }) => (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
          {row.original.eventType}
        </span>
      ),
    },
    {
      accessorKey: "aggregateType",
      header: "Agregado",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {DOMAIN_AGGREGATE_TYPE_LABELS[row.original.aggregateType] ?? row.original.aggregateType}
        </span>
      ),
    },
    {
      accessorKey: "aggregateId",
      header: "ID do Agregado",
      cell: ({ row }) => (
        <span className="font-mono text-xs truncate max-w-30 block" title={row.original.aggregateId}>
          {row.original.aggregateId.slice(0, 16)}…
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status] ?? "secondary"}>
          {DOMAIN_EVENT_STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "retryCount",
      header: "Tentativas",
      cell: ({ row }) => (
        <span className="text-xs tabular-nums">{row.original.retryCount}</span>
      ),
    },
    {
      accessorKey: "occurredAt",
      header: "Ocorrido em",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.occurredAt).toLocaleString("pt-PT")}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/system/events/${row.original.id}`}>
            <ExternalLink className="size-3.5 mr-1.5" />
            Ver
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar por ID ou tipo…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters(search, status, eventType, aggregateType);
          }}
        />

        <Select
          value={eventType || "ALL"}
          onValueChange={(v) => {
            const val = v === "ALL" ? "" : v;
            setEventType(val);
            applyFilters(search, status, val, aggregateType);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {DOMAIN_EVENT_TYPE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status || "ALL"}
          onValueChange={(v) => {
            const val = v === "ALL" ? "" : v;
            setStatus(val);
            applyFilters(search, val, eventType, aggregateType);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(DOMAIN_EVENT_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={aggregateType || "ALL"}
          onValueChange={(v) => {
            const val = v === "ALL" ? "" : v;
            setAggregateType(val);
            applyFilters(search, status, eventType, val);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo de agregado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os agregados</SelectItem>
            {AGGREGATE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {DOMAIN_AGGREGATE_TYPE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search || status || eventType || aggregateType) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatus("");
              setEventType("");
              setAggregateType("");
              applyFilters("", "", "", "");
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-8" />}
          title="Nenhum evento encontrado"
          description="Os eventos de domínio aparecerão aqui quando forem emitidos."
        />
      ) : (
        <DataTable
          columns={columns}
          data={result.data}
          totalRows={result.total}
          pagination={{ pageIndex: currentPage - 1, pageSize: result.pageSize }}
          onPaginationChange={(state: PaginationState) => {
            applyFilters(search, status, eventType, aggregateType, String(state.pageIndex + 1));
          }}
        />
      )}
    </div>
  );
}
