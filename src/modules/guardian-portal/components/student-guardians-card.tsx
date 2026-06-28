"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import { toast } from "@/shared/hooks/use-toast";
import { Users, UserPlus, Send, Trash2, Copy, Star } from "lucide-react";
import { GUARDIAN_RELATIONSHIP_LABELS } from "@/modules/guardian-portal/types";
import {
  addGuardianLinkAction,
  resendGuardianInviteAction,
  removeGuardianLinkAction,
  updateGuardianLinkAction,
  type AddGuardianInput,
} from "@/modules/guardian-portal/actions/guardian-links.actions";
import type {
  StudentGuardianLinkDto,
  GuardianLinkAccountStatus,
} from "@/modules/guardian-portal/services/guardian-provisioning.service";

const ACCOUNT_STATUS_LABELS: Record<GuardianLinkAccountStatus, string> = {
  active: "Conta ativa",
  invite_pending: "Convite pendente",
  invite_expired: "Convite expirado",
  disabled: "Conta desativada",
};

const ACCOUNT_STATUS_VARIANT: Record<GuardianLinkAccountStatus, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  invite_pending: "warning",
  invite_expired: "warning",
  disabled: "destructive",
};

const RELATIONSHIP_OPTIONS = ["FATHER", "MOTHER", "GUARDIAN", "SPONSOR", "OTHER"] as const;

interface FlagState {
  canViewAcademic: boolean;
  canViewAttendance: boolean;
  canViewFinance: boolean;
  canViewDocuments: boolean;
  canReceiveNotifications: boolean;
}

const FLAG_LABELS: { key: keyof FlagState; label: string }[] = [
  { key: "canViewAcademic", label: "Desempenho académico e notas" },
  { key: "canViewAttendance", label: "Frequência" },
  { key: "canViewFinance", label: "Pagamentos e faturação" },
  { key: "canViewDocuments", label: "Documentos" },
  { key: "canReceiveNotifications", label: "Receber notificações" },
];

interface Props {
  studentId: string;
  links: StudentGuardianLinkDto[];
  canManage: boolean;
}

export function StudentGuardiansCard({ studentId, links, canManage }: Props) {
  const router = useRouter();
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  const [busyLinkId, setBusyLinkId] = React.useState<string | null>(null);

  async function onResend(linkId: string) {
    setBusyLinkId(linkId);
    const res = await resendGuardianInviteAction(linkId, studentId);
    setBusyLinkId(null);
    if (res.success) {
      if (res.data?.inviteUrl) setInviteUrl(res.data.inviteUrl);
      toast.success("Convite reenviado");
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível reenviar o convite");
    }
  }

  async function onRemove(linkId: string) {
    setBusyLinkId(linkId);
    const res = await removeGuardianLinkAction(linkId, studentId);
    setBusyLinkId(null);
    if (res.success) {
      toast.success("Encarregado removido");
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível remover o encarregado");
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Encarregados</CardTitle>
          <span className="ml-auto">
            {canManage && (
              <AddGuardianDialog studentId={studentId} onInvite={setInviteUrl} />
            )}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum encarregado associado a este aluno.
          </p>
        ) : (
          links.map((link) => (
            <div key={link.linkId} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{link.guardianName}</span>
                {link.isPrimary && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="size-3" /> Principal
                  </Badge>
                )}
                <Badge variant="outline">
                  {GUARDIAN_RELATIONSHIP_LABELS[link.relationshipType] ?? link.relationshipType}
                </Badge>
                <Badge variant={ACCOUNT_STATUS_VARIANT[link.accountStatus]}>
                  {ACCOUNT_STATUS_LABELS[link.accountStatus]}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">{link.guardianEmail}</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {link.canViewAcademic && <PermBadge label="Académico" />}
                {link.canViewAttendance && <PermBadge label="Frequência" />}
                {link.canViewFinance && <PermBadge label="Financeiro" />}
                {link.canViewDocuments && <PermBadge label="Documentos" />}
                {link.canReceiveNotifications && <PermBadge label="Notificações" />}
              </div>

              {canManage && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(link.accountStatus === "invite_pending" || link.accountStatus === "invite_expired") && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busyLinkId === link.linkId}
                      onClick={() => onResend(link.linkId)}
                    >
                      <Send className="size-3.5" /> Reenviar convite
                    </Button>
                  )}
                  <EditGuardianDialog studentId={studentId} link={link} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    loading={busyLinkId === link.linkId}
                    onClick={() => onRemove(link.linkId)}
                  >
                    <Trash2 className="size-3.5" /> Remover
                  </Button>
                </div>
              )}
            </div>
          ))
        )}

        {inviteUrl && (
          <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Link de convite (mostrado apenas uma vez)
            </p>
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
      </CardContent>
    </Card>
  );
}

function PermBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{label}</span>
  );
}

function FlagCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}

function AddGuardianDialog({
  studentId,
  onInvite,
}: {
  studentId: string;
  onInvite: (url: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [relationshipType, setRelationshipType] = React.useState<string>("GUARDIAN");
  const [isPrimary, setIsPrimary] = React.useState(false);
  const [flags, setFlags] = React.useState<FlagState>({
    canViewAcademic: true,
    canViewAttendance: true,
    canViewFinance: false,
    canViewDocuments: true,
    canReceiveNotifications: true,
  });

  async function onSubmit() {
    setLoading(true);
    const input: AddGuardianInput = {
      studentId,
      guardianName: name,
      guardianEmail: email,
      relationshipType: relationshipType as AddGuardianInput["relationshipType"],
      isPrimary,
      ...flags,
    };
    const res = await addGuardianLinkAction(input);
    setLoading(false);
    if (res.success) {
      if (res.data?.inviteUrl) onInvite(res.data.inviteUrl);
      const status = res.data?.status;
      toast.success(
        status === "already_linked"
          ? "Este encarregado já estava associado"
          : status === "email_conflict"
            ? "Email já pertence a um aluno/professor — use outro email"
            : status === "missing_email"
              ? "Email em falta"
              : "Encarregado associado",
      );
      setOpen(false);
      setName("");
      setEmail("");
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível associar o encarregado");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-3.5" /> Adicionar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Encarregado</DialogTitle>
          <DialogDescription>
            Associe um encarregado de educação a este aluno e defina o que pode visualizar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="guardian-name">Nome</Label>
            <Input id="guardian-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guardian-email">Email</Label>
            <Input
              id="guardian-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.pt"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Parentesco</Label>
            <Select value={relationshipType} onValueChange={setRelationshipType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {GUARDIAN_RELATIONSHIP_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-medium text-muted-foreground">Visibilidade</p>
            {FLAG_LABELS.map((f) => (
              <FlagCheckbox
                key={f.key}
                id={`add-${f.key}`}
                label={f.label}
                checked={flags[f.key]}
                onChange={(v) => setFlags((prev) => ({ ...prev, [f.key]: v }))}
              />
            ))}
            <div className="pt-1">
              <FlagCheckbox
                id="add-primary"
                label="Encarregado principal"
                checked={isPrimary}
                onChange={setIsPrimary}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={loading} disabled={!name.trim() || !email.trim()}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditGuardianDialog({
  studentId,
  link,
}: {
  studentId: string;
  link: StudentGuardianLinkDto;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [relationshipType, setRelationshipType] = React.useState(link.relationshipType);
  const [isPrimary, setIsPrimary] = React.useState(link.isPrimary);
  const [flags, setFlags] = React.useState<FlagState>({
    canViewAcademic: link.canViewAcademic,
    canViewAttendance: link.canViewAttendance,
    canViewFinance: link.canViewFinance,
    canViewDocuments: link.canViewDocuments,
    canReceiveNotifications: link.canReceiveNotifications,
  });

  async function onSubmit() {
    setLoading(true);
    const res = await updateGuardianLinkAction({
      linkId: link.linkId,
      studentId,
      relationshipType: relationshipType as AddGuardianInput["relationshipType"],
      isPrimary,
      ...flags,
    });
    setLoading(false);
    if (res.success) {
      toast.success("Visibilidade atualizada");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível atualizar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Editar visibilidade
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Encarregado</DialogTitle>
          <DialogDescription>{link.guardianName} · {link.guardianEmail}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Parentesco</Label>
            <Select value={relationshipType} onValueChange={setRelationshipType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {GUARDIAN_RELATIONSHIP_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-medium text-muted-foreground">Visibilidade</p>
            {FLAG_LABELS.map((f) => (
              <FlagCheckbox
                key={f.key}
                id={`edit-${link.linkId}-${f.key}`}
                label={f.label}
                checked={flags[f.key]}
                onChange={(v) => setFlags((prev) => ({ ...prev, [f.key]: v }))}
              />
            ))}
            <div className="pt-1">
              <FlagCheckbox
                id={`edit-${link.linkId}-primary`}
                label="Encarregado principal"
                checked={isPrimary}
                onChange={setIsPrimary}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={loading}>
            Guardar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
