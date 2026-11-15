"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

type EmptyOption = {
  value: string;
  label: string;
  description?: string;
};

type ModelDropdownProps = {
  id: string;
  labelId: string;
  name: string;
  value: string;
  models: readonly string[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyOption?: EmptyOption;
  required?: boolean;
  invalid?: boolean;
  errorId?: string;
  hintId?: string;
  disabled?: boolean;
  compact?: boolean;
  onBlurAfterTouch?: (value: string) => void;
};

export function ModelDropdown({
  id,
  labelId,
  name,
  value,
  models,
  onChange,
  placeholder,
  emptyOption,
  required = false,
  invalid = false,
  errorId,
  hintId,
  disabled = false,
  compact = false,
  onBlurAfterTouch,
}: ModelDropdownProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const [focusTriggerTick, setFocusTriggerTick] = useState(0);
  const touchedRef = useRef(false);
  const valueRef = useRef(value);
  const blurCallbackRef = useRef(onBlurAfterTouch);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  useEffect(() => {
    touchedRef.current = touched;
  }, [touched]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    blurCallbackRef.current = onBlurAfterTouch;
  }, [onBlurAfterTouch]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (focusTriggerTick > 0) {
      triggerRef.current?.focus();
    }
  }, [focusTriggerTick]);

  const normalizedQuery = query.trim().toLowerCase();
  const options = useMemo(() => {
    const entries: Array<{ value: string; label: string; description?: string; isAuto: boolean }> = [];
    if (
      emptyOption &&
      (!normalizedQuery ||
        emptyOption.label.toLowerCase().includes(normalizedQuery) ||
        (emptyOption.description?.toLowerCase().includes(normalizedQuery) ?? false))
    ) {
      entries.push({ ...emptyOption, isAuto: true });
    }
    for (const modelId of models) {
      if (!normalizedQuery || modelId.toLowerCase().includes(normalizedQuery)) {
        entries.push({ value: modelId, label: modelId, isAuto: false });
      }
    }
    return entries;
  }, [emptyOption, models, normalizedQuery]);

  const closeMenu = (restoreFocus = false, runBlurCheck = false) => {
    setOpen(false);
    setQuery("");
    if (runBlurCheck && touched) {
      onBlurAfterTouch?.(value);
    }
    if (restoreFocus) {
      setFocusTriggerTick((n) => n + 1);
    }
  };

  const openMenu = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect && typeof window !== "undefined") {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUpward(spaceBelow < 290 && spaceAbove > spaceBelow);
    }
    const selectedIdx = options.findIndex((item) => item.value === value);
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && wrapRef.current?.contains(event.target)) return;
      setOpen(false);
      setQuery("");
      if (touchedRef.current) blurCallbackRef.current?.(valueRef.current);
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setQuery("");
        if (touchedRef.current) blurCallbackRef.current?.(valueRef.current);
        queueMicrotask(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [open]);

  const selectOption = (nextValue: string) => {
    setTouched(true);
    onChange(nextValue);
    setOpen(false);
    setQuery("");
    setFocusTriggerTick((n) => n + 1);
  };

  const moveHighlight = (nextIndex: number) => {
    if (!options.length) return;
    const clamped = Math.max(0, Math.min(options.length - 1, nextIndex));
    setActiveIndex(clamped);
    optionRefs.current[clamped]?.scrollIntoView?.({ block: "nearest" });
  };

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveHighlight(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveHighlight(options.length - 1);
    } else if (event.key === "Enter" && options.length) {
      event.preventDefault();
      const target = options[Math.min(activeIndex, options.length - 1)];
      if (target) selectOption(target.value);
    }
  };

  const displayText =
    emptyOption && value === emptyOption.value
      ? emptyOption.label
      : value || placeholder;
  const isPlaceholder = !value && !emptyOption;
  const isMono = Boolean(value && (!emptyOption || value !== emptyOption.value));
  const describedBy = invalid && errorId ? errorId : hintId;

  return (
    <div
      ref={wrapRef}
      className={`admin-model-picker${compact ? " is-compact" : ""}${open ? " is-open" : ""}`}
      onBlur={(event) => {
        if (wrapRef.current?.contains(event.relatedTarget as Node | null)) return;
        if (open) closeMenu(false, true);
        else if (touched) onBlurAfterTouch?.(value);
      }}
    >
      <input type="hidden" name={name} value={value} />
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`admin-model-picker-trigger${invalid ? " is-invalid" : ""}`}
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-describedby={describedBy}
        data-required={required ? "true" : undefined}
        data-invalid={invalid ? "true" : "false"}
        disabled={disabled}
        title={isMono ? value : undefined}
        onClick={() => (open ? closeMenu(false, true) : openMenu())}
        onKeyDown={(event) => {
          if (open) {
            handleListKeyDown(event);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <span
          className={`admin-model-picker-value${isMono ? " is-mono" : ""}${isPlaceholder ? " is-placeholder" : ""}`}
        >
          {displayText}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`admin-model-picker-chevron${open ? " is-rotated" : ""}`}
        />
      </button>

      {open && (
        <div className={`admin-model-picker-popover${openUpward ? " is-upward" : ""}`}>
          <div className="admin-model-picker-search" role="search">
            <Search size={14} aria-hidden="true" className="admin-model-picker-search-icon" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Cari ID model…"
              aria-label="Cari ID model"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleListKeyDown}
            />
            <span className="admin-model-picker-count" aria-live="polite">
              {models.filter((item) => !normalizedQuery || item.toLowerCase().includes(normalizedQuery)).length}/{models.length}
            </span>
            {query && (
              <button
                type="button"
                className="admin-model-picker-clear"
                aria-label="Hapus pencarian model"
                onClick={() => {
                  setQuery("");
                  setActiveIndex(0);
                  searchRef.current?.focus();
                }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            className="admin-model-picker-list"
            tabIndex={-1}
            onKeyDown={handleListKeyDown}
          >
            {options.length ? (
              options.map((option, index) => {
                const selected = option.value === value;
                const active = index === activeIndex;
                return (
                  <button
                    key={option.isAuto ? "__auto__" : option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`admin-model-picker-option${selected ? " is-selected" : ""}${active ? " is-highlighted" : ""}${option.isAuto ? " is-auto" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option.value)}
                  >
                    <span className="admin-model-picker-option-text">
                      <strong className={option.isAuto ? undefined : "is-mono"}>{option.label}</strong>
                      {option.description && <small>{option.description}</small>}
                    </span>
                    {selected && <Check size={15} aria-hidden="true" className="admin-model-picker-check" />}
                  </button>
                );
              })
            ) : (
              <p className="admin-model-picker-empty">Tidak ada model yang cocok dengan &ldquo;{query.trim()}&rdquo;.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
