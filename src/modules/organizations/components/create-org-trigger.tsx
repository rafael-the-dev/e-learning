"use client";

import * as React from "react";
import { Button } from "@/shared/components/ui/button";
import { CreateOrganizationForm } from "@/modules/organizations/components/organization-form";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

export function CreateOrganizationFormTrigger() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nova Organização
      </Button>
      <CreateOrganizationForm
        open={open}
        onOpenChange={setOpen}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
