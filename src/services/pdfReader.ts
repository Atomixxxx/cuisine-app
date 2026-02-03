/**
 * Convert each page of a PDF to a PNG Blob for OCR processing.
 * pdfjs-dist is loaded dynamically (only when this function is called)
 * to avoid adding ~500KB to the initial bundle.
 */
export async function pdfToImages(
  file: File | Blob,
  onProgress?: (current: number, total: number) => void
): Promise<Blob[]> {
  const pdfjsLib = await import('pdfjs-dist');

  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const blobs: Blob[] = [];

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(i, totalPages);
    const page = await pdf.getPage(i);

    // 4x gives ~288 DPI from a standard 72 DPI PDF
    const scale = 4;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport } as any).promise;

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b || new Blob()),
        'image/png'
      );
    });

    blobs.push(blob);
  }

  return blobs;
}
