import type { ReactNode } from "react";
import { PageHeader } from "@/shared/components/layout/page-header";

// Thin wrapper over the shared PageHeader for the examination portal, so all
// examination pages share one header contract.
export function ExaminationPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return <PageHeader title={title} description={description} actions={actions} />;
}
