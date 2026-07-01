"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Sun,
  Moon,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  GraduationCap,
  BookOpen,
  Pencil,
  Ruler,
  Calculator,
  Globe,
  FlaskConical,
  Backpack,
  Notebook,
  PenTool,
  Compass,
  Microscope,
  Atom,
  Lightbulb,
  Award,
  Palette,
  Music,
  Library,
  type LucideIcon,
} from "lucide-react";
import { getPostLoginRedirect } from "../actions";

/** Valida o formato do e-mail no cliente (validação real acontece no servidor). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Marca "Lectario" (logos em /public/images/icons). São monocromáticas e
 * transparentes, por isso escolhe-se a variante que contrasta com o fundo —
 * tendo em conta a inversão de tema (o painel de marca usa `--primary`, que o
 * tema escuro inverte para claro).
 */
const MARK_WHITE = "/images/icons/lectario-mark-white-512.png";
const MARK_BLACK = "/images/icons/lectario-mark-black-512.png";

/**
 * Equipamento escolar espalhado pelo painel de marca como decoração subtil.
 * Posições/rotações fixas (determinísticas) para não divergir na hidratação.
 */
type ScatterItem = {
  Icon: LucideIcon;
  top: string;
  left: string;
  size: number;
  rotate: number;
  opacity: number;
};

const SCHOOL_ICONS: ScatterItem[] = [
  { Icon: GraduationCap, top: "7%", left: "12%", size: 46, rotate: -12, opacity: 0.05 },
  { Icon: BookOpen, top: "5%", left: "62%", size: 40, rotate: 10, opacity: 0.04 },
  { Icon: Pencil, top: "18%", left: "84%", size: 34, rotate: 24, opacity: 0.045 },
  { Icon: Compass, top: "30%", left: "30%", size: 38, rotate: -18, opacity: 0.035 },
  { Icon: FlaskConical, top: "26%", left: "70%", size: 42, rotate: 14, opacity: 0.04 },
  { Icon: Ruler, top: "42%", left: "8%", size: 40, rotate: 40, opacity: 0.045 },
  { Icon: Globe, top: "46%", left: "52%", size: 44, rotate: -8, opacity: 0.035 },
  { Icon: Calculator, top: "40%", left: "88%", size: 34, rotate: 12, opacity: 0.04 },
  { Icon: Atom, top: "58%", left: "26%", size: 42, rotate: 18, opacity: 0.04 },
  { Icon: Notebook, top: "62%", left: "66%", size: 36, rotate: -14, opacity: 0.045 },
  { Icon: Microscope, top: "72%", left: "14%", size: 44, rotate: -22, opacity: 0.04 },
  { Icon: PenTool, top: "70%", left: "44%", size: 32, rotate: 30, opacity: 0.035 },
  { Icon: Backpack, top: "78%", left: "82%", size: 42, rotate: 10, opacity: 0.045 },
  { Icon: Lightbulb, top: "88%", left: "34%", size: 36, rotate: -10, opacity: 0.04 },
  { Icon: Award, top: "90%", left: "70%", size: 38, rotate: 16, opacity: 0.04 },
  { Icon: Palette, top: "16%", left: "44%", size: 34, rotate: -16, opacity: 0.035 },
  { Icon: Music, top: "54%", left: "82%", size: 30, rotate: 22, opacity: 0.04 },
  { Icon: Library, top: "84%", left: "54%", size: 38, rotate: -6, opacity: 0.035 },
];

