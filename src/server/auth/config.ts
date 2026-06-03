import type { NextAuthConfig } from "next-auth";

// Edge-compatible config — no Node.js-only imports (no DB, no bcrypt, no mssql).
// Used in proxy.ts (middleware) which runs in the Edge runtime.
// Full auth config with providers lives in index.ts.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      return session;
    },
  },
};
