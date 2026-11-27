import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildZip, formatBytes } from "@/lib/zip";

describe("formatBytes", () => {
  it("formats bytes, KB, and MB cleanly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.00 MB");
  });
});

describe("buildZip", () => {
  it("deduplicates colliding filenames case-insensitively", async () => {
    const zipBlob = await buildZip([
      { name: "foto.jpg", blob: new Blob(["a"]) },
      { name: "Foto.jpg", blob: new Blob(["b"]) },
      { name: "foto.jpg", blob: new Blob(["c"]) },
    ]);

    const loaded = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    const names = Object.keys(loaded.files).sort();
    expect(names).toEqual(["Foto-1.jpg", "foto-2.jpg", "foto.jpg"]);
  });
});
