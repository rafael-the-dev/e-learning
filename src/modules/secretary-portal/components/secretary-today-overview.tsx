import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { ClipboardList, CreditCard, AlertTriangle, FileText, Bell } from "lucide-react";
import type { SecretaryTodayOverview } from "@/modules/secretary-portal/types";

interface Props {
  overview: SecretaryTodayOverview;
}

export function SecretaryTodayOverviewCard({ overview }: Props) {
  const dateLabel = overview.today.toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const hasAttention =
    overview.pendingEnrollments > 0 ||
    overview.pendingPayments > 0 ||
    overview.overdueInvoices > 0 ||
    overview.documentsToReview > 0 ||
    overview.unreadNotifications > 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground capitalize">{dateLabel}</p>
          <p className="text-lg font-semibold">
            {hasAttention ? "Tem itens a precisar de acção." : "Tudo em dia. Sem itens pendentes."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {overview.pendingEnrollments > 0 && (
            <Badge variant="warning" className="gap-1.5">
              <ClipboardList className="size-3.5" />
              {overview.pendingEnrollments} matrículas pendentes
            </Badge>
          )}
          {overview.pendingPayments > 0 && (
            <Badge variant="info" className="gap-1.5">
              <CreditCard className="size-3.5" />
              {overview.pendingPayments} pagamentos a confirmar
            </Badge>
          )}
          {overview.overdueInvoices > 0 && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertTriangle className="size-3.5" />
              {overview.overdueInvoices} facturas vencidas
            </Badge>
          )}
          {overview.documentsToReview > 0 && (
            <Badge variant="secondary" className="gap-1.5">
              <FileText className="size-3.5" />
              {overview.documentsToReview} documentos por rever
            </Badge>
          )}
          {overview.unreadNotifications > 0 && (
            <Badge variant="secondary" className="gap-1.5">
              <Bell className="size-3.5" />
              {overview.unreadNotifications} notificações
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