export function LoginForm() {
  const router = useRouter();

  const [dark, setDark] = React.useState(false);
  const [show, setShow] = React.useState(false);
  const [remember, setRemember] = React.useState(true);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [formError, setFormError] = React.useState(false);
  const [emailInvalid, setEmailInvalid] = React.useState(false);
  const [passInvalid, setPassInvalid] = React.useState(false);

  // Tema gerido pela classe global `.dark` no <html> (ver globals.css). Como a
  // app não tem theme provider, repõe-se o estado claro ao sair da página.
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    return () => root.classList.remove("dark");
  }, [dark]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    const nextEmailInvalid = !EMAIL_RE.test(trimmed);
    const nextPassInvalid = password.length === 0;
    if (nextEmailInvalid || nextPassInvalid) {
      setEmailInvalid(nextEmailInvalid);
      setPassInvalid(nextPassInvalid);
      return;
    }

    setLoading(true);
    setFormError(false);
    try {
      const result = await signIn("credentials", {
        email: trimmed,
        password,
        redirect: false,
      });
      if (result?.ok) {
        setDone(true);
        const destination = await getPostLoginRedirect();
        router.push(destination);
      } else {
        setLoading(false);
        setFormError(true);
      }
    } catch {
      // next-auth@5 beta: signIn() pode rejeitar com uma resposta mal-formada
      // mesmo quando authorize() teve sucesso e o cookie de sessão foi definido.
      // Credenciais inválidas nunca lançam aqui (authorize() resolve com null,
      // tratado no ramo `else`) — logo, um throw significa login bem-sucedido.
      setDone(true);
      const destination = await getPostLoginRedirect();
      router.push(destination);
    }
  }

  // Painel de formulário = fundo `--background`; a marca central usa a variante
  // que contrasta (preta no claro, branca no escuro).
  const surfaceMark = dark ? MARK_WHITE : MARK_BLACK;

  return (
    <div className="gl" style={{ display: "flex", minHeight: "100vh" }}>
      <style>{styles}</style>

      {/* ===== PAINEL DE MARCA ===== */}
      <aside
        className="gl-brand"
        style={{
          position: "relative",
          flex: "1 1 0",
          background: "var(--primary)",
          color: "var(--primary-foreground)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          padding: 48,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--primary-foreground) 14%, transparent) 1px, transparent 0)",
            backgroundSize: "26px 26px",
            opacity: 0.4,
            pointerEvents: "none",
          }}
        />
        {/* Equipamento escolar espalhado, em baixa opacidade. Usa
            `--primary-foreground` para contrastar com o painel em ambos os temas. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
            color: "var(--primary-foreground)",
          }}
        >
          {SCHOOL_ICONS.map(({ Icon, top, left, size, rotate, opacity }, i) => (
            <Icon
              key={i}
              size={size}
              strokeWidth={1.5}
              style={{
                position: "absolute",
                top,
                left,
                opacity,
                transform: `rotate(${rotate}deg)`,
              }}
            />
          ))}
        </div>

        <div style={{ position: "relative", margin: "auto 0" }}>
          <h2
            style={{
              fontSize: "clamp(1.7rem,2.6vw,2.3rem)",
              lineHeight: 1.12,
              letterSpacing: "-0.03em",
              fontWeight: 700,
              maxWidth: 380,
              textWrap: "balance",
            }}
          >
            Da inscrição à conclusão, toda a escola num só lugar.
          </h2>
          <p
            style={{
              marginTop: 16,
              fontSize: 15,
              lineHeight: 1.6,
              opacity: 0.7,
              maxWidth: 380,
              textWrap: "pretty",
            }}
          >
            Acede ao teu portal — alunos, formadores, secretaria, encarregados e
            administração, cada um com a sua visão.
          </p>
          <ul
            style={{
              margin: "28px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 13,
              maxWidth: 380,
            }}
          >
            {[
              "Multi-tenant com isolamento por organização",
              "Acessos por papel (RBAC) e auditoria de origem",
              "Académico, financeiro e relatórios integrados",
            ].map((item) => (
              <li
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  fontSize: 14,
                  opacity: 0.9,
                }}
              >
                <Check size={16} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ===== PAINEL DO FORMULÁRIO ===== */}
      <main
        style={{
          flex: "1 1 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          position: "relative",
          minHeight: "100vh",
        }}
      >
        <button
          className="gl-iconbtn"
          type="button"
          aria-label="Alternar tema claro/escuro"
          onClick={() => setDark((d) => !d)}
          style={{ position: "absolute", top: 24, right: 24 }}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: 380,
            animation: "gs-fade .4s ease both",
          }}
        >
          {/* marca + título */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              marginBottom: 30,
            }}
          >
            <Link
              href="/"
              aria-label="Lectario — ir para a página inicial"
              style={{ display: "inline-flex", marginBottom: 12 }}
            >
              <Image
                src={surfaceMark}
                alt="Lectario"
                width={64}
                height={64}
                priority
                style={{ width: 64, height: 64 }}
              />
            </Link>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              Bem-vindo de volta
            </h1>
            <p
              style={{
                marginTop: 6,
                fontSize: 14,
                color: "var(--muted-foreground)",
              }}
            >
              Inicie sessão para aceder ao seu portal.
            </p>
          </div>

          {done ? (
            /* ESTADO DE SUCESSO */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                border: "1px solid var(--border)",
                background: "var(--card)",
                borderRadius: "0.75rem",
                padding: "32px 24px",
                animation: "gs-fade .3s ease both",
              }}
            >
              <span
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 9999,
                  background: "oklch(0.95 0.05 150)",
                  color: "oklch(0.45 0.16 150)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 14,
                  animation: "gs-pop .35s ease both",
                }}
              >
                <Check size={26} strokeWidth={2.6} />
              </span>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Sessão iniciada</h2>
              <p
                style={{
                  marginTop: 6,
                  fontSize: 13.5,
                  color: "var(--muted-foreground)",
                }}
              >
                A redirecionar para o seu painel…
              </p>
            </div>
          ) : (
            /* FORMULÁRIO */
            <form
              onSubmit={handleSubmit}
              noValidate
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              {formError && (
                <div
                  role="alert"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    border:
                      "1px solid color-mix(in oklab, var(--destructive) 40%, var(--border))",
                    background:
                      "color-mix(in oklab, var(--destructive) 10%, var(--card))",
                    color: "var(--destructive)",
                    borderRadius: "0.5rem",
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    animation: "gs-fade .2s ease both",
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  E-mail ou palavra-passe inválidos.
                </div>
              )}

              <div
                style={{ display: "flex", flexDirection: "column", gap: 7 }}
              >
                <label
                  htmlFor="gl-email"
                  style={{ fontSize: 13.5, fontWeight: 500 }}
                >
                  E-mail
                </label>
                <input
                  id="gl-email"
                  name="email"
                  type="email"
                  className="gl-input"
                  placeholder="nome@instituicao.pt"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailInvalid(false);
                    setFormError(false);
                  }}
                  aria-invalid={emailInvalid}
                  aria-describedby="gl-email-err"
                />
                {emailInvalid && (
                  <span
                    id="gl-email-err"
                    style={{ fontSize: 12, color: "var(--destructive)" }}
                  >
                    Introduza um e-mail válido.
                  </span>
                )}
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 7 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <label
                    htmlFor="gl-pass"
                    style={{ fontSize: 13.5, fontWeight: 500 }}
                  >
                    Palavra-passe
                  </label>
                  <a
                    href="#"
                    className="gl-link"
                    style={{ fontSize: 12.5, fontWeight: 500 }}
                  >
                    Esqueceu-se?
                  </a>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    id="gl-pass"
                    name="password"
                    type={show ? "text" : "password"}
                    className="gl-input"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    style={{ paddingRight: 40 }}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPassInvalid(false);
                      setFormError(false);
                    }}
                    aria-invalid={passInvalid}
                    aria-describedby="gl-pass-err"
                  />
                  <button
                    type="button"
                    className="gl-eye"
                    aria-label="Mostrar ou ocultar palavra-passe"
                    onClick={() => setShow((s) => !s)}
                  >
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {passInvalid && (
                  <span
                    id="gl-pass-err"
                    style={{ fontSize: 12, color: "var(--destructive)" }}
                  >
                    Introduza a sua palavra-passe.
                  </span>
                )}
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontSize: 13.5,
                  color: "var(--muted-foreground)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  className="gl-check"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Manter sessão iniciada
              </label>

              <button type="submit" className="gl-btn" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="gl-spin" size={17} />
                    A entrar…
                  </>
                ) : (
                  "Entrar"
                )}
              </button>
            </form>
          )}

          <p
            style={{
              marginTop: 24,
              textAlign: "center",
              fontSize: 13,
              color: "var(--muted-foreground)",
            }}
          >
            Problemas a aceder?{" "}
            <a
              href="#"
              className="gl-link"
              style={{
                fontWeight: 500,
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              Contacte a secretaria
            </a>
          </p>
        </div>

        <p
          style={{
            position: "absolute",
            bottom: 22,
            fontSize: 12,
            color: "var(--muted-foreground)",
          }}
        >
          © 2026 Lectario
        </p>
      </main>
    </div>
  );
}

