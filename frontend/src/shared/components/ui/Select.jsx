import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useId,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  computePosition,
  autoUpdate,
  offset,
  flip,
  shift,
  size as floatingSize,
} from "@floating-ui/dom";
import { Check, ChevronDown, Search, Plus, X } from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";

/**
 * Shared, dynamic Select / dropdown.
 *
 * One component covers every picker in the app — single & multi select, native-style
 * bordered fields, ghost in-panel triggers, icons / avatars / colour dots per option,
 * grouped & nested options, optional search and "create new", and an imperative
 * `openSignal` for keyboard shortcuts. Menu is portalled and positioned with
 * floating-ui (flip/shift) so it never clips inside modals or scroll containers.
 *
 * Option shape: { value, label, icon?, iconNode?, avatar?, color?, description?,
 *                 disabled?, keywords?, options? }
 *  - `options` on an entry makes it a GROUP (its `label` becomes a header; children
 *    may themselves nest for a tree, rendered with indentation).
 *  - `icon` is a Lucide component; `iconNode` is an arbitrary element; `avatar` is a
 *    user object / { name, src }; `color` is a hex string rendered as a dot.
 *
 * @param {Object}   props
 * @param {*}        props.value         Selected value (single) or array (multiple).
 * @param {Function} props.onChange      (value) => void  — value, or new array for multi.
 * @param {Array}    props.options       Options / groups (see shape above).
 * @param {boolean}  [props.multiple]    Multi-select mode.
 * @param {boolean}  [props.disabled]
 * @param {string}   [props.placeholder]
 * @param {boolean}  [props.searchable]  Show a filter input.
 * @param {boolean}  [props.clearable]   Show a clear (✕) affordance (single select).
 * @param {Function} [props.renderTrigger] (selected) => node — selected is option|null (single) or option[] (multi).
 * @param {Function} [props.renderOption]  (option) => node — custom option body.
 * @param {"start"|"end"} [props.align]    Horizontal alignment to the trigger.
 * @param {"bottom"|"top"} [props.side]    Preferred side (auto-flips).
 * @param {number}   [props.openSignal]    Increment to open programmatically.
 * @param {"sm"|"md"|"lg"} [props.size]
 * @param {"bordered"|"ghost"|"unstyled"} [props.variant]
 * @param {"trigger"|"auto"} [props.contentWidth]  Menu min-width source.
 * @param {Function} [props.onCreate]     (query, opts) => void — enables a create row.
 * @param {Function} [props.getCreateLabel] (query) => string.
 */
