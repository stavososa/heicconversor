import JSZip from "jszip";

export type ZipItem = {
  name: string;
  blob: Blob;
};

export const buildZip = async (items: ZipItem[]): Promise<Blob> => {
  const zip = new JSZip();
  // Avoid duplicate names by suffixing.
  const used = new Map<string, number>();
  for (const item of items) {
    const base = item.name;
    const count = used.get(base) ?? 0;
    const finalName =
      count === 0 ? base : base.replace(/(\.[^.]+)?$/, (ext) => `-${count}${ext ?? ""}`);
    used.set(base, count + 1);
    zip.file(finalName, item.blob);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke to allow download to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
