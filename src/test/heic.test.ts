import { describe, expect, it } from "vitest";
import { computeTargetDimensions, detectKind, renameToJpg } from "@/lib/heic";

describe("detectKind", () => {
  it("detects HEIC/HEIF ISO-BMFF magic bytes even with .jpg filename", async () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x68, 0x65, 0x69, 0x63, // heic
      0x00, 0x00, 0x00, 0x00,
    ]);
    const file = new File([bytes], "IMG_1234.jpg", { type: "image/jpeg" });
    await expect(detectKind(file)).resolves.toBe("heic");
  });

  it("detects mif1 brand as heic", async () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
      0x6d, 0x69, 0x66, 0x31, // mif1
    ]);
    const file = new File([bytes], "photo.heif");
    await expect(detectKind(file)).resolves.toBe("heic");
  });

  it("detects JPEG magic bytes", async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "photo.jpeg");
    await expect(detectKind(file)).resolves.toBe("jpeg");
  });

  it("detects PNG magic bytes", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], "pic.png");
    await expect(detectKind(file)).resolves.toBe("png");
  });

  it("detects WebP magic bytes", async () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    const file = new File([bytes], "pic.webp");
    await expect(detectKind(file)).resolves.toBe("webp");
  });

  it("returns unknown for unrecognized files", async () => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "doc.pdf");
    await expect(detectKind(file)).resolves.toBe("unknown");
  });
});

describe("renameToJpg", () => {
  it("replaces supported image extensions with .jpg", () => {
    expect(renameToJpg("IMG_001.HEIC")).toBe("IMG_001.jpg");
    expect(renameToJpg("foto.heif")).toBe("foto.jpg");
    expect(renameToJpg("imagem.png")).toBe("imagem.jpg");
    expect(renameToJpg("banner.webp")).toBe("banner.jpg");
    expect(renameToJpg("old.jpeg")).toBe("old.jpg");
  });

  it("appends .jpg when there is no image extension", () => {
    expect(renameToJpg("arquivo")).toBe("arquivo.jpg");
    expect(renameToJpg("  ")).toBe("imagem.jpg");
  });
});

describe("computeTargetDimensions", () => {
  it("keeps original dimensions when maxDimension is null or larger than image", () => {
    expect(computeTargetDimensions(4032, 3024, null, 1)).toEqual({ width: 4032, height: 3024 });
    expect(computeTargetDimensions(1200, 800, 1920, 1)).toEqual({ width: 1200, height: 800 });
  });

  it("scales down proportionally to fit maxDimension", () => {
    expect(computeTargetDimensions(4000, 2000, 1920, 1)).toEqual({ width: 1920, height: 960 });
    expect(computeTargetDimensions(2000, 4000, 1920, 1)).toEqual({ width: 960, height: 1920 });
  });
});
