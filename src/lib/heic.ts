// Helper to convert HEIC/HEIF/JPEG/PNG/WebP files to JPEG (browser-only).

export type ConvertResult = {
  blob: Blob;
  url: string;
};

export type DetectedKind = "heic" | "jpeg" | "png" | "webp" | "unknown";

let heicToPromise: Promise<typeof import("heic-to").heicTo> | null = null;

const loadHeicTo = () => {
  if (!heicToPromise) {
    heicToPromise = import("heic-to").then((m) => m.heicTo);
  }
  return heicToPromise;
};

/**
 * Inspect the first bytes of a file to detect its real format.
 * iPhones often save HEIC photos with a `.jpg` extension, so we cannot
 * trust the filename or MIME type alone.
 */
export const detectKind = async (file: File): Promise<DetectedKind> => {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  // ISO-BMFF (HEIC/HEIF): bytes 4..8 == "ftyp", brand at 8..12
  if (
    head.length >= 12 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  ) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    const heicBrands = new Set([
      "heic",
      "heix",
      "hevc",
      "hevx",
      "heim",
      "heis",
      "hevm",
      "hevs",
      "mif1",
      "msf1",
      "heif",
    ]);
    if (heicBrands.has(brand)) return "heic";
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  )
    return "png";
  if (
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  )
    return "webp";
  return "unknown";
};

export const renameToJpg = (filename: string): string => {
  return filename.replace(/\.(heic|heif|jpe?g|png|webp)$/i, "") + ".jpg";
};

/** Re-encode any browser-supported image (PNG/WebP) to JPEG via canvas. */
const reencodeViaCanvas = async (file: File, quality: number): Promise<Blob> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar JPEG."))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Convert a file to JPEG. Accepts real HEIC (even when named `.jpg`),
 * passes through real JPEGs, and re-encodes PNG/WebP via canvas.
 */
export const convertToJpeg = async (
  file: File,
  quality = 0.95,
): Promise<ConvertResult> => {
  const kind = await detectKind(file);
  const extLooksHeic = /\.(heic|heif)$/i.test(file.name);
  console.log("[convert] start", { name: file.name, size: file.size, type: file.type, detected: kind });

  if (kind === "heic" || (kind === "unknown" && extLooksHeic)) {
    try {
      const heicTo = await loadHeicTo();
      const blob = await heicTo({ blob: file, type: "image/jpeg", quality });
      console.log("[convert] heic ok", { name: file.name, outSize: blob.size });
      return { blob, url: URL.createObjectURL(blob) };
    } catch (err) {
      console.error("[convert] heic-to failed", { name: file.name, err });
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Falha ao decodificar HEIC.";
      throw new Error(`HEIC: ${msg}`);
    }
  }

  if (kind === "jpeg") {
    // If user wants high quality, just pass-through to preserve original.
    // Otherwise, re-encode to actually reduce file size.
    if (quality >= 0.95) {
      const blob = file.slice(0, file.size, "image/jpeg");
      return { blob, url: URL.createObjectURL(blob) };
    }
    const blob = await reencodeViaCanvas(file, quality);
    return { blob, url: URL.createObjectURL(blob) };
  }

  if (kind === "png" || kind === "webp") {
    const blob = await reencodeViaCanvas(file, quality);
    return { blob, url: URL.createObjectURL(blob) };
  }

  throw new Error(`Formato não reconhecido (detectado: ${kind}).`);
};
