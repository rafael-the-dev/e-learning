"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback } from "react";
import { MoreHorizontal, Eye } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { RECEIPT_STATUS_LABELS } from "@/modules/finance/types";
import type { Receipt } from "@/modules/finance/types";
import type { PaginatedResult } from "@/shared/types/common";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  result: PaginatedResult<Receipt>;
  defaultSearch?: string;
  defaultStatus?: string;
}

export function ReceiptsTable({ result, defaultSearch, defaultStatus }: Props) {
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
        <Input
          placeholder="Pesquisar recibo ou aluno..."
          defaultValue={defaultSearch}
          className="max-w-xs"
          onChange={(e) => {
            const v = e.target.value;
            const t = setTimeout(() => updateParam("search", v || undefined), 400);
            return () => clearTimeout(t);
          }}
        />
        <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(RECEIPT_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Recibo</TableHead>
              <TableHead>Aluno</TableHead>
              <TableHead>Fatura</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Data Emissão</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  Nenhum recibo encontrado.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell className="font-mono text-sm">{receipt.receiptNumber}</TableCell>
                  <TableCell>{receipt.studentName ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{receipt.invoiceNumber}</TableCell>
                  <TableCell className="font-mono text-sm">{receipt.paymentNumber}</TableCell>
                  <TableCell>{receipt.issueDate.toLocaleDateString("pt-PT")}</TableCell>
                  <TableCell className="text-right font-medium">
                    {receipt.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={receipt.status === "CANCELLED" ? "destructive" : "default"}>
                      {RECEIPT_STATUS_LABELS[receipt.status] ?? receipt.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/receipts/${receipt.id}`}>
                            <Eye className="size-4 mr-2" />
                            Ver recibo
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
