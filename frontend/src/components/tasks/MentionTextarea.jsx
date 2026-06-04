import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export default function MentionTextarea({
  value, onChange, onSubmit, onFocus, onBlur, members = [],
  placeholder = "Write a comment… use @name to mention someone",
  rows = 3, className,
}) {
  const [mentionQuery, setMentionQuery]   = useState(null); // string or null
  const [mentionIndex, setMentionIndex]   = useState(0);
  const [mentionAt, setMentionAt]         = useState(-1);   // cursor pos of the @
  const ref = useRef(null);

  const filtered = members.filter((m) => {
    if (!mentionQuery) return true;
    const name  = (m.user?.full_name || "").toLowerCase();
    const email = (m.user?.email || "").toLowerCase();
    return name.includes(mentionQuery.toLowerCase()) || email.includes(mentionQuery.toLowerCase());
  }).slice(0, 6);

  const insertMention = useCallback((member) => {
    const handle = member.user?.full_name?.split(" ")[0] || member.user?.email?.split("@")[0] || "user";
    const before = value.slice(0, mentionAt);
    const after  = value.slice(ref.current?.selectionEnd ?? mentionAt + mentionQuery?.length + 1);
    const next   = `${before}@${handle} ${after}`;
    onChange(next);
    setMentionQuery(null);
    setMentionAt(-1);
    setTimeout(() => {
      if (ref.current) {
        const pos = (before + `@${handle} `).length;
        ref.current.setSelectionRange(pos, pos);
        ref.current.focus();
      }
    }, 0);
  }, [value, mentionAt, mentionQuery, onChange]);

  const handleChange = (e) => {
    const text  = e.target.value;
    const caret = e.target.selectionStart;
    onChange(text);

    // Find the last @ before the cursor
    const beforeCaret = text.slice(0, caret);
    const atMatch = beforeCaret.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionAt(beforeCaret.lastIndexOf("@"));
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && filtered.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filtered[mentionIndex]);
        return;
      }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const showDropdown = mentionQuery !== null && filtered.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className={cn(
          "w-full text-sm bg-transparent outline-none px-3 py-2.5 placeholder:text-muted-foreground resize-none",
          className
        )}
        placeholder={placeholder}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      />

      {showDropdown && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-popover border rounded-lg shadow-lg z-50 py-1 overflow-hidden">
          {filtered.map((m, i) => (
            <button
              key={m.user?.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors",
                i === mentionIndex ? "bg-primary/10 text-primary" : "hover:bg-accent text-foreground"
              )}
            >
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {(m.user?.full_name || m.user?.email)?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate text-xs">{m.user?.full_name || m.user?.email}</p>
                {m.user?.full_name && (
                  <p className="text-[10px] text-muted-foreground truncate">{m.user?.email}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
