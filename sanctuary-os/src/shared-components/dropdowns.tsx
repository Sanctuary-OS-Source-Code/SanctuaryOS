import { useStore } from '../store';
import { useLexicon } from '../LexiconContext';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { SidePanelContext } from "./layout";
import { HoverTooltip } from "./alerts";
import { VAULT_CHIP_CLASS } from "./constants";
import { formatDisplayName } from "./stringUtils";
import { getFileLabel } from "./modUtils";
import { compareVersions, formatVersionRangesLabel } from "./versionUtils";

interface DropdownViewportCoords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  isRight: boolean;
  isDropUp: boolean;
}

function computeDropdownViewportCoords(
  rect: DOMRect,
  opts: {
    preferredHeight?: number;
    minWidth?: number;
    alignRight?: boolean;
    forceDropUp?: boolean;
    gap?: number;
    margin?: number;
  } = {},
): DropdownViewportCoords {
  const margin = opts.margin ?? 12;
  const gap = opts.gap ?? 6;
  const preferredHeight = opts.preferredHeight ?? 300;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const spaceBelow = Math.max(0, vh - rect.bottom - margin - gap);
  const spaceAbove = Math.max(0, rect.top - margin - gap);
  const shouldDropUp =
    opts.forceDropUp !== undefined
      ? opts.forceDropUp
      : spaceBelow < preferredHeight && spaceAbove > spaceBelow;

  const availableVertical = shouldDropUp ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(120, Math.min(preferredHeight, availableVertical));

  const minW = opts.minWidth ?? 220;
  const menuWidth = Math.min(Math.max(rect.width, minW), Math.max(160, vw - margin * 2));
  const wouldOverflowRight = rect.left + menuWidth > vw - margin;
  const preferredLeft =
    (opts.alignRight || wouldOverflowRight) && rect.right - menuWidth >= margin
      ? rect.right - menuWidth
      : rect.left;
  const clampedLeft = Math.max(margin, Math.min(preferredLeft, vw - menuWidth - margin));

  return {
    top: shouldDropUp ? rect.top - gap : rect.bottom + gap,
    left: clampedLeft,
    width: menuWidth,
    maxHeight,
    isRight: false,
    isDropUp: shouldDropUp,
  };
}

