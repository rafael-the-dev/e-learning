// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { AccessiblePagination } from "../accessible-pagination";

// next/link → a plain anchor that forwards props (aria-label / aria-controls / href),
// so the accessibility assertions exercise the real rendered semantics.
import { vi } from "vitest";
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const GRADES = {
  navLabel: "Paginação das notas",
  previousLabel: "Ir para a página anterior das notas",
  nextLabel: "Ir para a página seguinte das notas",
  itemsLabel: "avaliações",
  sectionLabel: "das notas",
  hrefForPage: (p: number) => `?tab=grades&page=${p}`,
  controlsId: "student-grades-assessments-table",
} as const;

function renderGrades(over: Partial<React.ComponentProps<typeof AccessiblePagination>> = {}) {
  return render(
    <AccessiblePagination
      {...GRADES}
      page={2}
      pageSize={10}
      totalPages={5}
      totalItems={47}
      hasPreviousPage
      hasNextPage
      {...over}
    />
  );
}

describe("AccessiblePagination — landmark + labels", () => {
  it("renders a <nav> landmark with the section-specific accessible name", () => {
    renderGrades();
    expect(screen.getByRole("navigation", { name: "Paginação das notas" })).toBeTruthy();
  });

  it("gives the previous/next controls contextual accessible names", () => {
    renderGrades();
    // Enabled controls are links (URL-driven navigation).
    expect(screen.getByRole("link", { name: "Ir para a página anterior das notas" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir para a página seguinte das notas" })).toBeTruthy();
  });

  it("points prev/next at the correct pages, preserving the tab query param", () => {
    renderGrades();
    expect(screen.getByRole("link", { name: /anterior das notas/ }).getAttribute("href")).toBe(
      "?tab=grades&page=1"
    );
    expect(screen.getByRole("link", { name: /seguinte das notas/ }).getAttribute("href")).toBe(
      "?tab=grades&page=3"
    );
  });

  it("wires aria-controls to the paginated table on both controls", () => {
    renderGrades();
    expect(
      screen.getByRole("link", { name: /anterior das notas/ }).getAttribute("aria-controls")
    ).toBe("student-grades-assessments-table");
    expect(
      screen.getByRole("link", { name: /seguinte das notas/ }).getAttribute("aria-controls")
    ).toBe("student-grades-assessments-table");
  });
});

describe("AccessiblePagination — page status + results summary", () => {
  it("announces the current page in a polite, atomic live region", () => {
    renderGrades();
    const status = screen.getByText("Página 2 de 5 das notas");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
  });

  it("shows a results summary and links it via aria-describedby", () => {
    renderGrades();
    const nav = screen.getByRole("navigation", { name: "Paginação das notas" });
    const summary = screen.getByText("A mostrar 11–20 de 47 avaliações");
    expect(nav.getAttribute("aria-describedby")).toBe(summary.getAttribute("id"));
  });

  it("computes the last-page range (partial page) correctly", () => {
    renderGrades({ page: 5, hasNextPage: false });
    expect(screen.getByText("A mostrar 41–47 de 47 avaliações")).toBeTruthy();
  });
});

describe("AccessiblePagination — disabled states use the native attribute", () => {
  it("first page: previous is a native disabled button (out of the tab order)", () => {
    renderGrades({ page: 1, hasPreviousPage: false });
    const previous = screen.getByRole("button", { name: "Ir para a página anterior das notas" });
    expect((previous as HTMLButtonElement).disabled).toBe(true);
    // The next control stays a link.
    expect(screen.getByRole("link", { name: "Ir para a página seguinte das notas" })).toBeTruthy();
    // No clickable aria-disabled link — the disabled control is a real <button>.
    expect(screen.queryByRole("link", { name: /anterior das notas/ })).toBeNull();
  });

  it("last page: next is a native disabled button", () => {
    renderGrades({ page: 5, hasNextPage: false });
    const next = screen.getByRole("button", { name: "Ir para a página seguinte das notas" });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Ir para a página anterior das notas" })).toBeTruthy();
  });
});

describe("AccessiblePagination — decorative icons", () => {
  it("marks the chevron icons aria-hidden so only the control name is announced", () => {
    const { container } = renderGrades();
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => expect(svg.getAttribute("aria-hidden")).toBe("true"));
  });
});

describe("AccessiblePagination — keyboard reachability (native elements)", () => {
  it("enabled controls are natively focusable links (no positive/blocking tabIndex)", () => {
    renderGrades();
    const next = screen.getByRole("link", { name: /seguinte das notas/ });
    // Native <a href> is in the tab order and must not be pushed out of it.
    expect(next.getAttribute("tabindex")).not.toBe("-1");
    next.focus();
    expect(document.activeElement).toBe(next);
  });

  it("disabled controls carry the native disabled attribute (removed from the tab order)", () => {
    // Real browsers drop a disabled <button> from the tab order and block activation; we
    // assert the native attribute (happy-dom does not simulate disabled-focus prevention).
    renderGrades({ page: 1, hasPreviousPage: false });
    const previous = screen.getByRole("button", { name: /anterior das notas/ }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(previous.hasAttribute("disabled")).toBe(true);
  });
});

describe("AccessiblePagination — single page", () => {
  it("renders nothing when there is only one page", () => {
    const { container } = renderGrades({ totalPages: 1, hasNextPage: false });
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("AccessiblePagination — two pagers on one page are distinguishable", () => {
  it("Notas and Assiduidade have distinct nav names and no ambiguous generic control", () => {
    render(
      <div>
        <AccessiblePagination
          {...GRADES}
          page={2}
          pageSize={10}
          totalPages={5}
          totalItems={47}
          hasPreviousPage
          hasNextPage
        />
        <AccessiblePagination
          navLabel="Paginação da assiduidade"
          previousLabel="Ir para a página anterior da assiduidade"
          nextLabel="Ir para a página seguinte da assiduidade"
          page={1}
          pageSize={10}
          totalPages={3}
          totalItems={25}
          itemsLabel="registos de assiduidade"
          sectionLabel="da assiduidade"
          hasPreviousPage={false}
          hasNextPage
          hrefForPage={(p) => `?tab=attendance&page=${p}`}
          controlsId="student-attendance-records-table"
        />
      </div>
    );

    const gradesNav = screen.getByRole("navigation", { name: "Paginação das notas" });
    const attendanceNav = screen.getByRole("navigation", { name: "Paginação da assiduidade" });
    expect(gradesNav).not.toBe(attendanceNav);

    // Each "next" is scoped to its own section — never two identical generic names.
    expect(within(gradesNav).getByRole("link", { name: "Ir para a página seguinte das notas" })).toBeTruthy();
    expect(
      within(attendanceNav).getByRole("link", { name: "Ir para a página seguinte da assiduidade" })
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Seguinte" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Seguinte" })).toBeNull();
  });
});
