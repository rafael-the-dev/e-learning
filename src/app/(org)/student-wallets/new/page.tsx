"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/shared/hooks/use-toast";
import { createWalletAction } from "@/modules/wallets/actions/wallet.actions";

export default function NewWalletPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const studentId = searchParams.get("studentId") ?? "";

  if (!studentId) {
    router.replace("/student-wallets");
    return null;
  }

  // Auto-trigger wallet creation on mount
  if (!isPending) {
    startTransition(async () => {
      const result = await createWalletAction({ studentId });
      if (result.success) {
        toast.success("Carteira criada com sucesso");
        router.replace(`/student-wallets/${result.data.id}`);
      } else {
        toast.error(result.error);
        router.back();
      }
    });
  }

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-muted-foreground text-sm">A criar carteira...</p>
    </div>
  );
}
