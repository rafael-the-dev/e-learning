import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LandingPage } from "./_components/landing-page";

export const metadata: Metadata = {
  title: "Gestão Escolar — Da inscrição à conclusão, toda a escola num só lugar",
  description:
    "Plataforma multi-tenant de gestão escolar: alunos, formadores, cursos, turmas, faturação e relatórios — com isolamento por organização, RBAC e auditoria.",
};

export default async function RootPage() {
  const session = await auth();
  if (session?.user) redirect("/organizations");
  return <LandingPage />;
}
