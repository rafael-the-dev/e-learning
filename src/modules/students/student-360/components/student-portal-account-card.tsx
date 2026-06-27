"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { toast } from "@/shared/hooks/use-toast";
import { KeyRound, UserPlus, Send, Unlink, Copy, AlertTriangle } from "lucide-react";
import {
  createOrLinkStudentPortalAccountAction,
  resendStudentPortalInviteAction,
  unlinkStudentPortalAccountAction,
} from "@/modules/students/actions/portal-account.actions";
import type { StudentPortalAccountDto, StudentPortalAccountStatus } from "@/modules/students/services/student-user-provisioning.service";

const STATUS_LABELS: Record<StudentPortalAccountStatus, string> = {
  linked: "Conta vinculada",
  not_linked: "Sem conta",
  missing_email: "Email em falta",
  email_conflict: "Conflito de email",
  invite_pending: "Convite pendente",
  invite_expired: "Convite expirado",
  disabled_by_policy: "Desativado por política",
};

const STATUS_VARIANT: Record<StudentPortalAccountStatus, "success" | "warning" | "destructive" | "secondary"> = {
  linked: "success",
  not_linked: "secondary",
  missing_email: "destructive",
  email_conflict: "destructive",
  invite_pending: "warning",
  invite_expired: "warning",
  disabled_by_policy: "secondary",
};

interface Props {
  account: StudentPortalAccountDto;
  canManage: boolean;
}

export function StudentPortalAccountCard({ account, canManage }: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState<null | "create" | "resend" | "unlink">(null);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);

  const isLinked = account.status === "linked" || account.status === "invite_pending" || account.status === "invite_expired";
  const canCreate = account.status === "not_linked" || account.status === "disabled_by_policy";
  const canResend = account.status === "invite_pending" || account.status === "invite_expired";

  async function run(
    kind: "create" | "resend" | "unlink",
    fn: () => Promise<{ success: boolean; data?: { inviteUrl?: string }; error?: string }>
  ) {
    setLoading(kind);
    const res = await fn();
    setLoading(null);
    if (res.success) {
      if (res.data?.inviteUrl) setInviteUrl(res.data.inviteUrl);
      toast.success("Conta do portal atualizada");
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível concluir a operação");
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Conta do Portal do Aluno</CardTitle>
          <span className="ml-auto">
            <Badge variant={STATUS_VARIANT[account.status]}>{STATUS_LABELS[account.status]}</Badge>
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {account.status === "missing_email" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <span>Este aluno não possui email. Adicione um email antes de criar a conta.</span>
          </div>
        )}
        {account.status === "email_conflict" && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <span>Este email já está associado a outro utilizador/aluno. Resolva manualmente (altere o email ou desvincule a outra conta).</span>
          </div>
        )}
        {account.status === "disabled_by_policy" && (
          <p className="text-sm text-muted-foreground">
            A criação automática de contas está desativada nas definições. Pode criar a conta manualmente.
          </p>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Email do aluno" value={account.studentEmail ?? "—"} />
          {account.linkedUser && (
            <>
              <Field label="Utilizador" value={account.linkedUser.name} />
              <Field label="Email da conta" value={account.linkedUser.email} />
              <Field
                label="Estado da conta"
                value={account.linkedUser.status === "ACTIVE" ? "Ativa" : "Desativada"}
              />
              <Field
                label="Último acesso"
                value={
                  account.linkedUser.lastLoginAt
                    ? new Date(account.linkedUser.lastLoginAt).toLocaleString("pt-PT")
                    : "Nunca"
                }
              />
            </>
          )}
          {account.invite && (
            <>
              <Field
                label="Convite expira em"
                value={new Date(account.invite.expiresAt).toLocaleString("pt-PT")}
              />
              <Field label="Estado do convite" value={account.invite.status === "active" ? "Ativo" : "Expirado"} />
            </>
          )}
        </dl>

        {inviteUrl && (
          <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">Link de convite (mostrado apenas uma vez)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">{inviteUrl}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteUrl);
                  toast.success("Link copiado");
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <Button
                size="sm"
                loading={loading === "create"}
                onClick={() => run("create", () => createOrLinkStudentPortalAccountAction(account.studentId))}
              >
                <UserPlus className="size-3.5" /> Criar conta do portal
              </Button>
            )}
            {canResend && (
              <Button
                size="sm"
                variant="outline"
                loading={loading === "resend"}
                onClick={() => run("resend", () => resendStudentPortalInviteAction(account.studentId))}
              >
                <Send className="size-3.5" /> Reenviar convite
              </Button>
            )}
            {isLinked && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                loading={loading === "unlink"}
                onClick={() => run("unlink", () => unlinkStudentPortalAccountAction(account.studentId))}
              >
                <Unlink className="size-3.5" /> Desvincular conta
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}
