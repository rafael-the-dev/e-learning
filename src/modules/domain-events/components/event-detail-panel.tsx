"use client";

import * as React from "react";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  DOMAIN_EVENT_STATUS_LABELS,
  DOMAIN_EVENT_HANDLER_STATUS_LABELS,
  DOMAIN_AGGREGATE_TYPE_LABELS,
} from "../types";
import type { DomainEventRecord } from "../types";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  PROCESSING: "outline",
  PROCESSED: "default",
  FAILED: "destructive",
  CANCELLED: "secondary",
  SKIPPED: "secondary",
};

interface EventDetailPanelProps {
  event: DomainEventRecord;
}

export function EventDetailPanel({ event }: EventDetailPanelProps) {
  const payload = React.useMemo(() => {
    try {
      return JSON.parse(event.payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [event.payload]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhes do Evento</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Tipo</dt>
              <dd className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded mt-0.5 inline-block">
                {event.eventType}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Estado</dt>
              <dd className="mt-0.5">
                <Badge variant={STATUS_VARIANTS[event.status] ?? "secondary"}>
                  {DOMAIN_EVENT_STATUS_LABELS[event.status] ?? event.status}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tipo de Agregado</dt>
              <dd className="font-medium">
                {DOMAIN_AGGREGATE_TYPE_LABELS[event.aggregateType] ?? event.aggregateType}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ID do Agregado</dt>
              <dd className="font-mono text-xs">{event.aggregateId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ocorrido em</dt>
              <dd>{new Date(event.occurredAt).toLocaleString("pt-PT")}</dd>
            </div>
            {event.processedAt && (
              <div>
                <dt className="text-muted-foreground">Processado em</dt>
                <dd>{new Date(event.processedAt).toLocaleString("pt-PT")}</dd>
              </div>
            )}
            {event.failedAt && (
              <div>
                <dt className="text-muted-foreground">Falhou em</dt>
                <dd className="text-destructive">
                  {new Date(event.failedAt).toLocaleString("pt-PT")}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Tentativas</dt>
              <dd>{event.retryCount}</dd>
            </div>
          </dl>
          {event.failureReason && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Motivo do erro</p>
              <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">
                {event.failureReason}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs font-mono bg-muted rounded p-4 overflow-auto max-h-72 whitespace-pre-wrap break-all">
            {payload
              ? JSON.stringify(payload, null, 2)
              : event.payload}
          </pre>
        </CardContent>
      </Card>

      {event.handlerLogs && event.handlerLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Logs de Handlers ({event.handlerLogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Handler</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Iniciado em</TableHead>
                  <TableHead>Concluído em</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {event.handlerLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.handlerName}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[log.status] ?? "secondary"}>
                        {DOMAIN_EVENT_HANDLER_STATUS_LABELS[log.status] ?? log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{log.retryCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.startedAt
                        ? new Date(log.startedAt).toLocaleString("pt-PT")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.completedAt
                        ? new Date(log.completedAt).toLocaleString("pt-PT")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-xs truncate" title={log.failureReason ?? ""}>
                      {log.failureReason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
