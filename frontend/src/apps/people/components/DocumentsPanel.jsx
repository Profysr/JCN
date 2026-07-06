import { useState, useRef } from "react";
import { Upload, Trash2, Download, FileIcon, AlertTriangle, FileText } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Loader } from "@/shared/components/ui/Loader";
import Select from "@/shared/components/ui/Select";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/SectionCard";
import { formatDate } from "@/apps/people/constants";
import {
  useEmployeeDocs,
  useUploadEmployeeDoc,
  useDeleteEmployeeDoc,
} from "@/apps/people/hooks/useEmployeeDocs";

const DOC_TYPES = [
  { value: "contract", label: "Contract" },
  { value: "id", label: "ID" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
];

const LIST_CONTAINER_CLASS = "divide-y border rounded-lg";

function ExpiryBadge({ daysUntilExpiry }) {
  if (daysUntilExpiry === null || daysUntilExpiry === undefined) return null;
  if (daysUntilExpiry < 0) return <span className="text-xs font-medium text-rose-500">Expired</span>;
  if (daysUntilExpiry <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
        <AlertTriangle className="w-3 h-3" />
        {daysUntilExpiry}d left
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{daysUntilExpiry}d left</span>;
}

/**
 * Member-scoped employee documents (upload + list). The document data is keyed by
 * member, so this single panel serves both surfaces: the HR member-profile tab
 * (MemberDetailPage) and the standalone self-service documents page. Pass
 * `canManage={false}` for a read-only view (hides upload + delete controls).
 */
export default function DocumentsPanel({ workspaceId, memberId, canManage = true }) {
  const { data: docs = [], isLoading } = useEmployeeDocs(workspaceId, memberId);
  const upload = useUploadEmployeeDoc(workspaceId, memberId);
  const remove = useDeleteEmployeeDoc(workspaceId, memberId);
  const fileRef = useRef(null);

  const [docType, setDocType] = useState("other");
  const [expiryDate, setExpiryDate] = useState("");

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", docType);
    if (expiryDate) fd.append("expiry_date", expiryDate);

    upload.mutate(fd, {
      onSuccess: () => {
        if (fileRef.current) fileRef.current.value = "";
        setExpiryDate("");
      },
    });
  }

  if (isLoading) return <Loader className="h-40" />;

  return (
    <SectionCard title="Documents" icon={FileText}>
      <div className="space-y-6">
        {canManage && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <p className="text-sm font-medium">Upload document</p>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="block text-sm">
                <span className="text-muted-foreground">Type</span>
                <Select size="sm" className="mt-1 w-44" value={docType} onChange={setDocType} options={DOC_TYPES} />
              </label>

              <label className="block text-sm">
                <span className="text-muted-foreground">Expiry date (optional)</span>
                <input
                  type="date"
                  className="mt-1 block border rounded px-2 py-1.5 text-sm bg-background"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </label>

              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                <Upload className="w-4 h-4 mr-1.5" />
                {upload.isPending ? "Uploading…" : "Choose file"}
              </Button>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
        )}

        {docs.length === 0 ? (
          <EmptyState title="No documents yet" description="Uploaded employee documents will appear here." />
        ) : (
          <div className={LIST_CONTAINER_CLASS}>
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                <FileIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.original_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {doc.doc_type} {doc.expiry_date && ` · expires ${formatDate(doc.expiry_date)}`}
                  </p>
                </div>
                <ExpiryBadge daysUntilExpiry={doc.days_until_expiry} />
                <a
                  href={doc.file}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </a>
                {canManage && (
                  <button
                    onClick={() => remove.mutate(doc.id)}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
