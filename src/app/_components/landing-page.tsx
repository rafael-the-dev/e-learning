"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sun,
  Moon,
  ArrowRight,
  Check,
  Users,
  Building2,
  GraduationCap,
  Gauge,
  CreditCard,
  ClipboardCheck,
  ClipboardList,
  BookOpen,
  CalendarDays,
  Presentation,
  FileText,
  Bell,
  ShieldCheck,
  History,
  BarChart3,
  ChevronDown,
} from "lucide-react";

type View = "family" | "admin";

export function LandingPage() {
  const [dark, setDark] = React.useState(false);
  const [view, setView] = React.useState<View>("family");

  // Drive theming through the global `.dark` class on <html> (see globals.css).
  // Restore the original (light) state when leaving the public landing page so
  // the rest of the app — which has no global theme provider — is unaffected.
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    return () => root.classList.remove("dark");
  }, [dark]);

  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        fontFamily:
          'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
        WebkitFontSmoothing: "antialiased",
        minHeight: "100vh",
      }}
    >
      <style>{styles}</style>

      {/* ===================== NAVBAR ===================== */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in oklab, var(--background) 82%, transparent)",
          backdropFilter: "saturate(160%) blur(12px)",
          WebkitBackdropFilter: "saturate(160%) blur(12px)",
        }}
      >
        <nav
          aria-label="Principal"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 32px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <a href="#topo" style={brand(15)}>
            <img
              src={
                dark
                  ? "/images/logo/racio-horizontal-white-transparent.png"
                  : "/images/logo/racio-horizontal-black-transparent.png"
              }
              alt="Racio — Gestão Escolar"
              style={{ height: 30, width: "auto", display: "block" }}
            />
          </a>
          <div
            className="gs-navlinks"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 30,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <a className="gs-link" href="#funcionalidades">
              Funcionalidades
            </a>
            <a className="gs-link" href="#portais">
              Portais
            </a>
            <a className="gs-link" href="#seguranca">
              Segurança
            </a>
            <a className="gs-link" href="#faq">
              FAQ
            </a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="gs-iconbtn"
              type="button"
              aria-label="Alternar tema"
              onClick={() => setDark((d) => !d)}
              style={{
                width: 36,
                height: 36,
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--foreground)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "background .15s",
              }}
            >
              {dark ? <Sun width={17} height={17} /> : <Moon width={17} height={17} />}
            </button>
            <Link
              href="/login"
              className="gs-link"
              style={{
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 14px",
                borderRadius: "0.5rem",
              }}
            >
              Entrar
            </Link>
            <Link href="/login" className="gs-btn-primary" style={btnPrimary(14, "9px 16px")}>
              Começar
              <ArrowRight width={15} height={15} />
            </Link>
          </div>
        </nav>
      </header>

      <main id="topo">
        {/* ===================== HERO ===================== */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "84px 32px 72px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 56, alignItems: "center" }}>
            <div style={{ flex: "1 1 420px", minWidth: 300 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--muted-foreground)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  borderRadius: 9999,
                  padding: "5px 12px",
                  marginBottom: 24,
                }}
              >
                <span
                  style={{ width: 6, height: 6, borderRadius: 9999, background: "#10b981" }}
                />
                Plataforma multi-tenant de gestão escolar
              </span>
              <h1
                style={{
                  fontSize: "clamp(2.3rem,5vw,3.6rem)",
                  lineHeight: 1.04,
                  letterSpacing: "-0.03em",
                  fontWeight: 600,
                  textWrap: "balance",
                }}
              >
                Da inscrição à conclusão, toda a escola num só lugar.
              </h1>
              <p
                style={{
                  marginTop: 22,
                  fontSize: "clamp(1rem,1.5vw,1.18rem)",
                  lineHeight: 1.6,
                  color: "var(--muted-foreground)",
                  maxWidth: 560,
                  textWrap: "pretty",
                }}
              >
                Gerimos o ciclo académico e operacional completo — alunos, formadores, cursos,
                turmas, faturação e relatórios — com isolamento por organização, controlo de
                acessos e auditoria de origem.
              </p>
              <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12 }}>
                <Link href="/login" className="gs-btn-primary" style={btnPrimary(15, "12px 22px", "0.625rem")}>
                  Começar
                  <ArrowRight width={16} height={16} />
                </Link>
                <a href="#portais" className="gs-btn-outline" style={btnOutline(15, "12px 22px", "0.625rem")}>
                  Ver os portais
                </a>
              </div>
              <div
                style={{
                  marginTop: 34,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 24,
                  fontSize: 13,
                  color: "var(--muted-foreground)",
                }}
              >
                {[
                  "Isolamento por tenant",
                  "RBAC com papéis personalizados",
                  "Importação CSV/XLSX",
                ].map((t) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Check width={15} height={15} strokeWidth={2.2} />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Product preview mock — alterna entre visão de famílias e administração */}
            <div style={{ flex: "1 1 460px", minWidth: 300 }}>
              <div
                role="tablist"
                aria-label="Escolher visão"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: 4,
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 9999,
                  marginBottom: 16,
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "family"}
                  onClick={() => setView("family")}
                  className={`gs-seg${view === "family" ? " gs-seg-on" : ""}`}
                >
                  <Users width={14} height={14} />
                  Alunos e famílias
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "admin"}
                  onClick={() => setView("admin")}
                  className={`gs-seg${view === "admin" ? " gs-seg-on" : ""}`}
                >
                  <Building2 width={14} height={14} />
                  Administração
                </button>
              </div>

              {view === "family" ? <FamilyPreview /> : <AdminPreview />}
            </div>
          </div>
        </section>

        {/* ===================== TRUST STRIP ===================== */}
        <section
          style={{
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            background: "var(--muted)",
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              padding: "22px 32px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "14px 36px",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>
              Concebido para o ciclo completo de escolas e centros de formação
            </span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {["Multi-tenant", "RBAC", "Auditoria", "Pré-requisitos", "Carteiras de aluno"].map(
                (t) => (
                  <span key={t} style={pill}>
                    {t}
                  </span>
                )
              )}
            </span>
          </div>
        </section>

        {/* ===================== FUNCIONALIDADES ===================== */}
        <section
          id="funcionalidades"
          style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px", scrollMarginTop: 80 }}
        >
          <div style={{ maxWidth: 660, marginBottom: 48 }}>
            <span style={eyebrow}>FUNCIONALIDADES</span>
            <h2 style={sectionTitle}>Um sistema para todo o percurso académico</h2>
            <p style={sectionLead}>
              Cada módulo encaixa no seguinte — da matrícula à pauta, da fatura ao recibo — sem
              folhas de cálculo soltas nem ferramentas paralelas.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
              gap: 18,
            }}
          >
            {FEATURES.map((f) => (
              <div key={f.title} className="gs-card-lift" style={featureCard}>
                <div style={iconTile(42)}>
                  <f.icon width={20} height={20} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>
                  {f.title}
                </h3>
                <p
                  style={{
                    marginTop: 8,
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "var(--muted-foreground)",
                  }}
                >
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ===================== PORTAIS ===================== */}
        <section
          id="portais"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--muted)",
            scrollMarginTop: 64,
          }}
        >
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>
            <div style={{ maxWidth: 660, marginBottom: 48 }}>
              <span style={eyebrow}>PORTAIS</span>
              <h2 style={sectionTitle}>Um portal para cada papel</h2>
              <p style={sectionLead}>
                Cada pessoa entra e vê exatamente o que precisa — nada mais. As permissões são
                herdadas do papel, com isolamento por organização.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(258px,1fr))",
                gap: 18,
              }}
            >
              {PORTALS.map((p) => (
                <div
                  key={p.path}
                  className="gs-card-lift"
                  style={{ ...featureCard, display: "flex", flexDirection: "column" }}
                >
                  <div style={{ marginBottom: 16 }}>
                    <span style={iconTilePrimary(42)}>
                      <p.icon width={20} height={20} />
                    </span>
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {p.title}
                  </h3>
                  <p
                    style={{
                      marginTop: 8,
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {p.desc}
                  </p>
                  <ul
                    style={{
                      margin: "16px 0 0",
                      padding: 0,
                      listStyle: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 9,
                    }}
                  >
                    {p.items.map((it) => (
                      <li
                        key={it}
                        style={{ display: "flex", gap: 9, fontSize: 13.5, color: "var(--foreground)" }}
                      >
                        <Check
                          width={15}
                          height={15}
                          strokeWidth={2.2}
                          style={{ flexShrink: 0, marginTop: 2, color: "var(--muted-foreground)" }}
                        />
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Executive dashboard strip */}
            <div
              style={{
                marginTop: 18,
                border: "1px solid var(--border)",
                borderRadius: "0.875rem",
                background: "var(--card)",
                padding: 28,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  minWidth: 280,
                  flex: "1 1 420px",
                }}
              >
                <span style={{ ...iconTilePrimary(48), flexShrink: 0, borderRadius: "0.75rem" }}>
                  <Gauge width={23} height={23} />
                </span>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    Dashboard Executivo
                  </h3>
                  <p
                    style={{
                      marginTop: 5,
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: "var(--muted-foreground)",
                      maxWidth: 520,
                      textWrap: "pretty",
                    }}
                  >
                    Para a gestão: health score da organização, KPIs académicos e financeiros e
                    watchlists que apontam onde agir primeiro.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["Health score", "KPIs", "Watchlists"].map((t) => (
                  <span key={t} style={pillMuted}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===================== SEGURANÇA / CONFIANÇA ===================== */}
        <section
          id="seguranca"
          style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px", scrollMarginTop: 80 }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 56, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 360px", minWidth: 280, position: "sticky", top: 96 }}>
              <span style={eyebrow}>CONFIANÇA</span>
              <h2 style={sectionTitle}>Construído para várias escolas, sem misturar dados</h2>
              <p style={sectionLead}>
                A arquitetura multi-tenant mantém cada organização isolada, e cada ação fica
                registada. A gestão dorme descansada.
              </p>
              <a
                href="/login"
                className="gs-btn-outline"
                style={{ ...btnOutline(14, "11px 18px", "0.625rem"), marginTop: 24 }}
              >
                Falar com a equipa
                <ArrowRight width={15} height={15} />
              </a>
            </div>
            <div
              style={{
                flex: "1 1 460px",
                minWidth: 300,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                gap: 16,
              }}
            >
              {TRUST.map((t) => (
                <div
                  key={t.title}
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    padding: 22,
                  }}
                >
                  <div style={iconTile(40)}>
                    <t.icon width={19} height={19} />
                  </div>
                  <h3 style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {t.title}
                  </h3>
                  <p
                    style={{
                      marginTop: 7,
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {t.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== FAQ ===================== */}
        <section
          id="faq"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--muted)",
            scrollMarginTop: 64,
          }}
        >
          <div style={{ maxWidth: 820, margin: "0 auto", padding: "96px 32px" }}>
            <div style={{ textAlign: "center", marginBottom: 44 }}>
              <span style={eyebrow}>FAQ</span>
              <h2 style={sectionTitle}>Perguntas frequentes</h2>
            </div>

            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0.875rem",
                overflow: "hidden",
              }}
            >
              {FAQ.map((f, i) => (
                <details
                  key={f.q}
                  className="gs-faq"
                  open={i === 0}
                  style={i === FAQ.length - 1 ? { borderBottom: "none" } : undefined}
                >
                  <summary
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "20px 24px",
                      fontSize: 15.5,
                      fontWeight: 600,
                    }}
                  >
                    {f.q}
                    <ChevronDown
                      className="gs-chev"
                      width={18}
                      height={18}
                      style={{ flexShrink: 0, color: "var(--muted-foreground)" }}
                    />
                  </summary>
                  <p
                    className="gs-ans"
                    style={{
                      padding: "0 24px 22px",
                      fontSize: 14.5,
                      lineHeight: 1.6,
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== CTA FINAL ===================== */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "1.25rem",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              padding: "clamp(40px,6vw,72px)",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--primary-foreground) 18%, transparent) 1px, transparent 0)",
                backgroundSize: "22px 22px",
                opacity: 0.5,
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative" }}>
              <h2
                style={{
                  fontSize: "clamp(1.9rem,4vw,2.8rem)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.03em",
                  fontWeight: 600,
                  textWrap: "balance",
                  maxWidth: 640,
                  margin: "0 auto",
                }}
              >
                Pronto para gerir a escola de ponta a ponta?
              </h2>
              <p
                style={{
                  margin: "18px auto 0",
                  fontSize: "1.08rem",
                  lineHeight: 1.6,
                  maxWidth: 520,
                  opacity: 0.8,
                  textWrap: "pretty",
                }}
              >
                Da inscrição à conclusão, com todos os papéis no mesmo lugar. Comece hoje.
              </p>
              <div
                style={{
                  marginTop: 32,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  justifyContent: "center",
                }}
              >
                <Link
                  href="/login"
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "13px 24px",
                    borderRadius: "0.625rem",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    transition: "opacity .15s",
                  }}
                >
                  Começar
                  <ArrowRight width={16} height={16} />
                </Link>
                <Link
                  href="/login"
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "13px 24px",
                    borderRadius: "0.625rem",
                    border:
                      "1px solid color-mix(in oklab, var(--primary-foreground) 35%, transparent)",
                    color: "var(--primary-foreground)",
                    transition: "background .15s",
                  }}
                >
                  Entrar
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ===================== FOOTER ===================== */}
      <footer style={{ borderTop: "1px solid var(--border)", background: "var(--card)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 32px 40px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 48, justifyContent: "space-between" }}>
            <div style={{ maxWidth: 300 }}>
              <a href="#topo" style={brand(15)}>
                <img
                  src={
                    dark
                      ? "/images/logo/racio-horizontal-white-transparent.png"
                      : "/images/logo/racio-horizontal-black-transparent.png"
                  }
                  alt="Racio — Gestão Escolar"
                  style={{ height: 28, width: "auto", display: "block" }}
                />
              </a>
              <p
                style={{
                  marginTop: 14,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "var(--muted-foreground)",
                }}
              >
                A plataforma multi-tenant que acompanha o aluno da inscrição à conclusão.
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                gap: 40,
                flex: "1 1 420px",
                maxWidth: 560,
              }}
            >
              {FOOTER_COLS.map((col) => (
                <div key={col.title}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
                    {col.title}
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 11,
                      fontSize: 13.5,
                    }}
                  >
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <a className="gs-link" href={l.href}>
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              marginTop: 48,
              paddingTop: 24,
              borderTop: "1px solid var(--border)",
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
              © 2026 Racio. Todos os direitos reservados.
            </span>
            <span
              style={{ fontSize: 12.5, color: "var(--muted-foreground)", display: "flex", gap: 20 }}
            >
              <a className="gs-link" href="#topo">
                Termos
              </a>
              <a className="gs-link" href="#topo">
                Privacidade
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ===================== HERO PREVIEW CARDS ===================== */

function PreviewChrome({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "0.875rem",
        background: "var(--card)",
        boxShadow:
          "0 24px 60px -28px rgba(0,0,0,.35),0 2px 8px -4px rgba(0,0,0,.1)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--muted)",
        }}
      >
        <span style={dot("#ef4444")} />
        <span style={dot("#f59e0b")} />
        <span style={dot("#10b981")} />
        <span
          style={{
            marginLeft: 10,
            fontSize: 11.5,
            fontWeight: 500,
            color: "var(--muted-foreground)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {icon}
          {label}
        </span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function FamilyPreview() {
  return (
    <PreviewChrome icon={<GraduationCap width={12} height={12} />} label="Portal do Aluno">
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 9999,
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          AN
        </span>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Boa tarde, Ana
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontWeight: 500 }}>
            10.º B · Curso de Design
          </div>
        </div>
      </div>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "0.625rem",
          padding: 13,
          marginBottom: 12,
        }}
      >
        <div style={miniLabel}>Próxima aula</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Matemática Aplicada</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
              Sala 204 · Prof. Silva
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 9999,
              background: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            10:30
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <StatTile label="Assiduidade" value="96%" hint="este período" hintColor="#059669" />
        <StatTile label="Média atual" value="15,4" hint="em 20 valores" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <RowItem
          icon={<CreditCard width={13} height={13} />}
          label="Mensalidade de junho"
          badge="Vence 5 jun"
          badgeBg="#dbeafe"
          badgeColor="#1e40af"
        />
        <RowItem
          icon={<ClipboardCheck width={13} height={13} />}
          label="Teste de Português entregue"
          badge="16 valores"
          badgeBg="#d1fae5"
          badgeColor="#065f46"
        />
      </div>
    </PreviewChrome>
  );
}

