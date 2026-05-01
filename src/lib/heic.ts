// Helper to convert HEIC/HEIF/JPEG/PNG/WebP files to JPEG (browser-only).

export type ConvertResult = {
  blob: Blob;
  url: string;
};

export type DetectedKind = "heic" | "jpeg" | "png" | "webp" | "unknown";

let heicToPromise: Promise<typeof import("heic-to").heicTo> | null = null;

const OUTPUT_TARGET_RATIO = 0.85;
const QUALITY_STEPS = [0.8, 0.7, 0.6, 0.5, 0.42, 0.35, 0.28];
const SCALE_STEPS = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.45];

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

const buildQualitySteps = (quality: number) => {
  const preferred = Math.min(0.92, Math.max(0.2, quality));
  return Array.from(new Set([preferred, ...QUALITY_STEPS])).sort((a, b) => b - a);
};

type DecodedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  close: () => void;
};

const loadImageFromBlob = async (source: Blob): Promise<DecodedImage> => {
  // Prefer createImageBitmap — it decodes off-thread and is reliable for blobs.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(source);
      if (bmp.width > 0 && bmp.height > 0) {
        return {
          width: bmp.width,
          height: bmp.height,
          draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
          close: () => bmp.close(),
        };
      }
      bmp.close();
    } catch (err) {
      console.warn("[convert] createImageBitmap failed, falling back to <img>", err);
    }
  }

  const url = URL.createObjectURL(source);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    el.src = url;
  });
  if (typeof img.decode === "function") {
    try {
      await img.decode();
    } catch {
      /* ignore — onload already fired */
    }
  }
  if (!img.naturalWidth || !img.naturalHeight) {
    URL.revokeObjectURL(url);
    throw new Error("Imagem decodificada está vazia.");
  }
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    close: () => URL.revokeObjectURL(url),
  };
};

const encodeImageAsJpeg = async (
  img: DecodedImage,
  quality: number,
  scale: number,
): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    img.draw(ctx, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar JPEG."))),
        "image/jpeg",
        quality,
      );
    });
};

/** Compress any browser-supported image to JPEG and keep lowering quality/size until it is smaller than the input. */
const compressToSmallerJpeg = async (
  source: Blob,
  quality: number,
  originalSize: number,
): Promise<Blob> => {
  const img = await loadImageFromBlob(source);
  const targetSize = Math.max(1, Math.floor(originalSize * OUTPUT_TARGET_RATIO));
  const qualitySteps = buildQualitySteps(quality);
  let smallest: Blob | null = null;

  for (const scale of SCALE_STEPS) {
    for (const q of qualitySteps) {
      const blob = await encodeImageAsJpeg(img, q, scale);
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= targetSize) return blob;
    }
  }

  return smallest ?? source;
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
      // First decode HEIC -> JPEG via heic-to (quality hint may be ignored).
      const decoded = await heicTo({ blob: file, type: "image/jpeg", quality });
      // Then compress through canvas, lowering quality and dimensions when needed
      // so the generated JPEG does not come out larger than the HEIC input.
      const blob = await compressToSmallerJpeg(decoded, quality, file.size);
      console.log("[convert] heic ok", {
        name: file.name,
        originalSize: file.size,
        decodedSize: decoded.size,
        outSize: blob.size,
      });
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
    const blob = await compressToSmallerJpeg(file, quality, file.size);
    return { blob, url: URL.createObjectURL(blob) };
  }

  if (kind === "png" || kind === "webp") {
    const blob = await compressToSmallerJpeg(file, quality, file.size);
    return { blob, url: URL.createObjectURL(blob) };
  }

  throw new Error(`Formato não reconhecido (detectado: ${kind}).`);
};
