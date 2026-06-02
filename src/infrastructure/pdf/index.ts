// =============================================================================
// PDF ABSTRACTION
// Backed by @react-pdf/renderer.
// Document templates live in src/infrastructure/pdf/templates/.
// =============================================================================

export interface PdfTemplate<TData> {
  render(data: TData): React.ReactElement;
}

export interface PdfGenerateResult {
  buffer: Buffer;
  filename: string;
}

export async function generatePdf<TData>(
  template: PdfTemplate<TData>,
  data: TData,
  filename: string
): Promise<PdfGenerateResult> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const element = template.render(data);
  const buffer = await renderToBuffer(element);
  return { buffer: Buffer.from(buffer), filename };
}
