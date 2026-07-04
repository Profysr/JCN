import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
// Individual mark extensions — configured with inclusive:false so marks reset on Enter
import { Bold as BoldExt } from "@tiptap/extension-bold";
import { Italic as ItalicExt } from "@tiptap/extension-italic";
import { Strike as StrikeExt } from "@tiptap/extension-strike";
import { Code as CodeExt } from "@tiptap/extension-code";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Link as LinkIcon,
  Undo,
  Redo,
  Table as TableIcon,
  Plus,
  Trash2
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  useEffect,
  useCallback,
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";

// ── Non-inclusive marks — reset at paragraph boundary (Enter key) ────────────
const NiBold = BoldExt.extend({ inclusive: false });
const NiItalic = ItalicExt.extend({ inclusive: false });
const NiStrike = StrikeExt.extend({ inclusive: false });
const NiCode = CodeExt.extend({ inclusive: false });
const NiUnderline = Underline.extend({ inclusive: false });

const VoltEditor = forwardRef(function VoltEditor(
  {
    value = "",
    onChange,
    onBlur,
    placeholder = "Write something…",
    readOnly = false,
    className,
  },
  ref,
) {
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const linkRef = useRef(null);
  // Tracks whether the last value change originated from the editor itself.
  // If true, the sync useEffect skips setContent — preventing the input loop
  // that was blocking typing.
  const internalChange = useRef(false);

  const editor = useEditor({
    extensions: [
      // StarterKit with its marks disabled — we add them individually above
      StarterKit.configure({
        bold: false,
        italic: false,
        strike: false,
        code: false,
        underline: false,
        link: false,
        codeBlock: { languageClassPrefix: "language-" },
      }),
      NiBold,
      NiItalic,
      NiStrike,
      NiCode,
      NiUnderline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      TextStyle,
      Link.configure({ openOnClick: false, autolink: true, inclusive: false }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({ html: false, tightLists: true }),
    ],
    content: value,
    editable: !readOnly,
    onUpdate({ editor }) {
      internalChange.current = true; // mark as editor-driven
      onChange?.(editor.storage.markdown.getMarkdown());
    },
    onBlur({ editor }) {
      if (editor.isDestroyed) return;
      onBlur?.(editor.storage.markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: "volt-editor focus:outline-none min-h-[100px] px-1",
      },
    },
  });

  // Expose an imperative focus() so parents (e.g. the ⇧E description shortcut)
  // can move the caret into the editor.
  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.chain().focus("end").run(),
    }),
    [editor],
  );

  // Sync editor content only when the value comes from an external source
  // (e.g. switching tasks). Skip when the editor itself triggered the change.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (internalChange.current) {
      internalChange.current = false; // reset flag, don't call setContent
      return;
    }
    const current = editor.storage.markdown.getMarkdown();
    if (current !== value) {
      editor.commands.setContent(value || "", false); // false = don't re-emit update
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close link input on outside click
  useEffect(() => {
    const handler = (e) => {
      if (linkRef.current && !linkRef.current.contains(e.target))
        setLinkInputOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openLinkInput = useCallback(() => {
    const existing = editor.getAttributes("link").href || "";
    setLinkDraft(existing);
    setLinkInputOpen(true);
    setTimeout(() => linkRef.current?.querySelector("input")?.focus(), 50);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!linkDraft.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = linkDraft.startsWith("http")
        ? linkDraft
        : `https://${linkDraft}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkInputOpen(false);
    setLinkDraft("");
  }, [editor, linkDraft]);

  if (!editor) return null;

  if (readOnly) {
    return (
      <div className={cn("volt-editor-readonly", className)}>
        <EditorContent editor={editor} />
        <VoltStyles />
      </div>
    );
  }

  const inTable = editor.isActive("table");

  return (
    <div
      className={cn(
        "volt-wrap border rounded-lg overflow-hidden focus-within:border-primary transition-colors bg-card",
        className,
      )}
    >
      <VoltStyles />

      {/* ── Main toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-muted/20">
        {/* Headings */}
        <ToolBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="w-3.5 h-3.5" />
        </ToolBtn>

        <Sep />

        {/* Inline formatting — also in bubble menu, but kept here for discoverability */}
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Strikethrough"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolBtn>

        <Sep />

        {/* Lists */}
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive("taskList")}
          title="Checklist"
        >
          <ListChecks className="w-3.5 h-3.5" />
        </ToolBtn>

        <Sep />

        {/* Block elements */}
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Quote"
        >
          <Quote className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="Code block"
        >
          <Code className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Divider"
        >
          <Minus className="w-3.5 h-3.5" />
        </ToolBtn>

        <Sep />

        {/* Link */}
        <div className="relative" ref={linkRef}>
          <ToolBtn
            onClick={openLinkInput}
            active={editor.isActive("link")}
            title="Insert link"
          >
            <LinkIcon className="w-3.5 h-3.5" />
          </ToolBtn>
          {linkInputOpen && (
            <div className="absolute left-0 top-8 z-50 flex items-center gap-1.5 bg-popover border rounded-lg shadow-lg px-2 py-1.5 w-64">
              <LinkIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <input
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                placeholder="https://…"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyLink();
                  if (e.key === "Escape") setLinkInputOpen(false);
                }}
              />
              <button
                onClick={applyLink}
                className="text-xs font-medium text-primary hover:underline"
              >
                Apply
              </button>
              {editor.isActive("link") && (
                <button
                  onClick={() => {
                    editor.chain().focus().unsetLink().run();
                    setLinkInputOpen(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>

        <Sep />

        {/* Table */}
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          active={inTable}
          title="Insert table"
        >
          <TableIcon className="w-3.5 h-3.5" />
        </ToolBtn>

        {/* Table context controls — only when cursor is inside a table */}
        {inTable && (
          <>
            <ToolBtn
              onClick={() => editor.chain().focus().addRowAfter().run()}
              title="Add row below"
            >
              {" "}
              <Plus className="w-3 h-3" />
              <span className="text-[10px] ml-0.5">Row</span>
            </ToolBtn>
            <ToolBtn
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              title="Add col right"
            >
              {" "}
              <Plus className="w-3 h-3" />
              <span className="text-[10px] ml-0.5">Col</span>
            </ToolBtn>
            <ToolBtn
              onClick={() => editor.chain().focus().deleteRow().run()}
              title="Delete row"
              className="text-destructive/70 hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
              <span className="text-[10px] ml-0.5">Row</span>
            </ToolBtn>
            <ToolBtn
              onClick={() => editor.chain().focus().deleteColumn().run()}
              title="Delete col"
              className="text-destructive/70 hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
              <span className="text-[10px] ml-0.5">Col</span>
            </ToolBtn>
            <ToolBtn
              onClick={() => editor.chain().focus().deleteTable().run()}
              title="Delete table"
              className="text-destructive/70 hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </ToolBtn>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Undo / Redo */}
        <ToolBtn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Y)"
        >
          <Redo className="w-3.5 h-3.5" />
        </ToolBtn>
      </div>

      {/* Editor content */}
      <div className="p-3.5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

VoltEditor.displayName = "VoltEditor";

export default VoltEditor;

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolBtn({
  onClick,
  active,
  disabled,
  title,
  children,
  className: cls,
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick?.();
      }} // preventDefault keeps editor focus
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center p-1.5 rounded text-xs transition-colors active:scale-[0.97]",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && "opacity-30 cursor-not-allowed pointer-events-none",
        cls,
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-border mx-0.5" />;
}

// ── Global editor styles — injected once ─────────────────────────────────────
function VoltStyles() {
  return (
    <style>{`
      /* ── Editor content area ── */
      .volt-editor, .volt-editor-readonly .tiptap {
        font-size: 0.875rem;
        line-height: 1.7;
        color: inherit;
      }
      .volt-editor:focus { outline: none; }

      /* ── Headings ── */
      .volt-editor h1, .volt-editor-readonly h1 { font-size: 1.4rem; font-weight: 700; margin: 1rem 0 0.5rem; line-height: 1.3; }
      .volt-editor h2, .volt-editor-readonly h2 { font-size: 1.15rem; font-weight: 600; margin: 0.85rem 0 0.4rem; line-height: 1.35; }
      .volt-editor h3, .volt-editor-readonly h3 { font-size: 1rem; font-weight: 600; margin: 0.75rem 0 0.3rem; }

      /* ── Paragraph ── */
      .volt-editor p, .volt-editor-readonly p { margin: 0.25rem 0; }

      /* ── Bold / Italic / Underline / Strike ── */
      .volt-editor strong { font-weight: 600; }
      .volt-editor em { font-style: italic; }
      .volt-editor u { text-decoration: underline; text-underline-offset: 2px; }
      .volt-editor s { text-decoration: line-through; opacity: 0.7; }

      /* ── Inline code ── */
      .volt-editor code, .volt-editor-readonly code {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 0.8em;
        background: hsl(var(--muted));
        border: 1px solid hsl(var(--border));
        border-radius: 4px;
        padding: 0.1em 0.4em;
        color: hsl(var(--primary));
      }

      /* ── Code block ── */
      .volt-editor pre, .volt-editor-readonly pre {
        background: hsl(220 20% 10%);
        border-radius: 8px;
        padding: 1rem 1.25rem;
        margin: 0.75rem 0;
        overflow-x: auto;
        border: 1px solid hsl(220 20% 18%);
      }
      .volt-editor pre code, .volt-editor-readonly pre code {
        background: transparent;
        border: none;
        padding: 0;
        font-size: 0.82rem;
        color: hsl(210 40% 85%);
        line-height: 1.65;
      }

      /* ── Blockquote ── */
      .volt-editor blockquote, .volt-editor-readonly blockquote {
        border-left: 3px solid hsl(var(--primary) / 0.5);
        padding-left: 1rem;
        margin: 0.6rem 0;
        color: hsl(var(--muted-foreground));
        font-style: italic;
      }

      /* ── Horizontal rule ── */
      .volt-editor hr, .volt-editor-readonly hr {
        border: none;
        border-top: 1px solid hsl(var(--border));
        margin: 1rem 0;
      }

      /* ── Links ── */
      .volt-editor a, .volt-editor-readonly a {
        color: hsl(var(--primary));
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
      }
      .volt-editor a:hover { opacity: 0.8; }

      /* ── Highlight ── */
      .volt-editor mark, .volt-editor-readonly mark {
        background: hsl(48 96% 60% / 0.35);
        border-radius: 2px;
        padding: 0 2px;
        color: inherit;
      }

      /* ── Bullet + Ordered lists ── */
      .volt-editor ul, .volt-editor-readonly ul { list-style: disc; padding-left: 1.5rem; margin: 0.4rem 0; }
      .volt-editor ol, .volt-editor-readonly ol { list-style: decimal; padding-left: 1.5rem; margin: 0.4rem 0; }
      .volt-editor li, .volt-editor-readonly li { margin: 0.15rem 0; }
      .volt-editor li p, .volt-editor-readonly li p { margin: 0; }

      /* ── Task list (checklist) ── */
      .volt-editor ul[data-type="taskList"],
      .volt-editor-readonly ul[data-type="taskList"] {
        list-style: none;
        padding-left: 0.25rem;
        margin: 0.4rem 0;
      }
      .volt-editor ul[data-type="taskList"] li,
      .volt-editor-readonly ul[data-type="taskList"] li {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        margin: 0.2rem 0;
      }
      .volt-editor ul[data-type="taskList"] li > label,
      .volt-editor-readonly ul[data-type="taskList"] li > label {
        display: flex;
        align-items: center;
        margin-top: 2px;
        flex-shrink: 0;
        cursor: pointer;
      }
      .volt-editor ul[data-type="taskList"] li > label input[type="checkbox"],
      .volt-editor-readonly ul[data-type="taskList"] li > label input[type="checkbox"] {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        accent-color: hsl(var(--primary));
        cursor: pointer;
      }
      .volt-editor ul[data-type="taskList"] li > div,
      .volt-editor-readonly ul[data-type="taskList"] li > div { flex: 1; }
      .volt-editor ul[data-type="taskList"] li[data-checked="true"] > div,
      .volt-editor-readonly ul[data-type="taskList"] li[data-checked="true"] > div {
        text-decoration: line-through;
        opacity: 0.55;
      }

      /* ── Tables ── */
      .volt-editor table, .volt-editor-readonly table {
        border-collapse: collapse;
        width: 100%;
        margin: 0.75rem 0;
        font-size: 0.85rem;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid hsl(var(--border));
      }
      .volt-editor th, .volt-editor-readonly th {
        background: hsl(var(--muted));
        font-weight: 600;
        text-align: left;
        padding: 0.5rem 0.75rem;
        border: 1px solid hsl(var(--border));
        color: hsl(var(--foreground));
      }
      .volt-editor td, .volt-editor-readonly td {
        padding: 0.45rem 0.75rem;
        border: 1px solid hsl(var(--border));
        vertical-align: top;
      }
      .volt-editor tr:nth-child(even), .volt-editor-readonly tr:nth-child(even) {
        background: hsl(var(--muted) / 0.3);
      }
      .volt-editor .selectedCell { background: hsl(var(--primary) / 0.1) !important; }
      .volt-editor .column-resize-handle {
        background: hsl(var(--primary));
        width: 2px;
        right: -1px;
        top: 0;
        bottom: 0;
        position: absolute;
        cursor: col-resize;
      }

      /* ── Placeholder ── */
      .volt-editor p.is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        color: hsl(var(--muted-foreground));
        pointer-events: none;
        float: left;
        height: 0;
      }

    `}</style>
  );
}
