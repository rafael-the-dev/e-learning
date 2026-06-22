"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { duplicateOrganizationRoleAction } from "@/modules/roles/actions/role.actions";
import { ROLE_LABELS } from "@/modules/users/types";
import type { OrganizationRoleOption } from "@/modules/roles/repositories/organization-role.repository";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleOptions: OrganizationRoleOption[];
  defaultSourceId?: string;
  onSuccess: () => void;
}

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function slugifyCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function DuplicateRoleDialog({ open, onOpenChange, roleOptions, defaultSourceId, onSuccess }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [sourceRoleId, setSourceRoleId] = useState<string | undefined>(defaultSourceId);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setSourceRoleId(defaultSourceId);
      setName("");
      setCode("");
      setCodeTouched(false);
    }
  }, [open, defaultSourceId]);

  function handleNameChange(value: string) {
    setName(value);
    if (!codeTouched) setCode(slugifyCode(value));
  }

  function handleSubmit() {
    if (!sourceRoleId || !name || !code) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      const result = await duplicateOrganizationRoleAction({ sourceRoleId, name, code });
      if (result.success) {
        toast({ title: "Role duplicada." });
        onOpenChange(false);
        onSuccess();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicar Role</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Role de origem *</Label>
            <Select value={sourceRoleId} onValueChange={setSourceRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {ROLE_LABELS[role.name] ?? role.name}
                    {role.code ? ` (${role.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              As permissões da role de origem são copiadas. Os utilizadores não são copiados.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Nome da nova role *</Label>
            <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Formador Júnior" />
          </div>

          <div className="space-y-1.5">
            <Label>Código *</Label>
            <Input
              value={code}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(slugifyCode(e.target.value));
              }}
              placeholder="FORMADOR_JUNIOR"
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={pending}>
            Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
