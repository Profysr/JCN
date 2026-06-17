import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Mention } from "@tiptap/extension-mention";
import { Extension } from "@tiptap/core";
import { computePosition, flip, shift } from "@floating-ui/dom";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

function getCommentText(editor) {
  const json = editor.getJSON();
  const lines = [];
  for (const block of json.content || []) {
    let line = "";
    for (const inline of block.content || []) {
      if (inline.type === "mention") {
        line += `@${inline.attrs.label}`;
      } else if (inline.type === "hardBreak") {
        line += "\n";
      } else if (inline.text) {
        line += inline.text;
      }
    }
    lines.push(line);
  }
  return lines.join("\n").trim();
}

const CommentEditor = forwardRef(({
  members = [],
  onChange,
  onSubmit,
  onFocus,
  onBlur,
  placeholder = "Write a comment… use @ to mention someone",
  className,
}, ref) => {
  // mentionState.getRect is props.clientRect from Tiptap — a live function returning
  // the DOMRect of the @query decoration in viewport coordinates.
  const [mentionState, setMentionState] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const popupRef         = useRef(null);
  const mentionCommandRef = useRef(null);
  const selectedIndexRef  = useRef(0);
  const mentionItemsRef   = useRef([]);
  const membersRef        = useRef(members);
  const onSubmitRef       = useRef(onSubmit);
  const onChangeRef       = useRef(onChange);

  useEffect(() => { membersRef.current  = members;  }, [members]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Re-position the portal popup after every state update.
  // useLayoutEffect fires before paint so there is no position flash.
  useLayoutEffect(() => {
    if (!mentionState?.getRect || !popupRef.current) return;
    const virtualEl = { getBoundingClientRect: mentionState.getRect };
    computePosition(virtualEl, popupRef.current, {
      placement: "bottom-start",
      strategy: "fixed",
      middleware: [shift({ padding: 8 }), flip({ padding: 8 })],
    }).then(({ x, y }) => {
      if (popupRef.current) {
        popupRef.current.style.left = `${x}px`;
        popupRef.current.style.top  = `${y}px`;
      }
    });
  }, [mentionState]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading:    false,
        codeBlock:  false,
        blockquote: false,
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: "mention-chip" },
        suggestion: {
          items: ({ query }) =>
            membersRef.current
              .filter((m) => {
                const name  = (m.user?.full_name || "").toLowerCase();
                const email = (m.user?.email    || "").toLowerCase();
                return name.includes(query.toLowerCase()) || email.includes(query.toLowerCase());
              })
              .slice(0, 6)
              .map((m) => ({
                id:       m.user?.id,
                label:    m.user?.full_name?.split(" ")[0] || m.user?.email?.split("@")[0] || "user",
                fullName: m.user?.full_name,
                email:    m.user?.email,
              })),

          render: () => ({
            onStart: (props) => {
              selectedIndexRef.current = 0;
              setSelectedIndex(0);
              mentionCommandRef.current = props.command;
              mentionItemsRef.current   = props.items;
              setMentionState({ items: props.items, getRect: props.clientRect });
            },
            onUpdate: (props) => {
              selectedIndexRef.current = 0;
              setSelectedIndex(0);
              mentionCommandRef.current = props.command;
              mentionItemsRef.current   = props.items;
              setMentionState({ items: props.items, getRect: props.clientRect });
            },
            onKeyDown: ({ event }) => {
              const items = mentionItemsRef.current;
              if (event.key === "ArrowDown") {
                const next = Math.min(selectedIndexRef.current + 1, items.length - 1);
                selectedIndexRef.current = next;
                setSelectedIndex(next);
                return true;
              }
              if (event.key === "ArrowUp") {
                const next = Math.max(selectedIndexRef.current - 1, 0);
                selectedIndexRef.current = next;
                setSelectedIndex(next);
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                const item = items[selectedIndexRef.current];
                if (item) {
                  mentionCommandRef.current?.({ id: item.id, label: item.label });
                  return true;
                }
              }
              if (event.key === "Escape") {
                setMentionState(null);
                mentionCommandRef.current = null;
                return true;
              }
              return false;
            },
            onExit: () => {
              setMentionState(null);
              mentionCommandRef.current = null;
              mentionItemsRef.current   = [];
            },
          }),
        },
      }),

      Extension.create({
        name: "submitOnEnter",
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              if (mentionCommandRef.current) return false;
              onSubmitRef.current?.();
              return true;
            },
          };
        },
      }),
    ],

    onUpdate({ editor }) {
      onChangeRef.current?.(getCommentText(editor));
    },
    onFocus() { onFocus?.(); },
    onBlur()  { onBlur?.();  },

    editorProps: {
      attributes: {
        class: cn(
          "comment-tiptap focus:outline-none text-sm px-3 py-2.5 min-h-[44px]",
          className,
        ),
      },
    },
  });

  useImperativeHandle(ref, () => ({
    clear:   () => { editor?.commands.clearContent(true); onChangeRef.current?.(""); },
    focus:   () => editor?.commands.focus(),
    isEmpty: () => editor?.isEmpty ?? true,
  }));

  const insertMention = (item) => {
    mentionCommandRef.current?.({ id: item.id, label: item.label });
    setMentionState(null);
  };

  return (
    <div className="relative">
      <EditorContent editor={editor} />

      {mentionState && mentionState.items.length > 0 && createPortal(
        <div
          ref={popupRef}
          style={{ position: "fixed", zIndex: 9999, left: 0, top: 0 }}
          className="w-56 bg-popover border rounded-lg shadow-lg py-1 overflow-hidden"
        >
          {mentionState.items.map((item, i) => (
            <button
              key={item.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(item); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors",
                i === selectedIndex
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-accent text-foreground",
              )}
            >
              <Avatar
                name={item.fullName || item.email}
                size="sm"
              />
              <div className="min-w-0">
                <p className="font-medium truncate text-xs">{item.fullName || item.email}</p>
                {item.fullName && (
                  <p className="text-[10px] text-muted-foreground truncate">{item.email}</p>
                )}
              </div>
            </button>
          ))}
        </div>,
        document.body,
      )}

      <style>{`
        .comment-tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          float: left;
          height: 0;
        }
        .comment-tiptap p { margin: 0; }
        .comment-tiptap { line-height: 1.6; }
        .mention-chip {
          color: hsl(var(--primary));
          font-weight: 600;
          border-radius: 3px;
          padding: 0 1px;
        }
      `}</style>
    </div>
  );
});

CommentEditor.displayName = "CommentEditor";
export default CommentEditor;
