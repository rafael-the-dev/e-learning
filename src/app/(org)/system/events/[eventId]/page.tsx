import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDomainEventDetail } from "@/modules/domain-events/services/domain-event.service";
import { EventDetailPanel } from "@/modules/domain-events/components/event-detail-panel";
import { DOMAIN_AGGREGATE_TYPE_LABELS, DOMAIN_EVENT_TYPE_LABELS } from "@/modules/domain-events/types";
import { ChevronLeft } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Detalhe do Evento" };

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.DOMAIN_EVENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { eventId } = await params;
  const event = await getDomainEventDetail(eventId, context.organizationId);
  if (!event) notFound();

  return (
    <>
      <PageHeader
        title={DOMAIN_EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
        description={`${DOMAIN_AGGREGATE_TYPE_LABELS[event.aggregateType] ?? event.aggregateType} · ${event.aggregateId}`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/system/events">
              <ChevronLeft className="size-4 mr-1.5" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="p-8 max-w-4xl">
        <EventDetailPanel event={event} />
      </div>
    </>
  );
}
