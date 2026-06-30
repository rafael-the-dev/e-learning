import type { Metadata } from "next";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = {
  title: "Iniciar sessão — Lectario",
  description: "Inicie sessão para aceder ao seu portal da plataforma Lectario.",
};

export default function LoginPage() {
  return <LoginForm />;
}