const styles = `
  @keyframes gs-fade { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
  @keyframes gs-spin { to { transform:rotate(360deg) } }
  @keyframes gs-pop { 0%{ transform:scale(.6); opacity:0 } 60%{ transform:scale(1.08) } 100%{ transform:scale(1); opacity:1 } }
  .gl{
    background:var(--background); color:var(--foreground); min-height:100vh;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .gl *{ box-sizing:border-box; }
  .gl a{ color:inherit; text-decoration:none; }
  .gl-input{ width:100%; height:40px; border:1px solid var(--border); background:var(--card); color:var(--foreground); border-radius:0.5rem; padding:0 12px; font-size:14px; font-family:inherit; transition:border-color .15s, box-shadow .15s; outline:none; }
  .gl-input::placeholder{ color:var(--muted-foreground); }
  .gl-input:focus{ border-color:var(--ring); box-shadow:0 0 0 3px color-mix(in oklab, var(--ring) 35%, transparent); }
  .gl-input[aria-invalid="true"]{ border-color:var(--destructive); }
  .gl-input[aria-invalid="true"]:focus{ box-shadow:0 0 0 3px color-mix(in oklab, var(--destructive) 30%, transparent); }
  .gl-btn{ width:100%; height:42px; border:none; border-radius:0.5rem; background:var(--primary); color:var(--primary-foreground); font-size:14.5px; font-weight:600; font-family:inherit; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:opacity .15s; }
  .gl-btn:hover{ opacity:.9; }
  .gl-btn:disabled{ opacity:.6; cursor:default; }
  .gl-link{ color:var(--muted-foreground); transition:color .15s; }
  .gl-link:hover{ color:var(--foreground); }
  .gl-eye{ position:absolute; right:6px; top:50%; transform:translateY(-50%); width:30px; height:30px; border:none; background:transparent; color:var(--muted-foreground); border-radius:0.4rem; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:color .15s, background .15s; }
  .gl-eye:hover{ color:var(--foreground); background:var(--muted); }
  .gl-iconbtn{ width:36px; height:36px; border-radius:0.5rem; border:1px solid var(--border); background:transparent; color:var(--foreground); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s; }
  .gl-iconbtn:hover{ background:var(--muted); }
  .gl-check{ appearance:none; -webkit-appearance:none; width:16px; height:16px; border:1px solid var(--border); border-radius:0.3rem; background:var(--card); cursor:pointer; position:relative; flex-shrink:0; transition:background .15s, border-color .15s; }
  .gl-check:checked{ background:var(--primary); border-color:var(--primary); }
  .gl-check:checked::after{ content:""; position:absolute; left:4.5px; top:1.5px; width:4px; height:8px; border:solid var(--primary-foreground); border-width:0 2px 2px 0; transform:rotate(45deg); }
  .gl-spin{ animation:gs-spin .7s linear infinite; }
  @media (max-width:880px){ .gl-brand{ display:none !important; } }
`;
