import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
import { convertToJpeg, renameToJpg } from "@/lib/heic";
import { buildZip, downloadBlob, formatBytes } from "@/lib/zip";
import { FileRow, type FileItem } from "./FileRow";

const MAX_CONCURRENCY = 3;
const MAX_SIZE_MB = 50;

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const HeicConverter = () => {
  const { theme, toggleTheme } = useTheme();
  const [items, setItems] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null);

  // Conversion preferences
  const [quality, setQuality] = useState(85);
  const [maxDimension, setMaxDimension] = useState<string>("original");
  const [autoConvert, setAutoConvert] = useState(true);
  const [compactMode, setCompactMode] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<string[]>([]);
  const activeRef = useRef(0);
  const itemsRef = useRef<FileItem[]>([]);
  itemsRef.current = items;

  const optionsRef = useRef({ quality, maxDimension, compactMode });
  optionsRef.current = { quality, maxDimension, compactMode };

  const updateItem = useCallback((id: string, patch: Partial<FileItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const runNext = useCallback(() => {
    while (activeRef.current < MAX_CONCURRENCY && queueRef.current.length > 0) {
      const id = queueRef.current.shift()!;
      const item = itemsRef.current.find((it) => it.id === id);
      if (!item || item.status === "converting" || item.status === "done") continue;

      activeRef.current += 1;
      updateItem(id, { status: "converting", error: undefined });

      const { quality: q, maxDimension: maxDim, compactMode: compact } = optionsRef.current;
      const parsedMax = maxDim === "original" ? null : Number(maxDim);

      (async () => {
        try {
          const result = await convertToJpeg(item.file, {
            quality: q / 100,
            maxDimension: parsedMax,
            keepSmallerThanInput: compact,
          });

          // Prevent leaking the object URL if the user removed this item mid-conversion.
          const stillExists = itemsRef.current.some((it) => it.id === id);
          if (!stillExists) {
            URL.revokeObjectURL(result.url);
            return;
          }

          updateItem(id, {
            status: "done",
            outBlob: result.blob,
            outUrl: result.url,
            outSize: result.blob.size,
            width: result.width,
            height: result.height,
            detectedKind: result.detectedKind,
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

  const enqueueIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const existing = new Set(queueRef.current);
      for (const id of ids) {
        if (!existing.has(id)) {
          queueRef.current.push(id);
          existing.add(id);
        }
      }
      setTimeout(() => runNext(), 0);
    },
    [runNext],
  );

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
          f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name);
        if (!looksLikeImage) {
          rejected += 1;
          continue;
        }
        valid.push(f);
      }

      if (rejected > 0) {
        toast.error(`${rejected} arquivo(s) ignorado(s) (use HEIC, JPG, PNG ou WebP).`);
      }
      if (oversized > 0) {
        toast.error(`${oversized} arquivo(s) acima de ${MAX_SIZE_MB} MB foram ignorados.`);
      }
      if (valid.length === 0) return;

      const newItems: FileItem[] = valid.map((file) => ({
        id: createId(),
        file,
        status: "pending",
        outName: renameToJpg(file.name),
      }));

      setItems((prev) => [...prev, ...newItems]);

      if (autoConvert) {
        enqueueIds(newItems.map((it) => it.id));
      }
    },
    [autoConvert, enqueueIds],
  );

  // Support pasting images directly with Ctrl+V.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const handleConvert = useCallback(() => {
    const pendingIds = itemsRef.current
      .filter((it) => it.status === "pending" || it.status === "error")
      .map((it) => it.id);
    if (pendingIds.length === 0) {
      toast.info("Nada para converter.");
      return;
    }
    setItems((prev) =>
      prev.map((it) =>
        it.status === "error" ? { ...it, status: "pending", error: undefined } : it,
      ),
    );
    enqueueIds(pendingIds);
  }, [enqueueIds]);

  const handleRetry = useCallback(
    (id: string) => {
      updateItem(id, { status: "pending", error: undefined });
      enqueueIds([id]);
    },
    [enqueueIds, updateItem],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
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
    if (previewItem?.id === id) setPreviewItem(null);
    queueRef.current = queueRef.current.filter((q) => q !== id);
  };

  const handleClear = () => {
    items.forEach((it) => it.outUrl && URL.revokeObjectURL(it.outUrl));
    setItems([]);
    setPreviewItem(null);
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
      toast.error("Falha ao gerar o arquivo ZIP.");
      console.error(err);
    } finally {
      setZipping(false);
    }
  };

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => it.outUrl && URL.revokeObjectURL(it.outUrl));
    };
  }, []);

  const stats = useMemo(() => {
    let readyCount = 0;
    let convertingCount = 0;
    let pendingCount = 0;
    let totalInReady = 0;
    let totalOutReady = 0;

    for (const it of items) {
      if (it.status === "done") {
        readyCount += 1;
        totalInReady += it.file.size;
        totalOutReady += it.outSize ?? 0;
      } else if (it.status === "converting") {
        convertingCount += 1;
      } else {
        pendingCount += 1;
      }
    }

    const progress = items.length > 0 ? Math.round((readyCount / items.length) * 100) : 0;
    const savedPct =
      totalInReady > 0
        ? Math.round(((totalOutReady - totalInReady) / totalInReady) * 100)
        : null;

    return {
      readyCount,
      convertingCount,
      pendingCount,
      isConverting: convertingCount > 0,
      progress,
      totalInReady,
      totalOutReady,
      savedPct,
    };
  }, [items]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-14">
      {/* Top bar with theme toggle */}
      <div className="mb-4 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          title={theme === "dark" ? "Tema claro" : "Tema escuro"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Conversor HEIC → JPEG
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          Converta fotos HEIC do iPhone, PNG ou WebP para JPEG direto no seu navegador.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          100% local — nenhum arquivo é enviado a servidores
        </div>
      </header>

      {/* Output settings */}
      <section
        aria-label="Opções de conversão"
        className="mb-5 rounded-xl border border-border bg-card p-4"
      >
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Opções de saída
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">Qualidade JPEG</span>
              <span className="tabular-nums text-muted-foreground">{quality}%</span>
            </div>
            <Slider
              min={50}
              max={95}
              step={5}
              value={[quality]}
              onValueChange={([v]) => setQuality(v)}
              aria-label="Qualidade JPEG"
            />
          </div>

          <div>
            <label
              htmlFor="max-dimension-select"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Resolução máxima
            </label>
            <Select value={maxDimension} onValueChange={setMaxDimension}>
              <SelectTrigger id="max-dimension-select" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original (sem redimensionar)</SelectItem>
                <SelectItem value="3840">4K (máx. 3840 px)</SelectItem>
                <SelectItem value="1920">Full HD (máx. 1920 px)</SelectItem>
                <SelectItem value="1280">Web (máx. 1280 px)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <Switch checked={autoConvert} onCheckedChange={setAutoConvert} />
            <span>Converter ao adicionar</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <Switch checked={compactMode} onCheckedChange={setCompactMode} />
            <span>Forçar tamanho menor que original</span>
          </label>
        </div>
      </section>

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
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all sm:py-12 ${
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
          Arraste suas imagens aqui ou clique para selecionar
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          HEIC, HEIF, JPG, PNG ou WebP — até {MAX_SIZE_MB} MB cada (também aceita Ctrl+V)
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

      {/* Toolbar & Progress */}
      {items.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              <span>
                {items.length} arquivo(s) • {stats.readyCount} pronto(s)
              </span>
              {stats.convertingCount > 0 && (
                <span> • {stats.convertingCount} em andamento</span>
              )}
              {stats.readyCount > 0 && stats.savedPct !== null && (
                <span className="hidden sm:inline">
                  {" "}
                  • {formatBytes(stats.totalInReady)} → {formatBytes(stats.totalOutReady)} (
                  {stats.savedPct > 0 ? "+" : ""}
                  {stats.savedPct}%)
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={zipping || stats.isConverting}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Limpar lista
              </Button>

              {(stats.pendingCount > 0 || stats.isConverting) && (
                <Button
                  size="sm"
                  onClick={handleConvert}
                  disabled={stats.pendingCount === 0 || stats.isConverting}
                >
                  <Wand2 className="mr-1.5 h-4 w-4" />
                  {stats.isConverting
                    ? "Convertendo…"
                    : `Converter (${stats.pendingCount})`}
                </Button>
              )}

              <Button
                size="sm"
                variant={stats.pendingCount === 0 ? "default" : "secondary"}
                onClick={handleDownloadAll}
                disabled={stats.readyCount === 0 || zipping}
              >
                <Download className="mr-1.5 h-4 w-4" />
                {zipping ? "Gerando ZIP…" : "Baixar tudo (ZIP)"}
              </Button>
            </div>
          </div>

          <Progress value={stats.progress} className="h-2" />
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
              onPreview={setPreviewItem}
              onRetry={handleRetry}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{previewItem?.outName}</DialogTitle>
            <DialogDescription>
              {previewItem?.width && previewItem?.height
                ? `${previewItem.width}×${previewItem.height} px • `
                : ""}
              {previewItem ? formatBytes(previewItem.file.size) : ""}
              {previewItem?.outSize !== undefined
                ? ` → ${formatBytes(previewItem.outSize)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {previewItem?.outUrl && (
            <div className="flex max-h-[65vh] items-center justify-center overflow-hidden rounded-lg bg-muted p-2">
              <img
                src={previewItem.outUrl}
                alt={previewItem.outName}
                className="max-h-[60vh] w-auto rounded object-contain"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewItem(null)}>
              Fechar
            </Button>
            {previewItem?.outBlob && (
              <Button onClick={() => handleDownload(previewItem)}>
                <Download className="mr-1.5 h-4 w-4" />
                Baixar JPEG
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