function AdminPreview() {
  return (
    <PreviewChrome icon={<Gauge width={12} height={12} />} label="Dashboard Executivo">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 500 }}>
            Centro de Formação · Sede
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 2 }}>
            Visão Geral — Ano Letivo 25/26
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: 9999,
            background: "#d1fae5",
            color: "#065f46",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 9999, background: "#10b981" }} />
          Saudável 92
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <StatTile label="Alunos ativos" value="1 248" hint="▲ 4,2%" hintColor="#059669" />
        <StatTile label="Receita do mês" value="€ 86,4k" hint="▲ 7,1%" hintColor="#059669" />
        <StatTile label="Taxa de conclusão" value="87%" hint="— estável" />
      </div>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "0.625rem",
          padding: "13px 13px 9px",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 600 }}>Inscrições por mês</span>
          <span style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>Set → Jun</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 74 }}>
          {[
            { h: "38%", o: 0.18, primary: false },
            { h: "54%", o: 0.22, primary: false },
            { h: "46%", o: 0.18, primary: false },
            { h: "70%", o: 0.28, primary: false },
            { h: "62%", o: 0.22, primary: false },
            { h: "88%", o: 1, primary: true },
            { h: "74%", o: 0.28, primary: false },
            { h: "58%", o: 0.2, primary: false },
          ].map((bar, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: bar.h,
                background: bar.primary ? "var(--primary)" : "var(--foreground)",
                opacity: bar.primary ? 1 : bar.o,
                borderRadius: "3px 3px 0 0",
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <RowItem
          avatar="MS"
          label="Pagamentos em atraso"
          badge="12 a rever"
          badgeBg="#fef3c7"
          badgeColor="#92400e"
        />
        <RowItem
          avatar="AV"
          label="Pautas por lançar"
          badge="3 turmas"
          badgeBg="#dbeafe"
          badgeColor="#1e40af"
        />
      </div>
    </PreviewChrome>
  );
}

function StatTile({
  label,
  value,
  hint,
  hintColor,
}: {
  label: string;
  value: string;
  hint: string;
  hintColor?: string;
}) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "0.625rem", padding: 11 }}>
      <div style={{ fontSize: 10.5, color: "var(--muted-foreground)", fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 3 }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: hintColor ?? "var(--muted-foreground)",
          fontWeight: 600,
          marginTop: 2,
        }}
      >
        {hint}
      </div>
    </div>
  );
}

