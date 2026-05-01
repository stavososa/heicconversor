import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Trash2, Upload, ShieldCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileRow, type FileItem } from "./FileRow";
import { convertToJpeg, renameToJpg } from "@/lib/heic";
import { buildZip, downloadBlob } from "@/lib/zip";

const MAX_CONCURRENCY = 3;
const MAX_SIZE_MB = 50;

export const HeicConverter = () => {
  const [items, setItems] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Queue: track pending IDs and run them with limited concurrency.
  const queueRef = useRef<string[]>([]);
  const activeRef = useRef(0);
  const itemsRef = useRef<FileItem[]>([]);
  itemsRef.current = items;

  const updateItem = useCallback((id: string, patch: Partial<FileItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const runNext = useCallback(async () => {
    while (activeRef.current < MAX_CONCURRENCY && queueRef.current.length > 0) {
      const id = queueRef.current.shift()!;
      const item = itemsRef.current.find((it) => it.id === id);
      if (!item) continue;
      activeRef.current += 1;
      updateItem(id, { status: "converting" });
      (async () => {
        try {
          const { blob, url } = await convertToJpeg(item.file, 0.95);
          updateItem(id, {
            status: "done",
            outBlob: blob,
            outUrl: url,
            outSize: blob.size,
          });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Não foi possível converter este arquivo.";
          updateItem(id, { status: "error", error: msg });
        } finally {
          activeRef.current -= 1;
          runNext();
        }
      })();
    }
  }, [updateItem]);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      const valid: File[] = [];
      let rejected = 0;
      let oversized = 0;
      for (const f of incoming) {
        if (f.size > MAX_SIZE_MB * 1024 * 1024) {
          oversized += 1;
          continue;
        }
        const looksLikeImage =
          f.type.startsWith("image/") ||
          /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name);
        if (!looksLikeImage) {
          rejected += 1;
          continue;
        }
        valid.push(f);
      }
      if (rejected > 0) {
        toast.error(
          `${rejected} arquivo(s) ignorado(s) (use HEIC, JPG, PNG ou WebP).`,
        );
      }
      if (oversized > 0) {
        toast.error(
          `${oversized} arquivo(s) acima de ${MAX_SIZE_MB} MB foram ignorados.`,
        );
      }
      if (valid.length === 0) return;

      const newItems: FileItem[] = valid.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        status: "pending",
        outName: renameToJpg(file.name),
      }));
      setItems((prev) => [...prev, ...newItems]);
    },
    [],
  );

  const handleConvert = useCallback(() => {
    const pendingIds = itemsRef.current
      .filter((it) => it.status === "pending" || it.status === "error")
      .map((it) => it.id);
    if (pendingIds.length === 0) {
      toast.info("Nada para converter.");
      return;
    }
    // Reset error items back to pending so they get retried.
    setItems((prev) =>
      prev.map((it) => (it.status === "error" ? { ...it, status: "pending", error: undefined } : it)),
    );
    queueRef.current.push(...pendingIds);
    setTimeout(() => runNext(), 0);
  }, [runNext]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    // Reset so re-selecting the same file works.
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const handleRemove = (id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target?.outUrl) URL.revokeObjectURL(target.outUrl);
      return prev.filter((it) => it.id !== id);
    });
    queueRef.current = queueRef.current.filter((q) => q !== id);
  };

  const handleClear = () => {
    items.forEach((it) => it.outUrl && URL.revokeObjectURL(it.outUrl));
    setItems([]);
    queueRef.current = [];
    toast.success("Lista limpa.");
  };

  const handleDownload = (item: FileItem) => {
    if (item.outBlob) downloadBlob(item.outBlob, item.outName);
  };

  const handleDownloadAll = async () => {
    const ready = items.filter((it) => it.status === "done" && it.outBlob);
    if (ready.length === 0) return;
    setZipping(true);
    try {
      const zip = await buildZip(
        ready.map((it) => ({ name: it.outName, blob: it.outBlob! })),
      );
      downloadBlob(zip, "imagens-convertidas.zip");
      toast.success(`ZIP pronto com ${ready.length} imagem(ns).`);
    } catch (err) {
      toast.error("Falha ao gerar o ZIP.");
      console.error(err);
    } finally {
      setZipping(false);
    }
  };

  // Cleanup object URLs on unmount.
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => it.outUrl && URL.revokeObjectURL(it.outUrl));
    };
  }, []);

  const readyCount = items.filter((it) => it.status === "done").length;
  const convertingCount = items.filter((it) => it.status === "converting").length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8 text-center sm:mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Conversor HEIC → JPEG
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          Converta várias fotos HEIC do iPhone para JPEG de alta qualidade,
          direto no seu navegador.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          100% local — nenhum arquivo é enviado a servidores
        </div>
      </header>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/50 hover:bg-accent/40"
        }`}
        aria-label="Selecionar ou arrastar arquivos HEIC"
      >
        <Upload
          className={`mb-3 h-10 w-10 transition-colors ${
            isDragging ? "text-primary" : "text-muted-foreground group-hover:text-primary"
          }`}
        />
        <p className="text-base font-medium text-foreground">
          Arraste suas imagens aqui
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          HEIC, JPG, PNG ou WebP — até {MAX_SIZE_MB} MB cada
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".heic,.heif,.jpg,.jpeg,.png,.webp,image/*"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      {/* Toolbar */}
      {items.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {items.length} arquivo(s) • {readyCount} pronto(s)
            {convertingCount > 0 && ` • ${convertingCount} em andamento`}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={zipping}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Limpar lista
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadAll}
              disabled={readyCount === 0 || zipping}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {zipping ? "Gerando ZIP…" : `Baixar tudo (ZIP)`}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {items.length > 0 && (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <FileRow
              key={item.id}
              item={item}
              onDownload={handleDownload}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
};
