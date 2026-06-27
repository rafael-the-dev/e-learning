"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Toaster } from "@/shared/components/ui/toaster";
import { toast } from "@/shared/hooks/use-toast";
import { setPasswordAction } from "./actions";

interface Props {
  email: string;
  token: string;
}

export function SetPasswordForm({ email, token }: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const missingParams = !email || !token;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;

    if (password !== confirm) {
      toast.error("As palavras-passe não coincidem");
      return;
    }

    setLoading(true);
    const result = await setPasswordAction({ email, token, password });
    if (result.ok) {
      toast.success("Palavra-passe definida. Já pode iniciar sessão.");
      router.push("/login");
    } else {
      setLoading(false);
      toast.error(result.error ?? "Não foi possível definir a palavra-passe");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Definir Palavra-passe</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie a palavra-passe da sua conta do Portal do Aluno.
          </p>
        </div>

        {missingParams ? (
          <div className="rounded-xl border bg-background p-6 text-sm text-muted-foreground shadow-sm">
            Ligação de convite inválida. Contacte a secretaria para reenviar o convite.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-xl border bg-background p-6 space-y-4 shadow-sm">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" value={email} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Nova palavra-passe</Label>
              <Input id="password" name="password" type="password" required minLength={8} placeholder="••••••••" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirmar palavra-passe</Label>
              <Input id="confirm" name="confirm" type="password" required minLength={8} placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              Definir palavra-passe
            </Button>
          </form>
        )}
      </div>
      <Toaster />
    </div>
  );
}