function RowItem({
  icon,
  avatar,
  label,
  badge,
  badgeBg,
  badgeColor,
}: {
  icon?: React.ReactNode;
  avatar?: string;
  label: string;
  badge: string;
  badgeBg: string;
  badgeColor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        padding: "9px 11px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {avatar ? (
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 9999,
              background: "var(--muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--muted-foreground)",
            }}
          >
            {avatar}
          </span>
        ) : (
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: "0.4rem",
              background: "var(--muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted-foreground)",
            }}
          >
            {icon}
          </span>
        )}
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</span>
      </div>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 9999,
          background: badgeBg,
          color: badgeColor,
          whiteSpace: "nowrap",
        }}
      >
        {badge}
      </span>
    </div>
  );
}

/* ===================== DATA ===================== */

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Inscrições e matrículas",
    desc: "Da candidatura à matrícula confirmada, com inscrição em cursos, níveis e disciplinas e validação de pré-requisitos.",
  },
  {
    icon: BookOpen,
    title: "Cursos, níveis e disciplinas",
    desc: "Estruture a oferta formativa em níveis e disciplinas, com pré-requisitos e regras de progressão automáticas.",
  },
  {
    icon: CalendarDays,
    title: "Turmas, horários e salas",
    desc: "Organize turmas, gere horários e reserve salas para aulas teóricas e práticas, sem sobreposições.",
  },
  {
    icon: GraduationCap,
    title: "Avaliações, notas e progressão",
    desc: "Motor de avaliação com pautas, médias e progressão de nível segundo as políticas definidas por curso.",
  },
  {
    icon: CreditCard,
    title: "Faturação e pagamentos",
    desc: "Faturas, recibos, carteiras de aluno e políticas de cobrança, com integridade financeira garantida.",
  },
  {
    icon: Presentation,
    title: "Aulas e assiduidade",
    desc: "Registo de aulas e marcação de presenças por sessão, com indicadores de assiduidade por aluno e turma.",
  },
  {
    icon: FileText,
    title: "Relatórios e importações",
    desc: "Relatórios académicos e financeiros prontos a usar, com importação em massa por CSV/XLSX.",
  },
  {
    icon: Bell,
    title: "Notificações",
    desc: "Centro de notificações para avisar alunos, formadores e encarregados sobre prazos, notas e pagamentos.",
  },
] as const;

