"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/server/db";
import {
  verifyStudentPortalInvite,
  consumeStudentPortalInvite,
} from "@/modules/users/services/account-invite.service";
import { findUserByEmail } from "@/modules/users/repositories/user.repository";

const setPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  password: z.string().min(8, "A palavra-passe deve ter pelo menos 8 caracteres"),
});

export interface SetPasswordResult {
  ok: boolean;
  error?: string;
}

/**
 * Consumes a student-portal invite token and sets the account password.
 * Public (unauthenticated) — security comes entirely from the single-use,
 * time-limited token bound to the email.
 */
export async function setPasswordAction(input: {
  email: string;
  token: string;
  password: string;
}): Promise<SetPasswordResult> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { email, token, password } = parsed.data;

  const check = await verifyStudentPortalInvite(email, token);
  if (!check.valid) {
    return { ok: false, error: "Este convite é inválido ou já expirou. Contacte a secretaria." };
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return { ok: false, error: "Conta não encontrada." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const db = await getDb();
  await db.user.update({ where: { id: user.id }, data: { passwordHash, isActive: true } });

  // Single-use: burn the token only after the password is successfully set.
  await consumeStudentPortalInvite(token);

  return { ok: true };
}
