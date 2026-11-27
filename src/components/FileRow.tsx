import {
  CheckCircle2,
  Download,
  Eye,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DetectedKind } from "@/lib/heic";
import { formatBytes } from "@/lib/zip";

export type FileItemStatus = "pending" | "converting" | "done" | "error";

export type FileItem = {
  id: string;
  file: File;
  status: FileItemStatus;
  outName: string;
  outBlob?: Blob;
  outUrl?: string;
  outSize?: number;
  width?: number;
  height?: number;
  detectedKind?: DetectedKind;
  error?: string;
};

type Props = {
  item: FileItem;
  onDownload: (item: FileItem) => void;
  onPreview: (item: FileItem) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
};

const KIND_LABEL: Record<DetectedKind, string> = {
  heic: "HEIC",
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
  unknown: "IMG",
};

export const FileRow = ({ item, onDownload, onPreview, onRetry, onRemove }: Props) => {
  const diff =
    item.outSize !== undefined && item.file.size > 0
      ? Math.round(((item.outSize - item.file.size) / item.file.size) * 100)
      : null;

  const canPreview = item.status === "done" && Boolean(item.outUrl);

  return (
    <div className="flex items-center gap-3.5 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30 sm:gap-4">
      {/* Thumbnail */}
      <button
        type="button"
        onClick={() => canPreview && onPreview(item)}
        disabled={!canPreview}
        aria-label={canPreview ? `Visualizar ${item.outName}` : undefined}
        className={`group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted ${
          canPreview ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "cursor-default"
        }`}
      >
        {item.outUrl ? (
          <>
            <img
              src={item.outUrl}
              alt={item.outName}
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
              <Eye className="h-4 w-4 text-white" />
            </span>
          </>
        ) : item.status === "converting" ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {item.outName}
          </span>
          {item.detectedKind && item.detectedKind !== "unknown" && (
            <Badge variant="secondary" className="hidden px-1.5 py-0 text-[10px] sm:inline-flex">
              {KIND_LABEL[item.detectedKind]} → JPG
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatBytes(item.file.size)}</span>
          {item.outSize !== undefined && (
            <>
              <span>→</span>
              <span className="font-medium text-foreground">{formatBytes(item.outSize)}</span>
              {diff !== null && (
                <span
                  className={
                    diff < 0
                      ? "font-medium text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  }
                >
                  ({diff > 0 ? "+" : ""}
                  {diff}%)
                </span>
              )}
            </>
          )}
          {item.width && item.height && (
            <span className="hidden sm:inline">
              • {item.width}×{item.height}
            </span>
          )}
          {item.status === "pending" && <span>• na fila</span>}
          {item.status === "converting" && <span>• convertendo…</span>}
          {item.status === "error" && (
            <span className="text-destructive">• {item.error ?? "erro na conversão"}</span>
          )}
        </div>
      </div>

      {/* Status / actions */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {item.status === "done" && (
          <CheckCircle2
            className="h-4 w-4 text-emerald-600 dark:text-emerald-400 sm:h-5 sm:w-5"
            aria-label="Pronto"
          />
        )}
        {item.status === "error" && (
          <>
            <XCircle className="h-4 w-4 text-destructive sm:h-5 sm:w-5" aria-label="Erro" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRetry(item.id)}
              aria-label={`Tentar novamente ${item.file.name}`}
            >
              <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Tentar</span>
            </Button>
          </>
        )}
        {item.status === "done" && item.outBlob && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onDownload(item)}
            aria-label={`Baixar ${item.outName}`}
          >
            <Download className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Baixar</span>
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => onRemove(item.id)}
          aria-label={`Remover ${item.file.name}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