const PORTALS = [
  {
    icon: GraduationCap,
    path: "/student",
    title: "Aluno",
    desc: "O percurso académico do próprio aluno, sempre à mão.",
    items: ["Percurso e progressão", "Notas e horário", "Pagamentos e recibos"],
  },
  {
    icon: Presentation,
    path: "/teacher",
    title: "Formador",
    desc: "O workspace diário de quem dá aulas e avalia.",
    items: ["Turmas e horário do dia", "Lançamento de avaliações", "Marcação de assiduidade"],
  },
  {
    icon: ClipboardList,
    path: "/secretary",
    title: "Secretaria",
    desc: "As filas operacionais e financeiras do dia a dia.",
    items: ["Filas de inscrições e matrículas", "Finanças e cobranças", "Prazos e pendências"],
  },
  {
    icon: Users,
    path: "/guardian",
    title: "Encarregado de educação",
    desc: "Acompanhamento próximo de cada educando.",
    items: ["Notas e assiduidade dos educandos", "Pagamentos e recibos", "Avisos e notificações"],
  },
] as const;

const TRUST = [
  {
    icon: Building2,
    title: "Multi-tenant isolado",
    desc: "Organizações e filiais com dados separados por tenant — nenhuma escola vê os dados de outra.",
  },
  {
    icon: ShieldCheck,
    title: "RBAC personalizável",
    desc: "Papéis à medida da escola e permissões granulares — cada utilizador acede só ao que lhe compete.",
  },
  {
    icon: History,
    title: "Auditoria de origem",
    desc: "Quem fez o quê e quando. Cada alteração relevante deixa rasto, pronto para inspeção.",
  },
  {
    icon: BarChart3,
    title: "Relatórios em tempo real",
    desc: "Indicadores académicos e financeiros sempre atualizados, exportáveis quando precisar.",
  },
] as const;

