import { CheckCircle2, Download, Loader2, XCircle, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  error?: string;
};

type Props = {
  item: FileItem;
  onDownload: (item: FileItem) => void;
  onRemove: (id: string) => void;
};

export const FileRow = ({ item, onDownload, onRemove }: Props) => {
  const diff =
    item.outSize !== undefined
      ? Math.round(((item.outSize - item.file.size) / item.file.size) * 100)
      : null;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30">
      {/* Thumbnail */}
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {item.outUrl ? (
          <img
            src={item.outUrl}
            alt={item.outName}
            className="h-full w-full object-cover"
          />
        ) : item.status === "converting" ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {item.outName}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatBytes(item.file.size)}</span>
          {item.outSize !== undefined && (
            <>
              <span>→</span>
              <span>{formatBytes(item.outSize)}</span>
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
          {item.status === "converting" && <span>convertendo…</span>}
          {item.status === "error" && (
            <span className="text-destructive">{item.error ?? "erro"}</span>
          )}
        </div>
      </div>

      {/* Status / actions */}
      <div className="flex shrink-0 items-center gap-2">
        {item.status === "done" && (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-label="Pronto" />
        )}
        {item.status === "error" && (
          <XCircle className="h-5 w-5 text-destructive" aria-label="Erro" />
        )}
        {item.status === "done" && item.outBlob && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onDownload(item)}
            aria-label={`Baixar ${item.outName}`}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Baixar
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRemove(item.id)}
          aria-label="Remover arquivo"
        >
          ✕
        </Button>
      </div>
    </div>
  );
};
