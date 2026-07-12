"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { toast } from "@/shared/hooks/use-toast";

// =============================================================================
// AllowedActionButton (Phase 12, Increment 3)
// -----------------------------------------------------------------------------
// The ONE place the portal turns a server-computed `allowedActions` flag into a
// button. THE FRONTEND DECIDES NOTHING: it renders `allowed` (never a status
// comparison), performs the mutation against the thin API route, and ALWAYS
// surfaces the command's typed error — the backend remains the authority, so a
// rejected command is shown even if the button was enabled. Optional confirm for
// destructive/irreversible actions (cancel / disqualify / retract / reject).
// =============================================================================

export interface AllowedActionButtonProps {
  /** The server-computed flag (e.g. allowedActions.canApprove). Never a status check. */
  allowed: boolean;
  /** API route to call (POST by default). */
  url: string;
  method?: "POST" | "PATCH";
  /** JSON body (e.g. { reason }). */
  body?: Record<string, unknown>;
  label: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "icon";
  /** Show a confirmation dialog before firing (destructive actions). */
  confirm?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  /** Collect a mandatory reason (merged into the body as `reason`) before firing —
   *  for commands that require one (cancel / retract / reject / disqualify / return). */
  reasonRequired?: boolean;
  reasonLabel?: string;
  successMessage?: string;
  /** Hide entirely when disallowed (default renders a disabled button). */
  hideWhenDisallowed?: boolean;
  /**
   * Called after a successful mutation, with the command's parsed result. The SURFACE
   * uses it to update its own read model in place (directed refetch / row replace) —
   * the button stays generic (loading / error / toast only). When omitted, the button
   * falls back to a global `router.refresh()` (fine for low-frequency lists).
   */
  onSuccess?: (result: unknown) => void | Promise<void>;
}

export function AllowedActionButton({
  allowed,
  url,
  method = "POST",
  body,
  label,
  variant = "default",
  size = "sm",
  confirm = false,
  confirmTitle,
  confirmDescription,
  reasonRequired = false,
  reasonLabel = "Motivo",
  successMessage,
  hideWhenDisallowed = false,
  onSuccess,
}: AllowedActionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!allowed) {
    if (hideWhenDisallowed) return null;
    return (
      <Button variant={variant} size={size} disabled>
        {label}
      </Button>
    );
  }

  async function run(): Promise<void> {
    const finalBody = reasonRequired ? { ...(body ?? {}), reason } : body;
    setLoading(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: finalBody ? JSON.stringify(finalBody) : undefined,
      });
      if (!res.ok) {
        // The backend is authoritative — surface its typed error message.
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: "Ação recusada",
          description: payload.error ?? "Não foi possível concluir a ação.",
          variant: "destructive",
        });
        return;
      }
      // Parse the authoritative result so the surface can reconcile from the server
      // response (never invent the new state locally).
      const result = await res.json().catch(() => null);
      if (successMessage) toast({ title: successMessage });
      if (onSuccess) await onSuccess(result);
      else router.refresh();
    } catch {
      toast({ title: "Erro de rede", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  if (reasonRequired) {
    return (
      <>
        <Button variant={variant} size={size} disabled={loading} onClick={() => setOpen(true)}>
          {label}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmTitle ?? label}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="action-reason">{reasonLabel}</Label>
              <Textarea
                id="action-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Indique o motivo…"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button
                variant={variant === "destructive" ? "destructive" : "default"}
                onClick={run}
                disabled={loading || reason.trim().length === 0}
              >
                {label}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (confirm) {
    return (
      <>
        <Button variant={variant} size={size} disabled={loading} onClick={() => setOpen(true)}>
          {label}
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={confirmTitle ?? label}
          description={confirmDescription}
          confirmLabel={label}
          variant={variant === "destructive" ? "destructive" : "default"}
          loading={loading}
          onConfirm={run}
        />
      </>
    );
  }

  return (
    <Button variant={variant} size={size} disabled={loading} onClick={run}>
      {label}
    </Button>
  );
}
