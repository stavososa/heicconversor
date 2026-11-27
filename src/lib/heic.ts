/**
 * Browser-only image conversion utilities for HEIC/HEIF, JPEG, PNG, and WebP -> JPEG.
 */

export type DetectedKind = "heic" | "jpeg" | "png" | "webp" | "unknown";

export type ConvertOptions = {
  /** Output JPEG quality between 0.2 and 0.98 (default: 0.85). */
  quality?: number;
  /** Optional maximum width or height in pixels; null preserves original dimensions. */
  maxDimension?: number | null;
  /** When true, attempts extra quality/scale steps to produce a smaller file than input. */
  keepSmallerThanInput?: boolean;
};

export type ConvertResult = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  detectedKind: DetectedKind;
};

let heicToPromise: Promise<typeof import("heic-to").heicTo> | null = null;

const COMPACT_TARGET_RATIO = 0.85;
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];
const SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

const HEIC_BRANDS = new Set([
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

const loadHeicTo = () => {
  if (!heicToPromise) {
    heicToPromise = import("heic-to").then((m) => m.heicTo);
  }
  return heicToPromise;
};

/**
 * Inspects the magic bytes of a file to detect its real image format.
 * iPhones frequently save HEIC photos with a `.jpg` extension, so filename
 * and MIME type cannot be trusted alone.
 */
const readBlobBytes = async (blob: Blob): Promise<Uint8Array> => {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo."));
    reader.readAsArrayBuffer(blob);
  });
  return new Uint8Array(buffer);
};

export const detectKind = async (file: Blob): Promise<DetectedKind> => {
  const head = await readBlobBytes(file.slice(0, 32));

  // ISO-BMFF (HEIC/HEIF): bytes 4..8 == "ftyp", brand at 8..12
  if (
    head.length >= 12 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  ) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return "heic";
  }

  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "jpeg";
  }

  if (
    head.length >= 4 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  ) {
    return "png";
  }

  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return "webp";
  }

  return "unknown";
};

export const renameToJpg = (filename: string): string => {
  const trimmed = filename.trim() || "imagem";
  if (/\.(heic|heif|jpe?g|png|webp)$/i.test(trimmed)) {
    return trimmed.replace(/\.(heic|heif|jpe?g|png|webp)$/i, ".jpg");
  }
  return `${trimmed}.jpg`;
};

const clampQuality = (quality: number): number => Math.min(0.98, Math.max(0.2, quality));

export const computeTargetDimensions = (
  width: number,
  height: number,
  maxDimension?: number | null,
  scale = 1,
): { width: number; height: number } => {
  let baseScale = scale;
  if (maxDimension && maxDimension > 0) {
    const longestSide = Math.max(width, height);
    if (longestSide > maxDimension) {
      baseScale = Math.min(baseScale, maxDimension / longestSide);
    }
  }
  return {
    width: Math.max(1, Math.round(width * baseScale)),
    height: Math.max(1, Math.round(height * baseScale)),
  };
};

type DecodedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  close: () => void;
};

const loadImageFromBlob = async (source: Blob): Promise<DecodedImage> => {
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
    } catch {
      // Fallback to HTMLImageElement when createImageBitmap fails.
    }
  }

  const url = URL.createObjectURL(source);
  try {
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
        // Ignore: onload already fired.
      }
    }
    if (!img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      throw new Error("A imagem decodificada está vazia.");
    }
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
};

const encodeImageAsJpeg = async (
  img: DecodedImage,
  quality: number,
  width: number,
  height: number,
): Promise<Blob> => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Contexto 2D do canvas indisponível.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    img.draw(ctx, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao codificar JPEG."))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    // Release backing store memory immediately for large batches.
    canvas.width = 0;
    canvas.height = 0;
  }
};

const encodeWithOptions = async (
  source: Blob,
  originalSize: number,
  options: Required<ConvertOptions>,
): Promise<{ blob: Blob; width: number; height: number }> => {
  const img = await loadImageFromBlob(source);
  try {
    const quality = clampQuality(options.quality);

    if (!options.keepSmallerThanInput) {
      const dims = computeTargetDimensions(img.width, img.height, options.maxDimension, 1);
      const blob = await encodeImageAsJpeg(img, quality, dims.width, dims.height);
      return { blob, width: dims.width, height: dims.height };
    }

    const targetSize = Math.max(1, Math.floor(originalSize * COMPACT_TARGET_RATIO));
    const qualitySteps = Array.from(new Set([quality, ...QUALITY_STEPS]))
      .filter((q) => q <= quality)
      .sort((a, b) => b - a);

    let smallest: { blob: Blob; width: number; height: number } | null = null;

    for (const scale of SCALE_STEPS) {
      const dims = computeTargetDimensions(img.width, img.height, options.maxDimension, scale);
      for (const q of qualitySteps) {
        const blob = await encodeImageAsJpeg(img, q, dims.width, dims.height);
        if (!smallest || blob.size < smallest.blob.size) {
          smallest = { blob, width: dims.width, height: dims.height };
        }
        if (blob.size <= targetSize) {
          return smallest;
        }
      }
    }

    return smallest ?? {
      blob: source,
      width: img.width,
      height: img.height,
    };
  } finally {
    img.close();
  }
};

/**
 * Converts a HEIC/HEIF, JPEG, PNG, or WebP file into a JPEG blob in the browser.
 */
export const convertToJpeg = async (
  file: File,
  options: ConvertOptions = {},
): Promise<ConvertResult> => {
  const resolvedOptions: Required<ConvertOptions> = {
    quality: options.quality ?? 0.85,
    maxDimension: options.maxDimension ?? null,
    keepSmallerThanInput: options.keepSmallerThanInput ?? false,
  };

  const detectedKind = await detectKind(file);
  const extLooksHeic = /\.(heic|heif)$/i.test(file.name);

  if (detectedKind === "heic" || (detectedKind === "unknown" && extLooksHeic)) {
    try {
      const heicTo = await loadHeicTo();
      const decoded = await heicTo({
        blob: file,
        type: "image/jpeg",
        quality: clampQuality(resolvedOptions.quality),
      });
      const { blob, width, height } = await encodeWithOptions(
        decoded,
        file.size,
        resolvedOptions,
      );
      return {
        blob,
        url: URL.createObjectURL(blob),
        width,
        height,
        detectedKind: "heic",
      };
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Falha ao decodificar arquivo HEIC.";
      throw new Error(`HEIC: ${msg}`);
    }
  }

  if (detectedKind === "jpeg" || detectedKind === "png" || detectedKind === "webp") {
    const { blob, width, height } = await encodeWithOptions(
      file,
      file.size,
      resolvedOptions,
    );
    return {
      blob,
      url: URL.createObjectURL(blob),
      width,
      height,
      detectedKind,
    };
  }

  throw new Error("Formato de imagem não reconhecido ou não suportado.");
};
