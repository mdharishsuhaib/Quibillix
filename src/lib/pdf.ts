"use client";

/**
 * Read a PDF bill in the browser (nothing uploaded until the user clicks Audit).
 * - Digital PDFs: extract the text layer, rebuilt row-by-row so table columns stay on one line.
 * - Scanned PDFs (no text layer): render the first pages to one tall JPEG for Nemotron Super VL.
 */
export async function readPdf(file: File, maxPages = 4): Promise<{ kind: "text"; text: string; pages: number } | { kind: "image"; dataUrl: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(doc.numPages, maxPages);

  const lines: string[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3; // bucket by baseline so a table row stays together
      const x = it.transform[4];
      (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x, s: it.str });
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, cells]) => lines.push(cells.sort((a, b) => a.x - b.x).map((c) => c.s.trim()).join("   ")));
    if (p < pages) lines.push("");
  }
  const text = lines.join("\n").trim();
  // A real bill has digits and a reasonable amount of text; otherwise treat as a scan.
  if (text.length > 80 && /\d/.test(text)) return { kind: "text", text, pages };

  // Scanned: render pages and stack vertically.
  const canvases: HTMLCanvasElement[] = [];
  for (let p = 1; p <= Math.min(pages, 2); p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 1600 / base.width) });
    const c = document.createElement("canvas");
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    await page.render({ canvas: c, viewport }).promise;
    canvases.push(c);
  }
  const out = document.createElement("canvas");
  out.width = Math.max(...canvases.map((c) => c.width));
  out.height = canvases.reduce((s, c) => s + c.height, 0);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, 0, y);
    y += c.height;
  }
  return { kind: "image", dataUrl: out.toDataURL("image/jpeg", 0.85), pages };
}
