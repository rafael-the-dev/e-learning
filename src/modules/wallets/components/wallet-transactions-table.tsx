"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { WALLET_TRANSACTION_TYPE_LABELS } from "@/modules/wallets/types";
import type { WalletTransaction } from "@/modules/wallets/types";
import type { PaginatedResult } from "@/shared/types/common";
import { cn } from "@/shared/lib/utils";

const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DEPOSIT: "default",
  OVERPAYMENT: "default",
  PROMOTIONAL_CREDIT: "default",
  CREDIT_APPLIED: "secondary",
  REFUND: "destructive",
  ADJUSTMENT: "outline",
};

interface Props {
  result: PaginatedResult<WalletTransaction>;
  defaultType?: string;
}

export function WalletTransactionsTable({ result, defaultType }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select defaultValue={defaultType ?? "ALL"} onValueChange={(v) => updateParam("type", v)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Tipo de transação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            {Object.entries(WALLET_TRANSACTION_TYPE_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Referência</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  Nenhuma transação encontrada.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm">
                    {tx.createdAt.toLocaleDateString("pt-PT")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={TYPE_VARIANT[tx.type] ?? "outline"}>
                      {WALLET_TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tx.description ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {tx.referenceId && tx.referenceType === "Invoice" ? (
                      <Link href={`/invoices/${tx.referenceId}`} className="hover:underline">
                        {tx.referenceId}
                      </Link>
                    ) : (tx.referenceId ?? "—")}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      tx.amount >= 0 ? "text-green-600" : "text-destructive"
                    )}
                  >
                    {tx.amount >= 0 ? "+" : ""}
                    {tx.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">
            Página {result.page} de {result.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!result.hasPreviousPage}
            onClick={() => updateParam("page", String(result.page - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!result.hasNextPage}
            onClick={() => updateParam("page", String(result.page + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