export function CustomDropdown({
  value,
  selectedValues: selectedValuesProp,
  onChange,
  options: rawOptionsProp,
  allowCustom,
  searchable,
  searchPlaceholder,
  multiSelect: multiSelectProp,
  allowMultiSelect,
  disableTint,
  placeholder,
  displayLabel,
  onSelectAll,
  extraHeaderActions,
  categoryTabs,
  className,
  buttonClassName,
  flat,
  variant = "default",
  iconOnlyTrigger = false,
  tooltipPrefix,
  menuMinWidth,
  topSlot,
  triggerRef,
  centeredTrigger = false,
  matchTriggerWidth = false,
}: any) {
  const { t } = useLexicon();
  const multiSelect = multiSelectProp ?? allowMultiSelect;
  const effectiveValue = value !== undefined ? value : selectedValuesProp;
  const [isOpen, setIsOpen] = useState(false);
  const instanceId = React.useId();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<DropdownViewportCoords>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 300,
    isRight: false,
    isDropUp: false,
  });

  const options = React.useMemo(
    () =>
      Array.isArray(rawOptionsProp)
        ? rawOptionsProp.map((o: any) =>
            o && o.id === undefined && o.value !== undefined
              ? { ...o, id: o.value }
              : o
          )
        : [],
    [rawOptionsProp]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.dispatchEvent(
      new CustomEvent("sa-close-popovers", { detail: { id: instanceId, triggerEl: btnRef.current } }),
    );
    const onOtherOpen = (e: any) => {
      const detailId = typeof e.detail === "object" && e.detail !== null ? e.detail.id : e.detail;
      if (detailId !== instanceId) setIsOpen(false);
    };
    window.addEventListener("sa-close-popovers", onOtherOpen);
    return () => window.removeEventListener("sa-close-popovers", onOtherOpen);
  }, [isOpen, instanceId]);

  const rawSelectedValues = Array.isArray(effectiveValue)
    ? effectiveValue
    : effectiveValue !== undefined &&
        effectiveValue !== null &&
        effectiveValue !== ""
      ? [effectiveValue]
      : [];
  const selectedValues =
    multiSelect && !allowCustom && Array.isArray(options) && options.length > 0
      ? rawSelectedValues.filter((v: any) =>
          options.some((o: any) => String(o.id) === String(v)),
        )
      : rawSelectedValues;

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = (e?: Event) => {
      if (
        e &&
        e.type === "scroll" &&
        popoverRef.current &&
        e.target instanceof Node &&
        popoverRef.current.contains(e.target)
      ) {
        return;
      }
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const exactTriggerWidth = Math.max(160, Math.round(rect.width));
        const minW = matchTriggerWidth
          ? exactTriggerWidth
          : menuMinWidth || (iconOnlyTrigger ? 250 : 220);
        const computed = computeDropdownViewportCoords(rect, {
          preferredHeight: topSlot ? 360 : 300,
          minWidth: minW,
          alignRight: iconOnlyTrigger,
          gap: 6,
        });
        if (matchTriggerWidth) {
          const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
          const clampedWidth = Math.min(exactTriggerWidth, Math.max(160, vw - 24));
          computed.width = clampedWidth;
          computed.left = Math.max(
            12,
            Math.min(
              Math.round(rect.left + (rect.width - clampedWidth) / 2),
              vw - clampedWidth - 12,
            ),
          );
        }
        setCoords(computed);
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, iconOnlyTrigger, menuMinWidth, matchTriggerWidth, Boolean(topSlot)]);

  const getSelectedLabel = () => {
    if (displayLabel) return displayLabel;
    if (multiSelect) {
      if (selectedValues.length === 0) return placeholder || t("select", "Select...");
      const labels = selectedValues.map(
        (val: any) =>
          options?.find((o: any) => String(o.id) === String(val))?.label || val,
      );
      return labels.join(", ");
    }
    const selected =
      options.find(
        (o: any) =>
          o.id === effectiveValue || String(o.id) === String(effectiveValue),
      ) || options.find((o: any) => selectedValues.includes(o.id));
    if (
      allowCustom &&
      !selected &&
      effectiveValue !== undefined &&
      effectiveValue !== null &&
      effectiveValue !== ""
    )
      return effectiveValue;
    return selected?.label || placeholder || t("select", "Select...");
  };

  const handleSelect = (id: any) => {
    if (multiSelect) {
      const exists = selectedValues.some((v: any) => String(v) === String(id));
      const newVals = exists
        ? selectedValues.filter((v: any) => String(v) !== String(id))
        : [...selectedValues, id];
      onChange(newVals);
    } else {
      onChange([id]);
      setIsOpen(false);
    }
  };

  const isInsideSidePanel = React.useContext(SidePanelContext);

  const isActive =
    !disableTint &&
    variant === "pill" &&
    !isInsideSidePanel &&
    (multiSelect
      ? selectedValues.length > 0
      : effectiveValue !== undefined &&
        effectiveValue !== null &&
        String(effectiveValue).trim() !== "" &&
        String(effectiveValue).toLowerCase() !== "all" &&
        String(effectiveValue).toLowerCase() !== "any" &&
        String(effectiveValue).toLowerCase() !== "vlocal");

  const hasSelection = multiSelect
    ? selectedValues.length > 0
    : effectiveValue !== undefined &&
      effectiveValue !== null &&
      String(effectiveValue).trim() !== "";

  const showSearch = Boolean(searchable);

  const filteredOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (options || []).filter((opt: any) => {
      if (
        Array.isArray(categoryTabs) &&
        categoryTabs.length > 0 &&
        activeCategory !== "ALL" &&
        opt.category !== activeCategory
      ) {
        return false;
      }
      if (!showSearch || !q) return true;
      const searchTarget =
        opt.searchText !== undefined
          ? opt.searchText
          : typeof opt.label === "string"
            ? opt.label
            : "";
      return searchTarget.toLowerCase().includes(q);
    });
  }, [options, categoryTabs, activeCategory, showSearch, query]);

  const dropdownMenu = isOpen
    ? createPortal(
        <>
          <div
            className="!fixed inset-0"
            style={{ zIndex: 100000000 }}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            className="!fixed pointer-events-auto glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col text-[var(--text)]"
            style={{
              zIndex: 100000001,
              top: coords.isDropUp ? "auto" : coords.top,
              bottom: coords.isDropUp
                ? window.innerHeight - coords.top
                : "auto",
              left: coords.left,
              transition: "none",
              width: coords.width || 200,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: coords.maxHeight,
              "--glass-x": `${Math.round(coords.left)}px`,
              "--glass-y": `${Math.round(coords.top)}px`,
            } as React.CSSProperties}
          >
            {(showSearch || (multiSelect && options && options.length > 1)) && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] shrink-0 z-10">
                {showSearch ? (
                  <div className="sa-dropdown-search px-3 h-8 flex items-center gap-1.5 flex-1 min-w-0 transition-colors">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] opacity-85 shrink-0">
                      {t("icon_search", "search")}
                    </span>
                    <input
                      type="text"
                      data-1p-ignore="true"
                      autoFocus
                      placeholder={searchPlaceholder || t("search", "Search...")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="w-full bg-transparent border-none text-[11px] font-medium focus:outline-none text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-60"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuery("");
                        }}
                        className="text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center shrink-0"
                      >
                        <span className="material-symbols-outlined !text-[13px]">
                          {t("icon_close", "close")}
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 tracking-wider uppercase pl-1">
                    {selectedValues.length} {t("selected", "Selected")}
                  </span>
                )}

                {multiSelect && options && options.length > 1 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {Array.isArray(extraHeaderActions) &&
                      extraHeaderActions.map((act: any, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            act.onClick?.();
                          }}
                          className="sa-dropdown-action-chip px-2.5 h-7 text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                        >
                          {act.label}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectAll) {
                          onSelectAll();
                        } else if (
                          Array.isArray(categoryTabs) &&
                          categoryTabs.length > 0 &&
                          activeCategory !== "ALL"
                        ) {
                          const catIds = filteredOptions.map((o: any) => String(o.id));
                          const merged = Array.from(new Set([...selectedValues.map(String), ...catIds]));
                          onChange(merged);
                        } else {
                          onChange(options.map((o: any) => String(o.id)));
                        }
                      }}
                      className="sa-dropdown-action-chip px-2.5 h-7 text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      {t("all", "All")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange([]);
                      }}
                      className="sa-dropdown-action-chip px-2.5 h-7 text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      {t("clear", "Clear")}
                    </button>
                  </div>
                )}
              </div>
            )}
            {Array.isArray(categoryTabs) && categoryTabs.length > 0 && (
              <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] shrink-0 z-10 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categoryTabs.map((cat: any) => {
                  const active = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveCategory(cat.id);
                      }}
                      className={`sa-dropdown-filter-tab px-2.5 h-6 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer shrink-0 whitespace-nowrap ${
                        active ? "is-active" : ""
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            )}
            {topSlot}
            <div className="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1">
              {filteredOptions
                .slice(0, 100)
                .map((opt: any) => {
                  const isSelected = multiSelect
                    ? selectedValues.some(
                        (v: any) => String(v) === String(opt.id),
                      )
                    : opt.id === effectiveValue ||
                      String(effectiveValue) === String(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(opt.id);
                      }}
                      className={`sa-dropdown-item w-full text-left px-3.5 py-2.5 text-xs tracking-wide flex items-center gap-2.5 group cursor-pointer shrink-0 ${
                        isSelected ? "is-selected font-bold" : "font-medium"
                      }`}
                    >
                      {multiSelect && (
                        <div
                          style={{ borderRadius: "5px" }}
                          className={`w-4 h-4 border flex items-center justify-center transition-colors shrink-0 ${
                            isSelected
                              ? "bg-[color-mix(in_srgb,var(--text)_12%,transparent)] border-[color-mix(in_srgb,var(--text)_34%,transparent)] text-[var(--accent)]"
                              : "bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-[color-mix(in_srgb,var(--text)_22%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_40%,transparent)]"
                          }`}
                        >
                          {isSelected && (
                            <span className="material-symbols-outlined !text-[12px] font-black">
                              {t("icon_check", "check")}
                            </span>
                          )}
                        </div>
                      )}
                      {opt.icon && (
                        <span
                          className={`material-symbols-outlined !text-[16px] shrink-0 ${
                            opt.iconColorClass ||
                            (isSelected
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)] opacity-80 group-hover:text-[var(--text)]")
                          }`}
                        >
                          {opt.icon}
                        </span>
                      )}
                      <span className="flex-1 min-w-0 truncate leading-snug">{opt.label}</span>
                      {opt.badge && (
                        <span className="font-mono text-[10px] text-[var(--subtext)] opacity-75 shrink-0">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && !multiSelect && (
                        <span className="material-symbols-outlined !text-[15px] font-bold text-[var(--accent)] shrink-0">
                          {t("icon_check", "check")}
                        </span>
                      )}
                    </button>
                  );
                })}
              {((searchable && query) || (options || []).length === 0) &&
                filteredOptions.length === 0 &&
                !allowCustom && (
                  <div className="p-4 text-center text-xs font-medium text-[var(--subtext)] opacity-70">
                    {t("shared_no_options", "No options found")}
                  </div>
                )}
              {searchable &&
                query &&
                allowCustom &&
                !(options || []).some(
                  (o: any) =>
                    String(o.id).toLowerCase() === query.toLowerCase() ||
                    (typeof o.label === "string" &&
                      o.label.toLowerCase() === query.toLowerCase()),
                ) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(query);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] border border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--accent)] flex items-center gap-2 cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_add", "add")}
                    </span>
                    <span className="truncate w-full">
                      {t("add", "Add")} &ldquo;{query}&rdquo;
                    </span>
                  </button>
                )}
            </div>
          </div>
        </>,
        document.getElementById("sa-portals") || document.body,
      )
    : null;

  const isPill = variant === "pill";

  return (
    <div
      className={`relative ${
        iconOnlyTrigger
          ? "w-auto shrink-0"
          : className?.includes("w-")
            ? ""
            : "w-full"
      } ${className || ""}`}
    >
      <button
        type="button"
        ref={(el) => {
          (btnRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
          if (triggerRef && typeof triggerRef === "object" && "current" in triggerRef) {
            triggerRef.current = el;
          }
        }}
        data-1p-ignore="true"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`${
          iconOnlyTrigger
            ? `h-10 px-3 rounded-xl flex items-center justify-center gap-1.5 w-auto shrink-0 focus:outline-none relative z-[10] transition-all cursor-pointer ${
                isOpen || isActive
                  ? "glass-surface sa-glass-pill-active text-[var(--text)]"
                  : "glass-surface sa-glass-pill-hover text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
              }`
            : `w-full flex ${centeredTrigger ? "justify-center" : "justify-between"} items-center gap-2 focus:outline-none relative z-[10] transition-all cursor-pointer ${
                flat
                  ? "bg-transparent border-none px-0 py-1 text-xs font-black capitalize tracking-widest text-[var(--text)] opacity-90 hover:opacity-100"
                  : isPill
                    ? `h-10 px-4 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        isOpen || isActive
                          ? "glass-surface sa-glass-pill-active text-[var(--text)]"
                          : "glass-surface sa-glass-pill-hover text-[var(--text)]"
                      }`
                    : `${
                        className?.includes("h-") ? "h-full px-4" : "h-11 px-4"
                      } rounded-xl text-xs font-bold glass-surface text-[var(--text)] border transition-all ${
                        isActive
                          ? "sa-glass-pill-active"
                          : isOpen
                            ? "sa-glass-pill-active"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                      }`
              }`
        } ${buttonClassName || ""}`}
      >
        {iconOnlyTrigger ? (
          <>
            {(() => {
              const selOpt = (options || []).find(
                (o: any) =>
                  o.id === effectiveValue ||
                  String(o.id) === String(effectiveValue)
              );
              const iconName = selOpt?.icon || t("icon_flag", "flag");
              return (
                <span
                  className={`material-symbols-outlined !text-[18px] shrink-0 ${
                    selOpt?.iconColorClass || "text-[var(--accent)]"
                  }`}
                >
                  {iconName}
                </span>
              );
            })()}
            <span className="material-symbols-outlined !text-[14px] opacity-70 shrink-0">
              {isOpen
                ? t("icon_expand_less", "expand_less")
                : t("icon_expand_more", "expand_more")}
            </span>
            {!isOpen && (
              <HoverTooltip
                title={
                  tooltipPrefix
                    ? `${tooltipPrefix}: ${getSelectedLabel()}`
                    : getSelectedLabel()
                }
              />
            )}
          </>
        ) : (
          <>
            <span
              className={`${
                centeredTrigger ? "justify-center text-center" : "flex-1 text-left"
              } truncate min-w-0 flex items-center gap-2 ${
                !hasSelection && !displayLabel
                  ? "text-[var(--subtext)] opacity-60 font-medium"
                  : ""
              }`}
            >
              {!multiSelect &&
                (() => {
                  const selOpt = (options || []).find(
                    (o: any) =>
                      o.id === effectiveValue ||
                      String(o.id) === String(effectiveValue)
                  );
                  if (!selOpt?.icon) return null;
                  return (
                    <span
                      className={`material-symbols-outlined !text-[16px] shrink-0 ${
                        selOpt.iconColorClass || "text-[var(--accent)]"
                      }`}
                    >
                      {selOpt.icon}
                    </span>
                  );
                })()}
              <span className="truncate">{getSelectedLabel()}</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {multiSelect && selectedValues.length > 1 && (
                <span className="px-1.5 py-0.5 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black leading-none">
                  {selectedValues.length}
                </span>
              )}
              <span
                className={`transition-colors shrink-0 flex items-center justify-center ${
                  isOpen || isActive
                    ? "text-[var(--accent)]"
                    : "text-[var(--subtext)] opacity-60"
                }`}
              >
                <span
                  className={`material-symbols-outlined ${
                    flat ? "!text-[16px]" : "!text-[18px]"
                  }`}
                >
                  {isOpen
                    ? t("icon_expand_less", "expand_less")
                    : t("icon_expand_more", "expand_more")}
                </span>
              </span>
            </div>
          </>
        )}
      </button>
      {dropdownMenu}
    </div>
  );
}

let cachedGameVersions: string[] | null = null;
let gameVersionsPromise: Promise<string[]> | null = null;

function loadCachedGameVersions(): Promise<string[]> {
  if (cachedGameVersions) return Promise.resolve(cachedGameVersions);
  if (gameVersionsPromise) return gameVersionsPromise;
  if (
    typeof navigator !== "undefined" &&
    (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true")
  ) {
    return Promise.resolve([]);
  }
  gameVersionsPromise = (async () => {
    try {
      const { data } = await supabase
        .from("game_versions")
        .select("version")
        .order("version", { ascending: false });
      const list = Array.isArray(data)
        ? data.map((d: any) => String(d.version || "").trim()).filter(Boolean)
        : [];
      cachedGameVersions = list;
      return list;
    } catch {
      return [];
    } finally {
      gameVersionsPromise = null;
    }
  })();
  return gameVersionsPromise;
}

export function GameVersionMultiSelect({
  selectedVersions,
  onChange,
  variant = "default",
  flat = false,
  mode = "compatibility",
  dropUp,
  className = "",
}: {
  selectedVersions: string[];
  onChange: (v: string[]) => void;
  variant?: "default" | "pill";
  flat?: boolean;
  mode?: "compatibility" | "filter";
  dropUp?: boolean;
  className?: string;
}) {
  const normalizedSelected = React.useMemo(
    () =>
      Array.isArray(selectedVersions)
        ? selectedVersions.map((s) => String(s || "").trim()).filter(Boolean)
        : typeof selectedVersions === "string"
          ? (selectedVersions as string)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
    [selectedVersions],
  );

  const { t } = useLexicon();
  const isInsideSidePanel = React.useContext(SidePanelContext);
  const isPill = variant === "pill";
  const [versions, setVersions] = useState<string[]>(() => cachedGameVersions || []);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [ruleMode, setRuleMode] = useState<"min" | "range" | "max" | "exclude">("min");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [activeRuleField, setActiveRuleField] = useState<"from" | "to">("from");

  const instanceId = React.useId();
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const fromInputRef = React.useRef<HTMLInputElement>(null);
  const toInputRef = React.useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<DropdownViewportCoords>({
    top: 0,
    left: 0,
    width: 340,
    maxHeight: 380,
    isRight: false,
    isDropUp: false,
  });

  useEffect(() => {
    if (cachedGameVersions) {
      setVersions(cachedGameVersions);
      return;
    }
    let mounted = true;
    loadCachedGameVersions().then((list) => {
      if (mounted) setVersions(list);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setShowRuleBuilder(false);
      return;
    }
    window.dispatchEvent(
      new CustomEvent("sa-close-popovers", {
        detail: { id: instanceId, triggerEl: btnRef.current },
      }),
    );
    const onOtherOpen = (e: any) => {
      const detailId = typeof e.detail === "object" && e.detail !== null ? e.detail.id : e.detail;
      if (detailId !== instanceId) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (showRuleBuilder) {
          setShowRuleBuilder(false);
        } else {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener("sa-close-popovers", onOtherOpen);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("sa-close-popovers", onOtherOpen);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen, instanceId, showRuleBuilder]);

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = (e?: Event) => {
      if (
        e &&
        e.type === "scroll" &&
        popoverRef.current &&
        e.target instanceof Node &&
        popoverRef.current.contains(e.target)
      ) {
        return;
      }
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const targetMinWidth = isPill ? 280 : Math.max(240, Math.round(rect.width));
        setCoords(
          computeDropdownViewportCoords(rect, {
            preferredHeight: showRuleBuilder ? 380 : 300,
            minWidth: targetMinWidth,
            alignRight: isPill,
            forceDropUp: dropUp,
            gap: 6,
            margin: 16,
          }),
        );
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, showRuleBuilder, normalizedSelected.length, dropUp, isPill]);

  const isCompatibility = mode === "compatibility";
  const latestPatch = versions[0];
  const isAllSelected = isCompatibility && normalizedSelected.includes("ALL");
  const exclusionsOnly = React.useMemo(
    () => normalizedSelected.filter((v) => v !== "ALL"),
    [normalizedSelected],
  );

  const canAddRule = React.useMemo(() => {
    const cleanFrom = rangeFrom
      .trim()
      .replace(/^[!<>=\s]+/, "")
      .replace(/\+\s*$/, "")
      .trim();
    const cleanTo = rangeTo
      .trim()
      .replace(/^[!<>=\s]+/, "")
      .replace(/\+\s*$/, "")
      .trim();
    if (!cleanFrom) return false;
    if (ruleMode === "range") return Boolean(cleanTo);
    return true;
  }, [rangeFrom, rangeTo, ruleMode]);

  const handleAddRule = () => {
    const cleanFrom = rangeFrom
      .trim()
      .replace(/^[!<>=\s]+/, "")
      .replace(/\+\s*$/, "")
      .trim();
    const cleanTo = rangeTo
      .trim()
      .replace(/^[!<>=\s]+/, "")
      .replace(/\+\s*$/, "")
      .trim();
    if (!cleanFrom) return;
    let token = "";
    if (ruleMode === "range") {
      if (!cleanTo) return;
      const [low, high] =
        compareVersions(cleanFrom, cleanTo) <= 0
          ? [cleanFrom, cleanTo]
          : [cleanTo, cleanFrom];
      token = `${low} - ${high}`;
    } else if (ruleMode === "min") {
      token = `${cleanFrom}+`;
    } else if (ruleMode === "max") {
      token = `<=${cleanFrom}`;
    } else {
      token = `!${cleanFrom}`;
    }
    const base =
      ruleMode === "exclude"
        ? normalizedSelected
        : normalizedSelected.filter((ver) => ver !== "ALL");
    if (!base.includes(token)) {
      onChange([...base, token]);
    }
    setRangeFrom("");
    setRangeTo("");
    setActiveRuleField("from");
    setShowRuleBuilder(false);
  };

  const handleToggleAll = () => {
    if (isAllSelected) {
      onChange(normalizedSelected.filter((v) => v !== "ALL"));
    } else {
      const excl = normalizedSelected.filter((v) => v.startsWith("!"));
      onChange(["ALL", ...excl]);
    }
  };

  const handleToggleLatest = () => {
    if (!latestPatch) return;
    if (normalizedSelected.includes(latestPatch)) {
      onChange(normalizedSelected.filter((v) => v !== latestPatch));
    } else {
      onChange([
        ...normalizedSelected.filter((v) => v !== "ALL"),
        latestPatch,
      ]);
    }
  };

  const handleToggleVersion = (ver: string) => {
    if (normalizedSelected.includes(ver)) {
      onChange(normalizedSelected.filter((v) => v !== ver));
    } else {
      onChange([
        ...normalizedSelected.filter((v) => v !== "ALL"),
        ver,
      ]);
    }
  };

  const filteredVersions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeFieldRaw =
      isCompatibility && showRuleBuilder
        ? (ruleMode === "range" && activeRuleField === "to" ? rangeTo : rangeFrom).trim()
        : "";
    const activeFieldLower = activeFieldRaw.toLowerCase();
    const isExactKnownMatch =
      Boolean(activeFieldLower) &&
      versions.some((v) => v.toLowerCase() === activeFieldLower);
    const fieldFilter = !isExactKnownMatch ? activeFieldLower : "";

    return versions.filter((ver) => {
      const verLower = ver.toLowerCase();
      if (q && !verLower.includes(q)) return false;
      if (fieldFilter && !verLower.includes(fieldFilter)) return false;
      return true;
    });
  }, [versions, query, isCompatibility, showRuleBuilder, ruleMode, activeRuleField, rangeFrom, rangeTo]);

  const hasExactQueryMatch = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    return versions.some((v) => v.toLowerCase() === q);
  }, [versions, query]);

  const triggerLabel = React.useMemo(() => {
    if (normalizedSelected.length === 0) {
      return t("shared_search_versions", "Select game versions...");
    }
    if (isAllSelected) {
      if (exclusionsOnly.length === 0) {
        return t("filter_all_versions", "All Versions");
      }
      return `${t("filter_all_versions", "All Versions")}, ${formatVersionRangesLabel(exclusionsOnly)}`;
    }
    return formatVersionRangesLabel(normalizedSelected);
  }, [normalizedSelected, isAllSelected, exclusionsOnly, t]);

  const isActive =
    isPill && !isInsideSidePanel && normalizedSelected.length > 0;
  const hasSelection = normalizedSelected.length > 0;
  const showCountBadge =
    normalizedSelected.length > 1 &&
    !(normalizedSelected.length === 1 && normalizedSelected[0] === "ALL");

  const getChipAppearance = (ver: string) => {
    if (ver === "ALL") {
      return {
        icon: t("icon_done_all", "done_all"),
        colorClass: "text-[var(--success)]",
        label: t("filter_all_versions", "All Versions"),
        isMono: false,
      };
    }
    if (ver.startsWith("!")) {
      return {
        icon: t("icon_block", "block"),
        colorClass: "text-[var(--danger)]",
        label: formatVersionRangesLabel([ver]),
        isMono: true,
      };
    }
    if (ver.includes(" - ") || ver.includes("..")) {
      return {
        icon: t("icon_swap_horiz", "swap_horiz"),
        colorClass: "text-[var(--accent)]",
        label: formatVersionRangesLabel([ver]),
        isMono: true,
      };
    }
    if (ver.endsWith("+") || ver.startsWith(">=")) {
      return {
        icon: t("icon_trending_up", "trending_up"),
        colorClass: "text-[var(--accent)]",
        label: ver,
        isMono: true,
      };
    }
    if (ver.startsWith("<=")) {
      return {
        icon: t("icon_vertical_align_bottom", "vertical_align_bottom"),
        colorClass: "text-[var(--accent)]",
        label: ver,
        isMono: true,
      };
    }
    return {
      icon: undefined,
      colorClass: "text-[var(--text)]",
      label: ver,
      isMono: true,
    };
  };

  const ruleModes = [
    {
      id: "min" as const,
      icon: t("icon_trending_up", "trending_up"),
      label: t("ver_rule_min", "Minimum & Newer"),
    },
    {
      id: "range" as const,
      icon: t("icon_swap_horiz", "swap_horiz"),
      label: t("ver_rule_range", "Version Range"),
    },
    {
      id: "max" as const,
      icon: t("icon_vertical_align_bottom", "vertical_align_bottom"),
      label: t("ver_rule_max", "Up To Version"),
    },
    {
      id: "exclude" as const,
      icon: t("icon_block", "block"),
      label: t("ver_rule_exclude", "Exclude Version"),
    },
  ];

  const popoverMenu = isOpen
    ? createPortal(
        <>
          <div
            className="!fixed inset-0"
            style={{ zIndex: 100000000 }}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            className="!fixed pointer-events-auto glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col text-[var(--text)]"
            style={
              {
                zIndex: 100000001,
                top: coords.isDropUp ? "auto" : coords.top,
                bottom: coords.isDropUp
                  ? window.innerHeight - coords.top
                  : "auto",
                left: coords.left,
                transition: "none",
                width: coords.width || 280,
                maxWidth: "calc(100vw - 24px)",
                maxHeight: coords.maxHeight,
                "--glass-x": `${Math.round(coords.left)}px`,
                "--glass-y": `${Math.round(coords.top)}px`,
              } as React.CSSProperties
            }
          >
            {/* Section A — Header: Full-Width Search + Clean Quick-Action Bar */}
            <div className="px-3 pt-3 pb-2.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-2 shrink-0 z-10">
              <div className="sa-dropdown-search px-3 h-9 flex items-center gap-2 w-full transition-colors">
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] opacity-85 shrink-0">
                  {t("icon_search", "search")}
                </span>
                <input
                  type="text"
                  data-1p-ignore="true"
                  autoFocus={!showRuleBuilder}
                  placeholder={t("search", "Search...")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-transparent border-none text-xs font-medium focus:outline-none text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-60 min-w-0"
                />
                {query && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuery("");
                    }}
                    className="text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {isCompatibility && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleAll();
                      }}
                      className={`sa-dropdown-filter-tab px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer ${
                        isAllSelected ? "is-active" : ""
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined !text-[13px] ${
                          isAllSelected ? "text-[var(--success)]" : ""
                        }`}
                      >
                        {t("icon_done_all", "done_all")}
                      </span>
                      <span>{t("filter_all_versions", "All Versions")}</span>
                    </button>
                  )}

                  {Boolean(latestPatch) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleLatest();
                      }}
                      className={`sa-dropdown-filter-tab px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer ${
                        normalizedSelected.includes(latestPatch) ? "is-active" : ""
                      }`}
                    >
                      <span>{t("latest", "Latest")}</span>
                    </button>
                  )}

                  {isCompatibility && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRuleBuilder((prev) => !prev);
                      }}
                      className={`sa-dropdown-filter-tab px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer ${
                        showRuleBuilder ? "is-active" : ""
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined !text-[13px] ${
                          showRuleBuilder ? "text-[var(--accent)]" : ""
                        }`}
                      >
                        {t("icon_tune", "tune")}
                      </span>
                      <span>{t("rules", "Rules")}</span>
                    </button>
                  )}
                </div>

                {normalizedSelected.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange([]);
                    }}
                    className="sa-dropdown-action-chip px-2.5 h-7 text-[10px] font-bold uppercase tracking-wider cursor-pointer shrink-0"
                  >
                    {t("clear", "Clear")}
                  </button>
                )}
              </div>
            </div>

            {/* Section B — Active Selection Chips Strip */}
            {normalizedSelected.length > 0 && !showRuleBuilder && (
              <div className="px-3 py-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-wrap gap-1.5 max-h-[76px] overflow-y-auto custom-scrollbar shrink-0 z-10">
                {normalizedSelected.map((ver) => {
                  const chip = getChipAppearance(ver);
                  return (
                    <span
                      key={ver}
                      className={`${VAULT_CHIP_CLASS} !px-2 !py-1 inline-flex items-center gap-1.5`}
                    >
                      {chip.icon && (
                        <span
                          className={`material-symbols-outlined !text-[12px] ${chip.colorClass}`}
                        >
                          {chip.icon}
                        </span>
                      )}
                      <span
                        className={`leading-none ${chip.isMono ? "font-mono text-[10px]" : ""} text-[var(--text)]`}
                      >
                        {chip.label}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChange(normalizedSelected.filter((item) => item !== ver));
                        }}
                        aria-label={t("remove", "Remove")}
                        className="flex items-center justify-center shrink-0 text-[var(--subtext)] opacity-70 hover:opacity-100 hover:text-[var(--danger)] transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_close", "close")}
                        </span>
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Section C — Collapsible Themed Rule Builder */}
            {isCompatibility && showRuleBuilder && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="px-3 py-2.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-2 shrink-0 z-10 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]"
              >
                <div className="grid grid-cols-2 gap-1.5">
                  {ruleModes.map((m) => {
                    const isActiveMode = ruleMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRuleMode(m.id);
                          setActiveRuleField("from");
                          if (m.id !== "range") {
                            setRangeTo("");
                          }
                        }}
                        className={`sa-dropdown-filter-tab px-2.5 h-7 rounded-lg text-[10px] font-bold tracking-wide flex items-center gap-1.5 cursor-pointer min-w-0 ${
                          isActiveMode
                            ? m.id === "exclude"
                              ? "is-active !text-[var(--danger)]"
                              : "is-active"
                            : ""
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined !text-[13px] shrink-0 ${
                            isActiveMode
                              ? m.id === "exclude"
                                ? "text-[var(--danger)]"
                                : "text-[var(--accent)]"
                              : ""
                          }`}
                        >
                          {m.icon}
                        </span>
                        <span className="truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {ruleMode === "range" ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        ref={fromInputRef}
                        type="text"
                        data-1p-ignore="true"
                        value={rangeFrom}
                        onFocus={() => setActiveRuleField("from")}
                        onChange={(e) => {
                          setRangeFrom(e.target.value);
                          setActiveRuleField("from");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAddRule();
                          }
                        }}
                        placeholder={t("ver_from_label", "Start Version")}
                        className={`h-8 px-2.5 rounded-lg glass-surface border text-[11px] font-mono text-[var(--text)] placeholder:font-sans placeholder:text-[var(--subtext)] placeholder:opacity-60 w-full min-w-0 outline-none transition-colors ${
                          activeRuleField === "from"
                            ? "!border-[color-mix(in_srgb,var(--text)_28%,transparent)]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                        }`}
                      />
                      <input
                        ref={toInputRef}
                        type="text"
                        data-1p-ignore="true"
                        value={rangeTo}
                        onFocus={() => setActiveRuleField("to")}
                        onChange={(e) => {
                          setRangeTo(e.target.value);
                          setActiveRuleField("to");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAddRule();
                          }
                        }}
                        placeholder={t("ver_to_label", "End Version")}
                        className={`h-8 px-2.5 rounded-lg glass-surface border text-[11px] font-mono text-[var(--text)] placeholder:font-sans placeholder:text-[var(--subtext)] placeholder:opacity-60 w-full min-w-0 outline-none transition-colors ${
                          activeRuleField === "to"
                            ? "!border-[color-mix(in_srgb,var(--text)_28%,transparent)]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                        }`}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-[var(--subtext)] opacity-75 truncate px-0.5">
                        {t("ver_pick_hint", "Click a version below or type")}
                      </span>
                      <button
                        type="button"
                        disabled={!canAddRule}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddRule();
                        }}
                        className="sa-dropdown-action-chip h-7 px-3 disabled:opacity-40 text-[10px] font-black uppercase tracking-wider !text-[var(--text)] shrink-0 cursor-pointer"
                      >
                        {t("add", "Add")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={fromInputRef}
                        type="text"
                        data-1p-ignore="true"
                        value={rangeFrom}
                        onFocus={() => setActiveRuleField("from")}
                        onChange={(e) => {
                          setRangeFrom(e.target.value);
                          setActiveRuleField("from");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAddRule();
                          }
                        }}
                        placeholder={t("ver_target_ph", "Select below or type...")}
                        className={`h-8 px-2.5 rounded-lg glass-surface border text-[11px] font-mono text-[var(--text)] placeholder:font-sans placeholder:text-[var(--subtext)] placeholder:opacity-60 flex-1 min-w-0 outline-none transition-colors ${
                          activeRuleField === "from"
                            ? "!border-[color-mix(in_srgb,var(--text)_28%,transparent)]"
                            : "border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                        }`}
                      />
                      <button
                        type="button"
                        disabled={!canAddRule}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddRule();
                        }}
                        className="sa-dropdown-action-chip h-8 px-3 disabled:opacity-40 text-[10px] font-black uppercase tracking-wider !text-[var(--text)] shrink-0 cursor-pointer"
                      >
                        {t("add", "Add")}
                      </button>
                    </div>
                    <span className="text-[10px] text-[var(--subtext)] opacity-70 px-0.5 truncate">
                      {t("ver_pick_hint", "Click a version below or type")}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Section D — Scrollable Liquid-Glass Version List */}
            <div className="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1">
              {filteredVersions.slice(0, 100).map((ver) => {
                if (isCompatibility && showRuleBuilder) {
                  const isPicked =
                    ver === rangeFrom.trim() ||
                    (ruleMode === "range" && ver === rangeTo.trim());
                  return (
                    <button
                      key={ver}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (ruleMode === "range" && activeRuleField === "from") {
                          setRangeFrom(ver);
                          setActiveRuleField("to");
                          requestAnimationFrame(() => toInputRef.current?.focus());
                        } else if (ruleMode === "range" && activeRuleField === "to") {
                          setRangeTo(ver);
                        } else {
                          setRangeFrom(ver);
                          setActiveRuleField("from");
                          requestAnimationFrame(() => fromInputRef.current?.focus());
                        }
                      }}
                      className={`sa-dropdown-item w-full text-left px-3 py-2 text-xs tracking-wide flex items-center gap-2.5 group cursor-pointer shrink-0 ${
                        isPicked ? "is-selected font-bold" : "font-medium"
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined !text-[15px] shrink-0 transition-colors ${
                          isPicked
                            ? "text-[var(--accent)]"
                            : "text-[var(--subtext)] opacity-60 group-hover:text-[var(--accent)] group-hover:opacity-100"
                        }`}
                      >
                        {isPicked
                          ? t("icon_radio_button_checked", "radio_button_checked")
                          : t("icon_add_circle", "add_circle")}
                      </span>
                      <span className="flex-1 min-w-0 truncate font-mono text-xs leading-snug">
                        {ver}
                      </span>
                      {ver === latestPatch && (
                        <span
                          className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5 !text-[9px] !text-[var(--subtext)] shrink-0 ml-auto`}
                        >
                          <span>{t("latest", "Latest")}</span>
                        </span>
                      )}
                    </button>
                  );
                }

                const isSelected = normalizedSelected.includes(ver);
                return (
                  <button
                    key={ver}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleVersion(ver);
                    }}
                    className={`sa-dropdown-item w-full text-left px-3 py-2 text-xs tracking-wide flex items-center gap-2.5 group cursor-pointer shrink-0 ${
                      isSelected ? "is-selected font-bold" : "font-medium"
                    }`}
                  >
                    <div
                      style={{ borderRadius: "5px" }}
                      className={`w-4 h-4 border flex items-center justify-center transition-colors shrink-0 ${
                        isSelected
                          ? "bg-[color-mix(in_srgb,var(--text)_12%,transparent)] border-[color-mix(in_srgb,var(--text)_34%,transparent)] text-[var(--accent)]"
                          : "bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-[color-mix(in_srgb,var(--text)_22%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_40%,transparent)]"
                      }`}
                    >
                      {isSelected && (
                        <span className="material-symbols-outlined !text-[12px] font-black">
                          {t("icon_check", "check")}
                        </span>
                      )}
                    </div>
                    <span className="flex-1 min-w-0 truncate font-mono text-xs leading-snug">
                      {ver}
                    </span>
                    {ver === latestPatch && (
                      <span
                        className={`${VAULT_CHIP_CLASS} !px-2 !py-0.5 !text-[9px] !text-[var(--subtext)] shrink-0 ml-auto`}
                      >
                        <span>{t("latest", "Latest")}</span>
                      </span>
                    )}
                  </button>
                );
              })}

              {!showRuleBuilder &&
                isCompatibility &&
                query.trim() &&
                !hasExactQueryMatch && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const customToken = query.trim();
                      if (customToken) {
                        const base = normalizedSelected.filter((v) => v !== "ALL");
                        if (!base.includes(customToken)) {
                          onChange([...base, customToken]);
                        }
                      }
                      setQuery("");
                    }}
                    className="sa-dropdown-item w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-[var(--text)] flex items-center gap-2 cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                      {t("icon_add", "add")}
                    </span>
                    <span className="truncate w-full">
                      {t("add", "Add")} &ldquo;{query.trim()}&rdquo;
                    </span>
                  </button>
                )}

              {filteredVersions.length === 0 &&
                (showRuleBuilder ||
                  !isCompatibility ||
                  !query.trim() ||
                  hasExactQueryMatch) && (
                  <div className="p-4 text-center text-xs font-medium text-[var(--subtext)] opacity-70">
                    {t("shared_no_options", "No options found")}
                  </div>
                )}
            </div>
          </div>
        </>,
        document.getElementById("sa-portals") || document.body,
      )
    : null;

  return (
    <div
      className={`relative ${
        className?.includes("w-") ? "" : "w-full"
      } ${className || ""}`}
    >
      <button
        type="button"
        ref={btnRef}
        data-1p-ignore="true"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`w-full flex justify-between items-center gap-2 focus:outline-none relative z-[10] transition-all cursor-pointer ${
          flat
            ? "bg-transparent border-none px-0 py-1 text-xs font-black capitalize tracking-widest text-[var(--text)] opacity-90 hover:opacity-100"
            : isPill
              ? `h-10 px-4 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  isOpen || isActive
                    ? "glass-surface sa-glass-pill-active text-[var(--text)]"
                    : "glass-surface sa-glass-pill-hover text-[var(--text)]"
                }`
              : `${
                  className?.includes("h-") ? "h-full px-4" : "h-11 px-4"
                } rounded-xl text-xs font-bold glass-surface text-[var(--text)] border transition-all ${
                  isOpen || isActive
                    ? "sa-glass-pill-active"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:!border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                }`
        }`}
      >
        <span
          className={`flex-1 text-left truncate min-w-0 flex items-center gap-2 ${
            !hasSelection
              ? "text-[var(--subtext)] opacity-60 font-medium"
              : ""
          }`}
        >
          {isAllSelected && (
            <span className="material-symbols-outlined !text-[16px] text-[var(--success)] shrink-0">
              {t("icon_done_all", "done_all")}
            </span>
          )}
          <span className="truncate">{triggerLabel}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {showCountBadge && (
            <span className="px-1.5 py-0.5 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black leading-none">
              {normalizedSelected.length}
            </span>
          )}
          {hasSelection && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("clear", "Clear")}
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange([]);
                }
              }}
              className="flex items-center justify-center p-0.5 rounded-full text-[var(--subtext)] opacity-75 hover:opacity-100 hover:text-[var(--danger)] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_close", "close")}
              </span>
            </span>
          )}
          <span
            className={`transition-colors shrink-0 flex items-center justify-center ${
              isOpen || isActive
                ? "text-[var(--accent)]"
                : "text-[var(--subtext)] opacity-60"
            }`}
          >
            <span
              className={`material-symbols-outlined ${
                flat ? "!text-[16px]" : "!text-[18px]"
              }`}
            >
              {isOpen
                ? t("icon_expand_less", "expand_less")
                : t("icon_expand_more", "expand_more")}
            </span>
          </span>
        </div>
      </button>
      {popoverMenu}
    </div>
  );
}
export function CustomDatePicker({
  value,
  onChange,
  placeholder,
  className = "",
  flat = false,
}: {
  value: string | null;
  onChange: (date: any) => void;
  placeholder?: string;
  className?: string;
  flat?: boolean;
}) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const instanceId = React.useId();
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<DropdownViewportCoords>({
    top: 0,
    left: 0,
    width: 288,
    maxHeight: 350,
    isRight: false,
    isDropUp: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    window.dispatchEvent(
      new CustomEvent("sa-close-popovers", { detail: { id: instanceId, triggerEl: btnRef.current } }),
    );
    const onOtherOpen = (e: any) => {
      const detailId = typeof e.detail === "object" && e.detail !== null ? e.detail.id : e.detail;
      if (detailId !== instanceId) setIsOpen(false);
    };
    window.addEventListener("sa-close-popovers", onOtherOpen);
    return () => window.removeEventListener("sa-close-popovers", onOtherOpen);
  }, [isOpen, instanceId]);

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = (e?: Event) => {
      if (
        e &&
        e.type === "scroll" &&
        popoverRef.current &&
        e.target instanceof Node &&
        popoverRef.current.contains(e.target)
      ) {
        return;
      }
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setCoords(
          computeDropdownViewportCoords(rect, {
            preferredHeight: 350,
            minWidth: 288,
            alignRight: rect.left >= window.innerWidth / 2,
            gap: 8,
          }),
        );
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const [viewDate, setViewDate] = useState(
    value ? new Date(value) : new Date(),
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const handleSelect = (day: number) => {
    const selected = new Date(year, month, day);
    selected.setMinutes(selected.getMinutes() - selected.getTimezoneOffset());
    onChange(selected.toISOString().split("T")[0]);
    setIsOpen(false);
  };

  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
  });
  const weekdayHeaders = Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, i + 1)
      .toLocaleString(undefined, { weekday: "short" })
      .slice(0, 2),
  );

  return (
    <div className={`relative w-full ${className}`}>
      <button
        type="button"
        ref={btnRef}
        onClick={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        className={`w-full flex justify-start items-center focus:outline-none relative z-[10] transition-all group ${flat ? "bg-transparent border-none px-0 py-1 text-xs font-black capitalize tracking-widest text-[var(--text)] opacity-90 hover:opacity-100" : "h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] text-xs font-bold text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"}`}
      >
        <span
          className={`flex-1 text-left flex items-center h-full overflow-hidden ${flat ? "" : "truncate pr-4"} ${!value ? "text-[var(--subtext)] opacity-75" : "text-[var(--text)]"}`}
        >
          {value
            ? new Date(value).toLocaleDateString()
            : placeholder || t("shared_select_date", "Select Date...") || "Select Date..."}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {value && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="material-symbols-outlined !text-[16px] text-[var(--danger)] opacity-70 hover:opacity-100 transition-all cursor-pointer rounded-full hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] p-0.5"
            >
              {t("icon_close", "close") || "close"}
            </span>
          )}
          <span className="text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors flex items-center justify-center">
            <span className="material-symbols-outlined !text-[18px]">
              {isOpen
                ? t("icon_expand_less", "expand_less") || "expand_less"
                : t("icon_calendar_month", "calendar_month") || "calendar_month"}
            </span>
          </span>
        </div>
      </button>
      {isOpen &&
        createPortal(
          <>
            <div
              className="!fixed inset-0 pointer-events-auto"
              style={{ zIndex: 100000000 }}
              onClick={() => setIsOpen(false)}
            />
            <div
              ref={popoverRef}
              onClick={(e) => e.stopPropagation()}
              className="!fixed pointer-events-auto glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl animate-in fade-in zoom-in-95 duration-150 w-72 overflow-hidden flex flex-col text-[var(--text)]"
              style={{
                zIndex: 100000001,
                top: coords.isDropUp ? "auto" : coords.top,
                bottom: coords.isDropUp
                  ? window.innerHeight - coords.top
                  : "auto",
                left: coords.left,
                maxHeight: coords.maxHeight,
                transition: "none",
                "--glass-x": `${Math.round(coords.left)}px`,
                "--glass-y": `${Math.round(coords.top)}px`,
              } as React.CSSProperties}
            >
              <div className="p-4 overflow-y-auto custom-scrollbar max-h-full">
                <div className="flex justify-between items-center mb-3 pb-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  <button
                    type="button"
                    onClick={() => setViewDate(new Date(year, month - 1, 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                  >
                    <span className="material-symbols-outlined !text-[18px]">
                      {t("icon_chevron_left", "chevron_left") || "chevron_left"}
                    </span>
                  </button>
                  <div className="text-xs font-extrabold capitalize tracking-wide text-[var(--text)]">
                    {monthLabel} {year}
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewDate(new Date(year, month + 1, 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                  >
                    <span className="material-symbols-outlined !text-[18px]">
                      {t("icon_chevron_right", "chevron_right") || "chevron_right"}
                    </span>
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
                  {weekdayHeaders.map((d, idx) => (
                    <div
                      key={`${d}-${idx}`}
                      className="text-[10px] font-bold text-[var(--subtext)] opacity-70 uppercase py-1"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {blanks.map((b) => (
                    <div key={`blank-${b}`} className="h-8 w-8 mx-auto" />
                  ))}
                  {days.map((d) => {
                    const isSelected =
                      value &&
                      new Date(value).getDate() === d &&
                      new Date(value).getMonth() === month &&
                      new Date(value).getFullYear() === year;
                    const isToday =
                      new Date().getDate() === d &&
                      new Date().getMonth() === month &&
                      new Date().getFullYear() === year;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleSelect(d)}
                        className={`sa-dropdown-item h-8 w-8 mx-auto flex items-center justify-center text-xs rounded-lg transition-all ${
                          isSelected
                            ? "is-selected font-extrabold"
                            : isToday
                              ? "text-[var(--accent)] font-bold"
                              : "font-semibold"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>,
          document.getElementById("sa-portals") || document.body,
        )}
    </div>
  );
}
export function ModSearchDropdown({
  modList,
  onSelect,
  placeholder,
  selectedItem,
  onClear,
  dropUp,
  className,
}: any) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((s) => s.activeGameSchema);
  const [isOpen, setIsOpen] = useState(false);
  const instanceId = React.useId();
  const [query, setQuery] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<DropdownViewportCoords>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 260,
    isRight: false,
    isDropUp: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    window.dispatchEvent(
      new CustomEvent("sa-close-popovers", { detail: { id: instanceId, triggerEl: inputRef.current } }),
    );
    const onOtherOpen = (e: any) => {
      const detailId = typeof e.detail === "object" && e.detail !== null ? e.detail.id : e.detail;
      if (detailId !== instanceId) setIsOpen(false);
    };
    window.addEventListener("sa-close-popovers", onOtherOpen);
    return () => window.removeEventListener("sa-close-popovers", onOtherOpen);
  }, [isOpen, instanceId]);

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = (e?: Event) => {
      if (
        e &&
        e.type === "scroll" &&
        popoverRef.current &&
        e.target instanceof Node &&
        popoverRef.current.contains(e.target)
      ) {
        return;
      }
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setCoords(
          computeDropdownViewportCoords(rect, {
            preferredHeight: 260,
            minWidth: 260,
            forceDropUp: dropUp,
            gap: 8,
          }),
        );
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, dropUp]);

  const results = React.useMemo(() => {
    if (!isOpen || selectedItem || !Array.isArray(modList)) return [];
    const q = query.trim().toLowerCase();
    const out: any[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < modList.length; i++) {
      const m = modList[i];
      if (!m) continue;
      if (
        q &&
        !String(m.name || "").toLowerCase().includes(q) &&
        !String(m.displayName || "").toLowerCase().includes(q)
      ) {
        continue;
      }
      const key = String(m.id || m.hash || m.name || i);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
      if (out.length >= 25) break;
    }
    return out;
  }, [isOpen, selectedItem, modList, query]);

  return (
    <div className="relative w-full">
      <div className="relative z-[10]">
        <input
          ref={inputRef}
          type="text"
          value={
            selectedItem
              ? selectedItem.displayName ||
                formatDisplayName(selectedItem.name, t, activeGameSchema)
              : query
          }
          onChange={(e) => {
            if (!selectedItem) setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (!selectedItem) setIsOpen(true);
          }}
          placeholder={placeholder}
          readOnly={!!selectedItem}
          className={
            className ||
            "w-full h-11 glass-surface hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] rounded-xl px-4 text-[var(--text)] text-xs font-bold capitalize tracking-wide focus:outline-none focus:border-[color-mix(in_srgb,var(--text)_34%,transparent)] transition-all relative"
          }
        />
        {selectedItem ? (
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold flex items-center justify-center"
            onClick={onClear}
          >
            <span className="material-symbols-outlined !text-[18px]">
              {t("icon_close", "close") || "close"}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 flex items-center justify-center"
            onClick={() => setIsOpen(!isOpen)}
          >
            <span className="material-symbols-outlined !text-[18px]">
              {isOpen
                ? t("icon_expand_less", "expand_less") || "expand_less"
                : t("icon_expand_more", "expand_more") || "expand_more"}
            </span>
          </button>
        )}
      </div>
      {isOpen &&
        !selectedItem &&
        (() => {
          const portalRoot =
            document.getElementById("sa-portals") || document.body;
          return createPortal(
            <>
              <div
                className="!fixed inset-0 pointer-events-auto"
                style={{ zIndex: 100000000 }}
                onClick={() => setIsOpen(false)}
              />
              <div
                ref={popoverRef}
                className="!fixed glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl pointer-events-auto overflow-hidden flex flex-col text-[var(--text)] animate-in fade-in zoom-in-95 duration-150"
                style={{
                  zIndex: 100000001,
                  top: coords.isDropUp ? "auto" : coords.top,
                  bottom: coords.isDropUp ? window.innerHeight - coords.top : "auto",
                  left: coords.left,
                  width: coords.width,
                  maxHeight: coords.maxHeight,
                  "--glass-x": `${Math.round(coords.left)}px`,
                  "--glass-y": `${Math.round(coords.top)}px`,
                } as React.CSSProperties}
              >
                <div className="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col p-1.5 gap-1">
                  {results.map((m: any, idx: number) => {
                    const rawName = String(m.name || "").trim();
                    const cleanTitle =
                      m.displayName || formatDisplayName(rawName, t, activeGameSchema);
                    const extLabel =
                      m.file_extension ||
                      (rawName.includes(".") ? getFileLabel(rawName, activeGameSchema) : "");
                    const verLabel = m.version_label || m.version;
                    const authorLabel = m.master_author || m.author;
                    const rawId = String(m.id || m.dbId || m.hash || "").trim();
                    const subMeta = verLabel
                      ? `${t("shared_versions_prefix", "Version(s):")} ${verLabel}`
                      : authorLabel
                        ? authorLabel
                        : m.created_at
                          ? `${t("shared_created_prefix", "Created:")} ${new Date(m.created_at).toLocaleDateString()}`
                          : rawId
                            ? `${t("landing_id_prefix", "ID: ")}${rawId.substring(0, 8).toUpperCase()}`
                            : rawName.split(/[\\/]/).pop() || "";
                    return (
                      <button
                        key={`${m.hash || m.name}-${idx}`}
                        type="button"
                        onClick={() => {
                          onSelect(m);
                          setQuery("");
                          setIsOpen(false);
                        }}
                        className="sa-dropdown-item w-full text-left px-3 py-2 flex flex-col gap-0.5 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="text-xs font-bold text-[var(--text)] truncate">
                            {cleanTitle}
                          </span>
                          {extLabel && extLabel !== "UNKNOWN" && (
                            <span className="px-1.5 py-0.5 rounded bg-transparent text-[9px] font-mono opacity-80 uppercase border border-[color-mix(in_srgb,var(--text)_18%,transparent)] shrink-0">
                              {extLabel}
                            </span>
                          )}
                        </div>
                        {subMeta && (
                          <span className="text-[10px] font-mono text-[var(--subtext)] opacity-70 truncate">
                            {subMeta}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {results.length === 0 && (
                    <div className="p-4 text-center text-xs text-[var(--subtext)] font-semibold capitalize opacity-70">
                      {t("shared_no_signatures", "No Signatures Found")}
                    </div>
                  )}
                </div>
              </div>
            </>,
            portalRoot,
          );
        })()}
    </div>
  );
}
export function CustomComplianceDropdown({
  value,
  onChange,
  minTier = 0,
  maxTier = 5,
}: {
  value: number;
  onChange: (val: number) => void;
  minTier?: number;
  maxTier?: number;
}) {
  const { t } = useLexicon();
  const allOptions = [
    { id: 0, label: t("tier_0_label", "Clean / Safe (T0)") || "Clean / Safe (Tier 0)" },
    { id: 1, label: t("tier_1_label", "Explicit Content (T1)") || "Explicit Content (Tier 1)" },
    { id: 2, label: t("tier_2_label", "Illicit / Substance (T2)") || "Illicit / Substance (Tier 2)" },
    { id: 3, label: t("tier_3_label", "Extreme Violence (T3)") || "Extreme Violence (Tier 3)" },
    { id: 4, label: t("tier_4_label", "Taboo / Sensitive (T4)") || "Taboo / Sensitive (Tier 4)" },
    { id: 5, label: t("tier_5_label", "Malware (T5)") || "Malware (Tier 5)" },
  ];

  const options = allOptions.filter((opt) => opt.id >= minTier && opt.id <= maxTier);

  return (
    <div className="w-full">
      <CustomDropdown
        value={value}
        options={options}
        onChange={(v: number[]) => onChange(v[0])}
        placeholder={t("shared_select_compliance", "Select Compliance Tier") || "Select Compliance Tier"}
        disableTint={true}
      />
    </div>
  );
}
export function CustomClassificationDropdown({
  value,
  onChange,
  className,
  buttonClassName,
  flat,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  buttonClassName?: string;
  flat?: boolean;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const schemaCats = activeGameSchema?.mod_categories || [];
  const hasUnknown = schemaCats.some(
    (c: any) => String(c.id).toLowerCase() === "unknown"
  );
  const options = [
    ...(!hasUnknown
      ? [{ id: "Unknown", label: t("unknown", "Unknown"), icon: t("icon_help", "help") }]
      : []),
    ...schemaCats.map((c: any) => {
      const fallbackLabel = c.label || c.name || c.id;
      const resolvedIcon = c.icon
        ? t(`icon_${c.icon}`, c.icon)
        : c.icon_key
          ? t(c.icon_key, "")
          : undefined;
      return {
        id: c.id,
        label: c.lexicon_key ? t(c.lexicon_key, fallbackLabel) : fallbackLabel,
        icon: resolvedIcon || undefined,
      };
    }),
  ];

  return (
    <div className="w-full">
      <CustomDropdown
        value={value}
        options={options}
        onChange={(v: string[]) => onChange(v[0])}
        placeholder={t("shared_select_classification", "Select Classification") || "Select Classification"}
        disableTint={true}
        className={className}
        buttonClassName={buttonClassName}
        flat={flat}
      />
    </div>
  );
}
export function CustomTierDropdown({ value, onChange }: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const instanceId = React.useId();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<DropdownViewportCoords>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 200,
    isRight: false,
    isDropUp: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    window.dispatchEvent(
      new CustomEvent("sa-close-popovers", { detail: { id: instanceId, triggerEl: containerRef.current } }),
    );
    const onOtherOpen = (e: any) => {
      const detailId = typeof e.detail === "object" && e.detail !== null ? e.detail.id : e.detail;
      if (detailId !== instanceId) setIsOpen(false);
    };
    window.addEventListener("sa-close-popovers", onOtherOpen);
    return () => window.removeEventListener("sa-close-popovers", onOtherOpen);
  }, [isOpen, instanceId]);

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = (e?: Event) => {
      if (
        e &&
        e.type === "scroll" &&
        popoverRef.current &&
        e.target instanceof Node &&
        popoverRef.current.contains(e.target)
      ) {
        return;
      }
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCoords(
          computeDropdownViewportCoords(rect, {
            preferredHeight: 200,
            minWidth: 260,
            gap: 8,
          }),
        );
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const options = [
    {
      id: 4,
      label: t("tier4", "Severity 4: Fatal Collision") || "Severity 4: Fatal Collision",
      icon: t("icon_error", "error") || "error",
      color: "theme-text-danger",
      activeBg:
        "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] border border-[color-mix(in_srgb,var(--danger)_38%,transparent)]",
    },
    {
      id: 3,
      label: t("tier3", "Severity 3: Tuning Overlap") || "Severity 3: Tuning Overlap",
      icon: t("icon_warning", "warning") || "warning",
      color: "theme-text-warning",
      activeBg:
        "bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] border border-[color-mix(in_srgb,var(--warning)_38%,transparent)]",
    },
  ];

  const selected = options.find((o) => o.id === value) || options[0];

  return (
    <div
      className={`relative w-full shrink-0 ${isOpen ? "z-[6000]" : ""}`}
      ref={containerRef}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-11 glass-surface hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl px-4 text-xs font-bold capitalize tracking-wide focus:outline-none flex justify-start items-center gap-2 transition-all ${selected.color}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="material-symbols-outlined !text-[16px] shrink-0">
            {selected.icon}
          </span>
          <span className="truncate whitespace-nowrap text-left">
            {selected.label}
          </span>
        </div>
        <span className="transition-colors shrink-0 flex items-center justify-center text-[var(--subtext)] opacity-60 ml-auto">
          <span className="material-symbols-outlined !text-[18px]">
            {isOpen
              ? t("icon_expand_less", "expand_less") || "expand_less"
              : t("icon_expand_more", "expand_more") || "expand_more"}
          </span>
        </span>
      </button>

      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 pointer-events-auto"
              style={{ zIndex: 100000000 }}
              onClick={() => setIsOpen(false)}
            />
            <div
              ref={popoverRef}
              className="!fixed pointer-events-auto glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col p-1.5 gap-1 overflow-hidden text-[var(--text)]"
              style={{
                zIndex: 100000001,
                top: coords.isDropUp ? "auto" : coords.top,
                bottom: coords.isDropUp ? window.innerHeight - coords.top : "auto",
                left: coords.left,
                width: coords.width,
                maxHeight: coords.maxHeight,
                transition: "none",
                "--glass-x": `${Math.round(coords.left)}px`,
                "--glass-y": `${Math.round(coords.top)}px`,
              } as React.CSSProperties}
            >
              <div className="relative z-10 flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                    }}
                    className={`sa-dropdown-item w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center gap-2.5 ${value === opt.id ? "is-selected " + opt.color : ""}`}
                  >
                    <span className={`material-symbols-outlined !text-[16px] shrink-0 ${opt.color}`}>
                      {opt.icon}
                    </span>
                    <span className="text-xs font-semibold capitalize tracking-wide truncate">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.getElementById("sa-portals") || document.body,
        )}
    </div>
  );
}

