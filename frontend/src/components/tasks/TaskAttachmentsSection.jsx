import { useRef, useState } from "react";
import { useAttachments, useUploadAttachment, useDeleteAttachment } from "@/hooks/useAttachments";
import { Paperclip, Upload, X, FileText, Image, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function formatBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime) {
  return mime?.startsWith("image/");
}

export default function TaskAttachmentsSection({ workspaceSlug, projectId, taskId }) {
  const { data: attachments = [] } = useAttachments(workspaceSlug, projectId, taskId);
  const upload  = useUploadAttachment(workspaceSlug, projectId, taskId);
  const remove  = useDeleteAttachment(workspaceSlug, projectId, taskId);
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files) => {
    Array.from(files).forEach((file) => upload.mutate(file));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40"
        )}
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
        {upload.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
        ) : (
          <>
            <Upload className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">
              Drop files here or <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Max 20 MB per file</p>
          </>
        )}
      </div>

      {/* File list */}
      {attachments.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2.5 group px-2.5 py-2 rounded-md border bg-card hover:bg-accent/50 transition-colors"
            >
              {isImage(att.mime_type) ? (
                <img
                  src={att.url}
                  alt={att.original_name}
                  className="w-8 h-8 rounded object-cover flex-shrink-0 border"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{att.original_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(att.file_size)} · {att.uploaded_by?.full_name || att.uploaded_by?.email}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={att.url}
                  download={att.original_name}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => remove.mutate(att.id)}
                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
