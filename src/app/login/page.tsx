"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Toaster } from "@/shared/components/ui/toaster";
import { toast } from "@/shared/hooks/use-toast";
import { LayoutDashboard } from "lucide-react";
import { getPostLoginRedirect } from "./actions";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: form.get("email") as string,
        password: form.get("password") as string,
        redirect: false,
      });
      if (result?.ok) {
        const destination = await getPostLoginRedirect();
        router.push(destination);
      } else {
        setLoading(false);
        toast.error("E-mail ou palavra-passe inválidos");
      }
    } catch {
      // next-auth@5 beta: signIn() can reject with a client-side response-shape
      // mismatch even when authorize() succeeded and the session cookie was set.
      // Invalid credentials never throw here (authorize() resolves with null,
      // handled by the `else` branch above) — so a throw means login succeeded.
      const destination = await getPostLoginRedirect();
      router.push(destination);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-xl bg-primary flex items-center justify-center">
            <LayoutDashboard className="size-5 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold">Gestão Escolar</h1>
            <p className="text-sm text-muted-foreground mt-1">Iniciar sessão na sua conta</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border bg-background p-6 space-y-4 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required autoFocus placeholder="admin@exemplo.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Palavra-passe</Label>
            <Input id="password" name="password" type="password" required placeholder="••••••••" />
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Entrar
          </Button>
        </form>
      </div>
      <Toaster />
    </div>
  );
}
