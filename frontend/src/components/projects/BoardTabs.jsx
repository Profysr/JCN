import { useState, useRef } from "react";
import {
  LayoutGrid, List, Zap, CalendarDays, GanttChartSquare,
  Plus, MoreHorizontal, Star, Archive, Pencil, Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdateBoard, useDeleteBoard, useArchiveBoard, useReorderBoards } from "@/hooks/useBoards";
import { Tooltip } from "@/components/ui/tooltip";

export const BOARD_TYPE_META = {
  kanban:   { icon: LayoutGrid,       label: "Kanban"   },
  scrum:    { icon: Zap,              label: "Scrum"    },
  list:     { icon: List,             label: "List"     },
  timeline: { icon: GanttChartSquare, label: "Timeline" },
  calendar: { icon: CalendarDays,     label: "Calendar" },
};

export default function BoardTabs({
  boards = [],
  activeBoardId,
  onSelectBoard,
  onNewBoard,
  workspaceSlug,
  projectId,
  canEdit,
}) {
  const scrollRef     = useRef(null);
  const updateBoard   = useUpdateBoard(workspaceSlug, projectId);
  const deleteBoard   = useDeleteBoard(workspaceSlug, projectId);
  const archiveBoard  = useArchiveBoard(workspaceSlug, projectId);
  const reorderBoards = useReorderBoards(workspaceSlug, projectId);

  // Drag state for tab reordering
  const [dragging, setDragging]     = useState(null); // boardId being dragged
  const [dragOver, setDragOver]     = useState(null);
  const [renaming, setRenaming]     = useState(null);
  const [renameVal, setRenameVal]   = useState("");
  const [menuOpen, setMenuOpen]     = useState(null); // boardId with open menu

  const handleDragStart = (e, boardId) => {
    setDragging(boardId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    if (dragging && dragOver && dragging !== dragOver) {
      const ids = boards.map((b) => b.id);
      const fromIdx = ids.indexOf(dragging);
      const toIdx   = ids.indexOf(dragOver);
      const reordered = [...boards];
      reordered.splice(toIdx, 0, reordered.splice(fromIdx, 1)[0]);
      reorderBoards.mutate(reordered.map((b, i) => ({ id: b.id, order: i })));
    }
    setDragging(null);
    setDragOver(null);
  };

  const startRename = (board) => {
    setRenaming(board.id);
    setRenameVal(board.name);
    setMenuOpen(null);
  };

  const commitRename = (boardId) => {
    if (renameVal.trim()) {
      updateBoard.mutate({ boardId, name: renameVal.trim() });
    }
    setRenaming(null);
  };

  const handleSetDefault = (boardId) => {
    updateBoard.mutate({ boardId, is_default: true });
    setMenuOpen(null);
  };

  const handleArchive = (boardId) => {
    archiveBoard.mutate(boardId);
    setMenuOpen(null);
    if (activeBoardId === boardId) {
      const fallback = boards.find((b) => b.id !== boardId && b.is_default);
      if (fallback) onSelectBoard(fallback);
    }
  };

  const handleDelete = (board) => {
    if (!window.confirm(`Delete "${board.name}"? This cannot be undone.`)) return;
    deleteBoard.mutate(board.id);
    setMenuOpen(null);
    if (activeBoardId === board.id) {
      const fallback = boards.find((b) => b.id !== board.id && b.is_default);
      if (fallback) onSelectBoard(fallback);
    }
  };

  // No boards yet — just the "New board" trigger (no own border-b; parent row provides it)
  if (boards.length === 0) {
    if (!canEdit) return null;
    return (
      <div className="flex items-center px-3 py-2 border-r border-border/50 flex-shrink-0">
        <button
          onClick={onNewBoard}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-dashed border-border/60 hover:border-primary/50 transition-colors whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" /> New board
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center flex-shrink-0 max-w-[40%]">
      {/* Scrollable tabs — no own border-b; parent row provides it */}
      <div
        ref={scrollRef}
        className="flex items-center overflow-x-auto scrollbar-none px-2 gap-0.5"
        style={{ scrollbarWidth: "none" }}
      >
        {boards.map((board) => {
          const meta    = BOARD_TYPE_META[board.board_type] || BOARD_TYPE_META.kanban;
          const Icon    = meta.icon;
          const isActive = board.id === activeBoardId;

          return (
            <div
              key={board.id}
              draggable={canEdit}
              onDragStart={(e) => handleDragStart(e, board.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(board.id); }}
              onDragEnd={handleDragEnd}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer select-none group flex-shrink-0",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
                dragging === board.id && "opacity-40",
                dragOver === board.id && dragging !== board.id && "bg-accent/60",
              )}
              onClick={() => renaming !== board.id && onSelectBoard(board)}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />

              {/* Inline rename */}
              {renaming === board.id ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    className="text-sm bg-transparent border-b border-primary outline-none w-24"
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(board.id);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={() => commitRename(board.id)}
                  />
                  <button onClick={() => commitRename(board.id)} className="text-primary">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setRenaming(null)} className="text-muted-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <span className="max-w-[120px] truncate">{board.name}</span>
              )}

              {board.is_default && (
                <Tooltip content="Default board">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                </Tooltip>
              )}

              {/* Dot menu */}
              {canEdit && renaming !== board.id && (
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent transition-all ml-0.5"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === board.id ? null : board.id); }}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Dropdown menu */}
              {menuOpen === board.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                  <div className="absolute top-full left-0 mt-1 w-44 z-50 bg-popover border rounded-xl shadow-popover py-1 text-sm">
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
                      onClick={(e) => { e.stopPropagation(); startRename(board); }}
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Rename
                    </button>
                    {!board.is_default && (
                      <button
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
                        onClick={(e) => { e.stopPropagation(); handleSetDefault(board.id); }}
                      >
                        <Star className="w-3.5 h-3.5 text-muted-foreground" /> Set as default
                      </button>
                    )}
                    {!board.is_default && (
                      <button
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
                        onClick={(e) => { e.stopPropagation(); handleArchive(board.id); }}
                      >
                        <Archive className="w-3.5 h-3.5 text-muted-foreground" /> Archive
                      </button>
                    )}
                    {!board.is_default && (
                      <button
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent hover:text-destructive transition-colors text-left text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(board); }}
                      >
                        <X className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* New board button */}
        {canEdit && (
          <Tooltip content="New board">
            <button
              onClick={onNewBoard}
              className="flex items-center gap-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0 ml-0.5"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
      {/* Vertical divider between tabs and filters */}
      <div className="w-px h-5 bg-border/60 mx-1 flex-shrink-0" />
    </div>
  );
}
