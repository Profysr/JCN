import { X, Trash2, Tag, User, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PRIORITIES } from "@/lib/constants";

export default function BulkActionBar({ count, statuses, members, onUpdate, onDelete, onClear }) {
  const [showStatus,   setShowStatus]   = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const [showAssign,   setShowAssign]   = useState(false);

  if (count === 0) return null;

  const close = () => { setShowStatus(false); setShowPriority(false); setShowAssign(false); };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
      <div className="flex items-center gap-1.5 bg-foreground text-background rounded-xl px-3 py-2 shadow-2xl border border-white/10">
        {/* Count badge */}
        <span className="text-xs font-semibold bg-primary text-white rounded-md px-2 py-0.5 mr-1.5">
          {count} selected
        </span>

        {/* Status */}
        <div className="relative">
          <button
            onClick={() => { close(); setShowStatus((v) => !v); }}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            Status <ChevronDown className="w-3 h-3" />
          </button>
          {showStatus && (
            <div className="absolute bottom-full mb-2 left-0 bg-popover border rounded-lg shadow-xl py-1 min-w-[140px] z-50">
              {statuses.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onUpdate({ status_id: s.id }); close(); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-foreground"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority */}
        <div className="relative">
          <button
            onClick={() => { close(); setShowPriority((v) => !v); }}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            Priority <ChevronDown className="w-3 h-3" />
          </button>
          {showPriority && (
            <div className="absolute bottom-full mb-2 left-0 bg-popover border rounded-lg shadow-xl py-1 min-w-[140px] z-50">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => { onUpdate({ priority: p.value }); close(); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-foreground",
                    p.textCls
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Assignee */}
        {members.length > 0 && (
          <div className="relative">
            <button
              onClick={() => { close(); setShowAssign((v) => !v); }}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <User className="w-3.5 h-3.5" /> Assign <ChevronDown className="w-3 h-3" />
            </button>
            {showAssign && (
              <div className="absolute bottom-full mb-2 left-0 bg-popover border rounded-lg shadow-xl py-1 min-w-[160px] z-50">
                <button
                  onClick={() => { onUpdate({ assignee_id: null }); close(); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                >
                  Unassign
                </button>
                {members.map((m) => (
                  <button
                    key={m.user?.id}
                    onClick={() => { onUpdate({ assignee_id: m.user?.id }); close(); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-foreground"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {(m.user?.full_name || m.user?.email)?.[0]?.toUpperCase()}
                    </div>
                    {m.user?.full_name || m.user?.email}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="w-px h-4 bg-white/20 mx-1" />

        {/* Delete */}
        <button
          onClick={() => {
            if (confirm(`Delete ${count} tasks? This cannot be undone.`)) {
              onDelete();
              close();
            }
          }}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>

        {/* Clear */}
        <button
          onClick={() => { onClear(); close(); }}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          title="Clear selection"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