const FAQ = [
  {
    q: "Posso gerir várias escolas ou filiais na mesma conta?",
    a: "Sim. A plataforma é multi-tenant: organizações e filiais ficam isoladas entre si, com dados, utilizadores e relatórios separados por tenant, sob a mesma estrutura.",
  },
  {
    q: "Como funcionam os acessos e as permissões?",
    a: "Através de RBAC com papéis personalizados. Define os papéis que fizerem sentido para a sua escola e as permissões granulares de cada um — alunos, formadores, secretaria e encarregados veem apenas o que lhes compete.",
  },
  {
    q: "Consigo importar os dados que já tenho?",
    a: "Sim. Pode importar alunos, formadores e outros registos em massa por ficheiros CSV ou XLSX, com validação antes de confirmar a importação.",
  },
  {
    q: "A faturação e os pagamentos estão incluídos?",
    a: "Estão. Faturas, recibos, carteiras de aluno e políticas de cobrança fazem parte do núcleo, com regras de integridade financeira e relatórios financeiros dedicados.",
  },
  {
    q: "Existe registo das alterações feitas no sistema?",
    a: "Sim. As ações relevantes ficam auditadas — com autor, data e contexto — para que a gestão tenha sempre rasto do que mudou e por quem.",
  },
] as const;

const FOOTER_COLS = [
  {
    title: "Produto",
    links: [
      { label: "Funcionalidades", href: "#funcionalidades" },
      { label: "Portais", href: "#portais" },
      { label: "Segurança", href: "#seguranca" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Portais",
    links: [
      { label: "Aluno", href: "/login" },
      { label: "Formador", href: "/login" },
      { label: "Secretaria", href: "/login" },
      { label: "Encarregado", href: "/login" },
    ],
  },
  {
    title: "Conta",
    links: [
      { label: "Entrar", href: "/login" },
      { label: "Começar", href: "/login" },
    ],
  },
] as const;

/* ===================== SHARED STYLE HELPERS ===================== */

const eyebrow: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--muted-foreground)",
  letterSpacing: ".02em",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "clamp(1.7rem,3.5vw,2.4rem)",
  lineHeight: 1.1,
  letterSpacing: "-0.025em",
  fontWeight: 600,
  marginTop: 12,
  textWrap: "balance",
};

