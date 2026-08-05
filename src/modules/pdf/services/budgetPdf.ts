import { toPng } from "html-to-image";
import { PDFDocument } from "pdf-lib";

const A4_WIDTH_PX = Math.ceil((210 / 25.4) * 96);
const A4_HEIGHT_PX = Math.ceil((297 / 25.4) * 96);
const A4_WIDTH_POINTS = 595.28;
const A4_HEIGHT_POINTS = 841.89;
const CAPTURE_PIXEL_RATIO = 2;

async function waitForDocumentAssets(element: HTMLElement) {
  await document.fonts.ready;
  await Promise.all(
    Array.from(element.querySelectorAll("img")).map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
}

function blobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function embedDocumentImages(element: HTMLElement) {
  const restoreImages: Array<() => void> = [];
  await Promise.all(
    Array.from(element.querySelectorAll("img")).map(async (image) => {
      const originalSource = image.getAttribute("src");
      if (!originalSource || originalSource.startsWith("data:")) return;

      try {
        const response = await fetch(image.currentSrc || image.src, {
          cache: "force-cache",
        });
        if (!response.ok) return;
        const dataUrl = await blobAsDataUrl(await response.blob());
        restoreImages.push(() => image.setAttribute("src", originalSource));
        image.setAttribute("src", dataUrl);
        await image.decode().catch(() => undefined);
      } catch {
        // A geração continua caso uma imagem externa não possa ser incorporada.
      }
    }),
  );
  return () => restoreImages.forEach((restore) => restore());
}

export async function createBudgetPdf(element: HTMLElement, filename: string) {
  await waitForDocumentAssets(element);
  const restoreImages = await embedDocumentImages(element);

  let imageData: string;
  try {
    const contentHeight = Math.max(A4_HEIGHT_PX, element.scrollHeight);
    imageData = await toPng(element, {
      backgroundColor: "#ffffff",
      cacheBust: false,
      pixelRatio: CAPTURE_PIXEL_RATIO,
      width: A4_WIDTH_PX,
      height: contentHeight,
      style: {
        width: `${A4_WIDTH_PX}px`,
        minWidth: `${A4_WIDTH_PX}px`,
        maxWidth: `${A4_WIDTH_PX}px`,
        minHeight: `${A4_HEIGHT_PX}px`,
        height: `${contentHeight}px`,
        margin: "0",
        transform: "none",
        transformOrigin: "top left",
        boxShadow: "none",
        overflow: "visible",
      },
    });
  } finally {
    restoreImages();
  }

  const pdfDocument = await PDFDocument.create();
  const page = pdfDocument.addPage([A4_WIDTH_POINTS, A4_HEIGHT_POINTS]);
  const image = await pdfDocument.embedPng(imageData);

  // Fill the A4 page exactly — content is always A4 width, height is compressed to fit if needed
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: A4_WIDTH_POINTS,
    height: A4_HEIGHT_POINTS,
  });

  const bytes = await pdfDocument.save();
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  return { blob, download: () => downloadPdfBlob(blob, filename) };
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
