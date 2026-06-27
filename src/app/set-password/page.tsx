import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Definir Palavra-passe" };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token = "", email = "" } = await searchParams;
  return <SetPasswordForm email={email} token={token} />;
}
