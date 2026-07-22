import { useId } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

// Accessible previous/next pager for URL-driven, server-side pagination.
//
// Why a shared component: the page hosts several independent pagers (Notas,
// Assiduidade) and a naked icon button (`<Button><ChevronLeft/></Button>`) is
// announced only as "botão" and is indistinguishable between sections. This
// centralizes the semantics once:
//  - a <nav> landmark with a section-specific accessible name;
//  - contextual accessible names on the prev/next controls;
//  - decorative chevrons (aria-hidden) so only the control name is announced;
//  - an aria-live status so the current page is announced without moving focus;
//  - the NATIVE `disabled` attribute at the page boundaries (removes the control
//    from the tab order and communicates the state) — never a clickable
//    aria-disabled link.
//
// The announced strings are supplied by the caller (grammar-correct PT-PT) so the
// component never assembles linguistically wrong phrases.
export interface AccessiblePaginationProps {
  /** nav landmark accessible name, e.g. "Paginação das notas". */
  navLabel: string;
  /** accessible name for the previous control, e.g. "Ir para a página anterior das notas". */
  previousLabel: string;
  /** accessible name for the next control, e.g. "Ir para a página seguinte das notas". */
  nextLabel: string;
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  /** row noun for the results summary, e.g. "avaliações" | "registos de assiduidade". */
  itemsLabel: string;
  /** section suffix for the page status, e.g. "das notas" | "da assiduidade". */
  sectionLabel: string;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  /** builds the href for a given page (query params / filters preserved by the caller). */
  hrefForPage: (page: number) => string;
  /** id of the list/table these controls paginate (aria-controls). Optional. */
  controlsId?: string;
}

function PagerControl({
  enabled,
  href,
  label,
  controlsId,
  children,
}: {
  enabled: boolean;
  href: string;
  label: string;
  controlsId?: string;
  children: React.ReactNode;
}) {
  // Enabled → a real link (URL-driven navigation, keyboard + right-click friendly).
  if (enabled) {
    return (
      <Button asChild variant="outline" size="icon" className="size-7">
        <Link href={href} aria-label={label} aria-controls={controlsId}>
          {children}
        </Link>
      </Button>
    );
  }
  // Boundary → a native disabled button (out of tab order, non-clickable, state announced).
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-7"
      aria-label={label}
      aria-controls={controlsId}
      disabled
    >
      {children}
    </Button>
  );
}

export function AccessiblePagination({
  navLabel,
  previousLabel,
  nextLabel,
  page,
  pageSize,
  totalPages,
  totalItems,
  itemsLabel,
  sectionLabel,
  hasPreviousPage,
  hasNextPage,
  hrefForPage,
  controlsId,
}: AccessiblePaginationProps) {
  const summaryId = useId();

  // Nothing to paginate — render nothing (matches the previous single-page behaviour).
  if (totalPages <= 1) return null;

  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label={navLabel}
      aria-describedby={summaryId}
      className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground"
    >
      <div className="min-w-0">
        <p id={summaryId} className="truncate">
          A mostrar {startItem}–{endItem} de {totalItems} {itemsLabel}
        </p>
        {/* Announced on page change without moving focus (polite, whole-region). */}
        <span aria-live="polite" aria-atomic="true">
          Página {page} de {totalPages} {sectionLabel}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <PagerControl enabled={hasPreviousPage} href={hrefForPage(page - 1)} label={previousLabel} controlsId={controlsId}>
          <ChevronLeft className="size-3.5" aria-hidden="true" />
        </PagerControl>
        <PagerControl enabled={hasNextPage} href={hrefForPage(page + 1)} label={nextLabel} controlsId={controlsId}>
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </PagerControl>
      </div>
    </nav>
  );
}