const sectionLead: React.CSSProperties = {
  marginTop: 14,
  fontSize: "1.05rem",
  lineHeight: 1.6,
  color: "var(--muted-foreground)",
  textWrap: "pretty",
};

const featureCard: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  padding: 24,
};

const pill: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 500,
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  borderRadius: 9999,
  padding: "4px 11px",
};

const pillMuted: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  background: "var(--muted)",
  borderRadius: 9999,
  padding: "6px 13px",
};

const miniLabel: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--muted-foreground)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: ".03em",
  marginBottom: 8,
};

function brand(fontSize: number): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 600,
    fontSize,
    letterSpacing: "-0.01em",
  };
}

function iconTile(size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: "0.625rem",
    background: "var(--muted)",
    border: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--foreground)",
    marginBottom: size >= 42 ? 16 : 14,
  };
}

function iconTilePrimary(size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: "0.625rem",
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function dot(color: string): React.CSSProperties {
  return { width: 11, height: 11, borderRadius: 9999, background: color, opacity: 0.55 };
}

function btnPrimary(
  fontSize: number,
  padding: string,
  borderRadius = "0.5rem"
): React.CSSProperties {
  return {
    fontSize,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    gap: fontSize >= 15 ? 8 : 7,
    padding,
    borderRadius,
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    boxShadow: "0 1px 2px rgba(0,0,0,.08)",
  };
}

function btnOutline(
  fontSize: number,
  padding: string,
  borderRadius = "0.5rem"
): React.CSSProperties {
  return {
    fontSize,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding,
    borderRadius,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    transition: "background .15s",
  };
}

const styles = `
  @keyframes gs-fade { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
  .gs-link{ color:var(--muted-foreground); transition:color .15s; }
  .gs-link:hover{ color:var(--foreground); }
  .gs-btn-primary{ transition:opacity .15s, background .15s; }
  .gs-btn-primary:hover{ opacity:.9; }
  .gs-btn-outline:hover{ background:var(--muted); }
  .gs-card-lift{ transition:border-color .2s, box-shadow .2s, transform .2s; }
  .gs-card-lift:hover{ border-color:color-mix(in oklab, var(--foreground) 22%, var(--border)); box-shadow:0 8px 24px -12px rgba(0,0,0,.18); transform:translateY(-2px); }
  .gs-faq{ border-bottom:1px solid var(--border); }
  .gs-faq summary{ list-style:none; cursor:pointer; }
  .gs-faq summary::-webkit-details-marker{ display:none; }
  .gs-faq .gs-chev{ transition:transform .2s; }
  .gs-faq[open] .gs-chev{ transform:rotate(180deg); }
  .gs-faq[open] .gs-ans{ animation:gs-fade .25s ease both; }
  .gs-iconbtn:hover{ background:var(--muted); }
  .gs-seg{ display:inline-flex;align-items:center;gap:7px;padding:8px 15px;border-radius:9999px;font-size:13px;font-weight:500;color:var(--muted-foreground);background:transparent;border:none;cursor:pointer;transition:color .15s, background .15s, box-shadow .15s;white-space:nowrap;font-family:inherit; }
  .gs-seg:hover{ color:var(--foreground); }
  .gs-seg-on{ background:var(--card);color:var(--foreground);box-shadow:0 1px 2px rgba(0,0,0,.1); }
  @media (max-width:840px){ .gs-navlinks{ display:none !important; } }
`;
