import Link from "next/link";
import { Wallet, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { WALLET_STATUS_LABELS, WALLET_TRANSACTION_TYPE_LABELS } from "@/modules/wallets/types";
import type { StudentWallet, WalletTransaction } from "@/modules/wallets/types";

interface Props {
  wallet: StudentWallet | null;
  recentTransactions: WalletTransaction[];
  canDeposit: boolean;
  studentId: string;
}

export function StudentWalletCard({ wallet, recentTransactions, canDeposit, studentId }: Props) {
  if (!wallet) {
    return (
      <div className="rounded-xl border border-dashed p-5 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wallet className="size-4" />
          <h3 className="text-sm font-semibold">Carteira</h3>
        </div>
        <p className="text-xs text-muted-foreground">Nenhuma carteira criada.</p>
        {canDeposit && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/student-wallets/new?studentId=${studentId}`}>
              Criar Carteira
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Carteira</h3>
        </div>
        <Badge
          variant={wallet.status === "SUSPENDED" ? "destructive" : "default"}
          className="text-xs"
        >
          {WALLET_STATUS_LABELS[wallet.status] ?? wallet.status}
        </Badge>
      </div>

      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold tabular-nums">
          {wallet.balance.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-sm text-muted-foreground mb-0.5">MT</span>
      </div>

      {recentTransactions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Últimas transações
          </p>
          <div className="space-y-1.5">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {tx.amount >= 0 ? (
                    <TrendingUp className="size-3 text-green-600" />
                  ) : (
                    <TrendingDown className="size-3 text-destructive" />
                  )}
                  <span className="text-muted-foreground">
                    {WALLET_TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                  </span>
                </div>
                <span
                  className={`font-medium tabular-nums ${
                    tx.amount >= 0 ? "text-green-600" : "text-destructive"
                  }`}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {tx.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href={`/student-wallets/${wallet.id}`}>
          Ver carteira
          <ArrowRight className="size-3.5 ml-1.5" />
        </Link>
      </Button>
    </div>
  );
}
