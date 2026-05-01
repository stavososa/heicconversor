// Helper to convert HEIC/HEIF files to JPEG using heic2any (browser-only).
// heic2any depends on `window`, so we lazy-import it.

export type ConvertResult = {
  blob: Blob;
  url: string;
};

let heic2anyPromise: Promise<typeof import("heic2any").default> | null = null;

const loadHeic2any = () => {
  if (!heic2anyPromise) {
    heic2anyPromise = import("heic2any").then((m) => m.default);
  }
  return heic2anyPromise;
};

export const isHeicFile = (file: File): boolean => {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    type === "image/heic" ||
    type === "image/heif" ||
    // Some browsers leave type empty for HEIC; fall back to extension only.
    (type === "" && (name.endsWith(".heic") || name.endsWith(".heif")))
  );
};

export const renameToJpg = (filename: string): string => {
  return filename.replace(/\.(heic|heif)$/i, "") + ".jpg";
};

export const convertHeicToJpeg = async (
  file: File,
  quality = 0.95,
): Promise<ConvertResult> => {
  const heic2any = await loadHeic2any();
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality,
  });
  // heic2any may return Blob or Blob[] (multi-image HEIC). Use first.
  const blob = Array.isArray(result) ? result[0] : result;
  const url = URL.createObjectURL(blob);
  return { blob, url };
};