export default function Select({
  value,
  onChange,
  options = [],
  multiple = false,
  disabled = false,
  placeholder = "Select…",
  searchable = false,
  searchPlaceholder = "Search…",
  clearable = false,
  renderTrigger,
  renderOption,
  align = "start",
  side = "bottom",
  openSignal = 0,
  size = "md",
  variant = "bordered",
  contentWidth = "trigger",
  className,
  triggerClassName,
  menuClassName,
  onCreate,
  getCreateLabel = (q) => `Create "${q}"`,
  emptyText = "No options",
  maxMenuHeight = 300,
  name,
  id,
  ariaLabel,
}) {
  const generatedId = useId();
  const listboxId = id || generatedId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const selectedValues = useMemo(
    () => (multiple ? (Array.isArray(value) ? value : []) : [value]),
    [multiple, value],
  );
  const isSelected = useCallback(
    (v) => selectedValues.some((sv) => sv === v),
    [selectedValues],
  );

  // ── Flatten (with grouping + nesting) into renderable rows ─────────────────
  const filterOptions = useCallback((opts, q) => {
    if (!q) return opts;
    const needle = q.toLowerCase();
    const walk = (list) =>
      list
        .map((o) => {
          if (Array.isArray(o.options)) {
            const kids = walk(o.options);
            return kids.length ? { ...o, options: kids } : null;
          }
          const hay = `${o.label ?? ""} ${o.keywords ?? ""}`.toLowerCase();
          return hay.includes(needle) ? o : null;
        })
        .filter(Boolean);
    return walk(opts);
  }, []);

  const rows = useMemo(() => {
    const filtered = filterOptions(options, query);
    const out = [];
    const walk = (list, depth) => {
      for (const o of list) {
        if (Array.isArray(o.options)) {
          if (o.label) out.push({ type: "group", label: o.label, depth });
          walk(o.options, depth + 1);
        } else {
          out.push({ type: "option", option: o, depth });
        }
      }
    };
    walk(filtered, 0);
    return out;
  }, [options, query, filterOptions]);

  const selectableIdxs = useMemo(
    () =>
      rows
        .map((r, i) => (r.type === "option" && !r.option.disabled ? i : -1))
        .filter((i) => i >= 0),
    [rows],
  );

  const trimmedQuery = query.trim();
  const showCreate =
    !!onCreate &&
    trimmedQuery.length > 0 &&
    !rows.some(
      (r) =>
        r.type === "option" &&
        (r.option.label || "").toLowerCase() === trimmedQuery.toLowerCase(),
    );

  // ── Positioning (floating-ui, portalled) ──────────────────────────────────
  useEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const ref = triggerRef.current;
    const float = menuRef.current;
    const update = () => {
      computePosition(ref, float, {
        placement: `${side}-${align}`,
        middleware: [
          offset(6),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
          floatingSize({
            padding: 8,
            apply({ availableHeight, rects }) {
              Object.assign(float.style, {
                maxHeight: `${Math.min(availableHeight, maxMenuHeight)}px`,
                ...(contentWidth === "trigger"
                  ? { minWidth: `${rects.reference.width}px` }
                  : {}),
              });
            },
          }),
        ],
      }).then(({ x, y }) => {
        Object.assign(float.style, { left: `${x}px`, top: `${y}px` });
      });
    };
    const cleanup = autoUpdate(ref, float, update);
    return cleanup;
  }, [open, side, align, contentWidth, maxMenuHeight, rows.length]);

  // ── Open / close lifecycle ─────────────────────────────────────────────────
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (
        !menuRef.current?.contains(e.target) &&
        !triggerRef.current?.contains(e.target)
      )
        close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, close]);

  // Programmatic open (keyboard shortcuts).
  useEffect(() => {
    if (openSignal > 0 && !disabled) setOpen(true);
  }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus search + seed active row when opening.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      searchable ? searchRef.current?.focus() : menuRef.current?.focus(),
    );
    const firstSel = rows.findIndex(
      (r) => r.type === "option" && isSelected(r.option.value),
    );
    setActiveIndex(firstSel >= 0 ? firstSel : (selectableIdxs[0] ?? -1));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(
    (optValue) => {
      if (multiple) {
        const next = isSelected(optValue)
          ? selectedValues.filter((v) => v !== optValue)
          : [...selectedValues, optValue];
        onChange?.(next);
      } else {
        onChange?.(optValue);
        close();
      }
    },
    [multiple, isSelected, selectedValues, onChange, close],
  );

  const moveActive = (dir) => {
    if (!selectableIdxs.length) return;
    const pos = selectableIdxs.indexOf(activeIndex);
    const nextPos =
      pos < 0
        ? 0
        : (pos + dir + selectableIdxs.length) % selectableIdxs.length;
    setActiveIndex(selectableIdxs[nextPos]);
  };

  const onTriggerKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
  };

  const onMenuKeyDown = (e) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(selectableIdxs[0] ?? -1);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(selectableIdxs[selectableIdxs.length - 1] ?? -1);
        break;
      case "Enter": {
        e.preventDefault();
        const row = rows[activeIndex];
        if (row?.type === "option" && !row.option.disabled)
          commit(row.option.value);
        else if (showCreate) handleCreate();
        break;
      }
      case "Escape":
        e.preventDefault();
        close();
        triggerRef.current?.focus();
        break;
      case "Tab":
        close();
        break;
      default:
        break;
    }
  };

  const handleCreate = () => {
    onCreate?.(trimmedQuery, { onSuccess: () => setQuery("") });
    if (!multiple) close();
  };

  // ── Selected option lookup (for trigger) ───────────────────────────────────
  const flatOptions = useMemo(() => {
    const acc = [];
    const walk = (list) =>
      list.forEach((o) =>
        Array.isArray(o.options) ? walk(o.options) : acc.push(o),
      );
    walk(options);
    return acc;
  }, [options]);

  const selectedOptions = useMemo(
    () => flatOptions.filter((o) => isSelected(o.value)),
    [flatOptions, isSelected],
  );
  const singleSelected = multiple ? null : (selectedOptions[0] ?? null);

  // ── Sizing tokens ──────────────────────────────────────────────────────────
  const sizeCls = {
    sm: "h-8 text-xs px-2",
    md: "h-9 text-sm px-2.5",
    lg: "h-10 text-sm px-3",
  }[size];

  const variantCls = {
    bordered:
      "rounded-md border border-input bg-background hover:bg-accent/40 focus:ring-1 focus:ring-ring",
    ghost: "rounded-lg hover:bg-accent/50 data-[open=true]:bg-accent/80",
    unstyled: "",
  }[variant];

  const showClear =
    clearable && !multiple && singleSelected != null && !disabled;

  return (
    <div className={cn("relative w-full", className)}>
      {name != null && (
        <input
          type="hidden"
          name={name}
          value={multiple ? (selectedValues || []).join(",") : (value ?? "")}
        />
      )}
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        data-open={open}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-1.5 text-left outline-none transition-all duration-150",
          variant !== "unstyled" && sizeCls,
          variantCls,
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer active:scale-[0.99]",
          triggerClassName,
        )}
      >
        <span className="flex-1 min-w-0 truncate">
          {renderTrigger ? (
            renderTrigger(multiple ? selectedOptions : singleSelected)
          ) : multiple ? (
            selectedOptions.length ? (
              <span className="truncate">
                {selectedOptions.length === 1
                  ? selectedOptions[0].label
                  : `${selectedOptions.length} selected`}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )
          ) : singleSelected ? (
            <OptionContent option={singleSelected} size={size} />
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>

        {showClear ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(multiple ? [] : "");
            }}
            className="flex-shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        ) : (
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/60 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open &&
        createPortal(
          <motion.div
            ref={menuRef}
            role="listbox"
            id={listboxId}
            aria-multiselectable={multiple}
            onKeyDown={onMenuKeyDown}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.13, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              // select-portal-menu: this menu is portaled to document.body, outside the trigger's DOM subtree — driver.js's tour overlay (tour.css) targets this class to keep it clickable while a tour is active.
              "select-portal-menu fixed z-[1100] left-0 top-0 flex flex-col overflow-hidden rounded-xl border border-border/60 bg-popover shadow-2xl outline-none",
              menuClassName,
            )}
            style={{ minWidth: "11rem" }}
          >
            {searchable && (
              <div className="flex items-center gap-2 border-b border-border/50 px-2.5 py-2">
                <Search className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/60" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(-1);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-1">
              {rows.length === 0 && !showCreate && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {emptyText}
                </p>
              )}

              {rows.map((row, i) =>
                row.type === "group" ? (
                  <p
                    key={`g-${i}`}
                    className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60"
                    style={{ paddingLeft: 12 + row.depth * 12 }}
                  >
                    {row.label}
                  </p>
                ) : (
                  <button
                    key={row.option.value ?? `o-${i}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected(row.option.value)}
                    disabled={row.option.disabled}
                    onClick={() => commit(row.option.value)}
                    onMouseEnter={() => setActiveIndex(i)}
                    style={{ paddingLeft: 12 + row.depth * 12 }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                      row.option.disabled && "opacity-40 cursor-not-allowed",
                      activeIndex === i && "bg-accent/70",
                      isSelected(row.option.value) && "font-semibold",
                    )}
                  >
                    {multiple && (
                      <span
                        className={cn(
                          "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
                          isSelected(row.option.value)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {isSelected(row.option.value) && (
                          <Check className="h-3 w-3" />
                        )}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      {renderOption ? (
                        renderOption(row.option)
                      ) : (
                        <OptionContent option={row.option} size={size} />
                      )}
                    </span>
                    {!multiple && (
                      <span
                        className={cn(
                          "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition-all duration-150",
                          isSelected(row.option.value)
                            ? "scale-100 bg-primary"
                            : "scale-0",
                        )}
                      >
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      </span>
                    )}
                  </button>
                ),
              )}

              {showCreate && (
                <button
                  type="button"
                  onClick={handleCreate}
                  className="mt-0.5 flex w-full items-center gap-2 border-t border-border/40 px-3 py-2 text-left text-sm text-primary transition-colors hover:bg-primary/10"
                >
                  <Plus className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{getCreateLabel(trimmedQuery)}</span>
                </button>
              )}
            </div>
          </motion.div>,
          document.body,
        )}
    </div>
  );
}

// ── Default option / trigger content (icon | avatar | colour dot + label) ─────
function OptionContent({ option, size }) {
  const iconSize = size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5";
  const Icon = option.icon;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {option.avatar ? (
        <Avatar
          user={typeof option.avatar === "object" ? option.avatar : undefined}
          name={option.avatar?.name ?? option.label}
          src={option.avatar?.src}
          size="xs"
        />
      ) : option.iconNode ? (
        <span className="flex-shrink-0">{option.iconNode}</span>
      ) : Icon ? (
        <Icon className={cn("flex-shrink-0", iconSize, option.color)} />
      ) : option.color ? (
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: option.color }}
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", option.color && !Icon && "")}>
          {option.label}
        </span>
        {option.description && (
          <span className="block truncate text-xs text-muted-foreground">
            {option.description}
          </span>
        )}
      </span>
    </span>
  );
}
