import { lazy, Suspense, useState } from "react";
import { Loader } from "@/shared/components/ui/Loader";
import { ConfirmModal } from "@/shared/components/ui/ConfirmModal";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Plus,
  FileText,
  ChevronRight,
  ChevronDown,
  Trash2,
  Globe,
  Lock,
  History,
  Edit3,
  Check,
  X,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
// Lazy — Tiptap + 15 extensions only load when a wiki page is opened for editing
const VoltEditor = lazy(() => import("@/shared/components/ui/VoltEditor"));
import {
  useWikiPages,
  useWikiPage,
  useCreateWikiPage,
  useUpdateWikiPage,
  useDeleteWikiPage,
  useWikiRevisions,
} from "@/apps/project-management/hooks/useWiki";
import { useBoardSocket } from "@/apps/project-management/hooks/useBoardSocket";
import { useToast } from "@/shared/components/ui/toast";

export default function WikiPage() {
  const { workspaceId, boardId, pageId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useBoardSocket();

  const { data: pages = [], isLoading: pagesLoading } = useWikiPages(
    workspaceId,
    boardId,
  );
  const { data: page, isLoading: pageLoading } = useWikiPage(
    workspaceId,
    boardId,
    pageId,
  );
  const createPage = useCreateWikiPage(workspaceId, boardId);
  const updatePage = useUpdateWikiPage(workspaceId, boardId, pageId);
  const deletePage = useDeleteWikiPage(workspaceId, boardId);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [showRevisions, setShowRevisions] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [creatingPage, setCreatingPage] = useState(false);

  const handleCreatePage = (e) => {
    e.preventDefault();
    if (!newPageTitle.trim()) return;
    createPage.mutate(
      { title: newPageTitle.trim(), content: "" },
      {
        onSuccess: (p) => {
          setNewPageTitle("");
          setCreatingPage(false);
          navigate(`/w/${workspaceId}/boards/${boardId}/wiki/${p.id}`);
        },
      },
    );
  };

  const handleTitleSave = () => {
    if (titleDraft.trim() && titleDraft !== page?.title) {
      updatePage.mutate({ title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  const handleDelete = () => {
    setConfirmState({
      message: "This page will be permanently deleted.",
      onConfirm: () =>
        deletePage.mutate(pageId, {
          onSuccess: () => {
            toast.success("Page deleted");
            navigate(`/w/${workspaceId}/boards/${boardId}/wiki`);
          },
        }),
    });
  };

  return (
    <div className="flex h-full">
      {/* Sidebar — page tree */}
      <div className="w-56 flex-shrink-0 border-r flex flex-col bg-sidebar-bg/50">
        <div className="flex items-center justify-between px-3 py-3 border-b">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate(`/w/${workspaceId}/boards/${boardId}`)}
              className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="Back to board"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Wiki
            </span>
          </div>
          <button
            onClick={() => setCreatingPage(true)}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="New page"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {creatingPage && (
          <form onSubmit={handleCreatePage} className="px-3 py-2 border-b">
            <input
              autoFocus
              className="w-full text-xs border rounded px-2 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
              placeholder="Page title…"
              value={newPageTitle}
              onChange={(e) => setNewPageTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setCreatingPage(false);
              }}
            />
            <div className="flex gap-1 mt-1.5">
              <button
                type="submit"
                className="flex-1 text-xs bg-primary text-primary-foreground rounded py-1 font-medium"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setCreatingPage(false)}
                className="text-xs text-muted-foreground px-2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {pagesLoading ? (
            <Loader size="sm" className="py-6" />
          ) : pages.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No pages yet.
              <br />
              <button
                onClick={() => setCreatingPage(true)}
                className="text-primary hover:underline mt-1"
              >
                Create first page
              </button>
            </div>
          ) : (
            <WikiTree
              pages={pages}
              boardId={boardId}
              workspaceId={workspaceId}
              activePageId={pageId}
            />
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!pageId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                Select a page from the sidebar or create a new one.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setCreatingPage(true)}
              >
                <Plus className="w-4 h-4 mr-1.5" /> New Page
              </Button>
            </div>
          </div>
        ) : pageLoading ? (
          <Loader className="flex-1" />
        ) : page ? (
          <>
            {/* Page header */}
            <div className="flex items-center justify-between px-8 py-4 border-b flex-shrink-0">
              <div className="flex-1 min-w-0">
                {editingTitle ? (
                  <input
                    autoFocus
                    className="text-xl font-bold bg-transparent border-b border-primary outline-none w-full pb-0.5"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSave();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                  />
                ) : (
                  <h1
                    className="text-xl font-bold cursor-text hover:text-primary/80 transition-colors"
                    onClick={() => {
                      setTitleDraft(page.title);
                      setEditingTitle(true);
                    }}
                  >
                    {page.title}
                  </h1>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Updated {format(new Date(page.updated_at), "MMM d, yyyy")}
                  {page.created_by &&
                    ` · by ${page.created_by.full_name || page.created_by.email}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 ml-4">
                <button
                  onClick={() =>
                    updatePage.mutate({ is_public: !page.is_public })
                  }
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                    page.is_public
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                  title={
                    page.is_public
                      ? "Public — click to make private"
                      : "Private — click to make public"
                  }
                >
                  {page.is_public ? (
                    <Globe className="w-3.5 h-3.5" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                  {page.is_public ? "Public" : "Private"}
                </button>
                <button
                  onClick={() => setShowRevisions((o) => !o)}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
                  title="Page history"
                >
                  <History className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
                  title="Delete page"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Editor — Tiptap bundle loads on first render */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <Suspense fallback={<Loader className="min-h-[400px]" />}>
                  <VoltEditor
                    key={page.id}
                    value={page.content || ""}
                    onBlur={(md) => {
                      if (md !== page.content)
                        updatePage.mutate({ content: md });
                    }}
                    placeholder="Start writing…"
                    className="min-h-[400px]"
                  />
                </Suspense>
              </div>

              {/* Revisions panel */}
              {showRevisions && (
                <RevisionPanel
                  workspaceId={workspaceId}
                  boardId={boardId}
                  pageId={pageId}
                  onRestore={(content) => updatePage.mutate({ content })}
                  onClose={() => setShowRevisions(false)}
                />
              )}
            </div>
          </>
        ) : null}
      </div>

      {confirmState && (
        <ConfirmModal
          title="Delete page?"
          message={confirmState.message}
          onConfirm={() => {
            confirmState.onConfirm();
            setConfirmState(null);
          }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

function WikiTree({ pages, boardId, workspaceId, activePageId }) {
  return (
    <div className="space-y-0.5 px-2">
      {pages.map((page) => (
        <WikiTreeNode
          key={page.id}
          page={page}
          boardId={boardId}
          workspaceId={workspaceId}
          activePageId={activePageId}
          depth={0}
        />
      ))}
    </div>
  );
}

function WikiTreeNode({ page, boardId, workspaceId, activePageId, depth }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const hasChildren = page.children_count > 0;

  return (
    <div>
      <button
        onClick={() =>
          navigate(`/w/${workspaceId}/boards/${boardId}/wiki/${page.id}`)
        }
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors text-left",
          activePageId === page.id
            ? "bg-primary/10 text-primary font-medium"
            : "text-foreground/80 hover:bg-accent hover:text-foreground",
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="flex-shrink-0"
          >
            {open ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        ) : (
          <FileText className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{page.title}</span>
      </button>
      {open &&
        page.children?.map((child) => (
          <WikiTreeNode
            key={child.id}
            page={child}
            boardId={boardId}
            workspaceId={workspaceId}
            activePageId={activePageId}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

function RevisionPanel({ workspaceId, boardId, pageId, onRestore, onClose }) {
  const { data: revisions = [] } = useWikiRevisions(
    workspaceId,
    boardId,
    pageId,
  );
  const [preview, setPreview] = useState(null);

  return (
    <div className="w-72 border-l flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-semibold">History</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {revisions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No revisions yet.
          </p>
        ) : (
          revisions.map((rev) => (
            <div
              key={rev.id}
              className={cn(
                "px-4 py-3 border-b cursor-pointer hover:bg-accent transition-colors",
                preview?.id === rev.id && "bg-primary/5",
              )}
              onClick={() => setPreview(preview?.id === rev.id ? null : rev)}
            >
              <p className="text-xs font-medium">
                {rev.author?.full_name || rev.author?.email}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(rev.created_at), "MMM d, yyyy · h:mm a")}
              </p>
              {preview?.id === rev.id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full text-xs"
                  onClick={() => onRestore(rev.content)}
                >
                  Restore this version
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
