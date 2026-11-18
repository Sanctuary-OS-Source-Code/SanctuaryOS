import { useLexicon } from "../../LexiconContext";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SidePanelContext } from "../layout";
import { HoverTooltip } from "../alerts";
import { computeDropdownViewportCoords, type DropdownViewportCoords } from "./typesAndPosition";

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

