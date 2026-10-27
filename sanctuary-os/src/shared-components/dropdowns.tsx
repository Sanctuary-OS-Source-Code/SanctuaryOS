import { useStore } from '../store';
import { useLexicon } from '../LexiconContext';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { SidePanelContext } from "./layout";
export function CustomDropdown({
  value,
  selectedValues: selectedValuesProp,
  onChange,
  options,
  allowCustom,
  searchable,
  multiSelect: multiSelectProp,
  allowMultiSelect,
  disableTint,
  placeholder,
  className,
  buttonClassName,
  flat,
  variant = "default",
}: any) {
  const { t } = useLexicon();
  const multiSelect = multiSelectProp ?? allowMultiSelect;
  const effectiveValue = value !== undefined ? value : selectedValuesProp;
  const [isOpen, setIsOpen] = useState(false);
  const instanceId = React.useId();
  const [query, setQuery] = useState("");
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 0,
    isRight: false,
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
    const updatePosition = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const shouldDropUp = rect.bottom + 260 > window.innerHeight && rect.top > 260;
        const menuWidth = Math.min(Math.max(rect.width, 160), window.innerWidth - 24);
        const clampedLeft = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
        setCoords({
          top: shouldDropUp ? rect.top - 6 : rect.bottom + 6,
          left: clampedLeft,
          width: menuWidth,
          isRight: false,
          isDropUp: shouldDropUp,
        } as any);
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

  const getSelectedLabel = () => {
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

  const showSearch = Boolean(
    searchable && (allowCustom || (options && options.length > 6)),
  );

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
            onClick={(e) => e.stopPropagation()}
            className="!fixed pointer-events-auto glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl animate-in fade-in zoom-in-95 duration-150 max-h-72 overflow-hidden flex flex-col text-[var(--text)]"
            style={{
              zIndex: 100000001,
              top: (coords as any).isDropUp ? "auto" : coords.top,
              bottom: (coords as any).isDropUp
                ? window.innerHeight - coords.top + 8
                : "auto",
              left: coords.left,
              transition: "none",
              width: coords.width || 200,
              maxWidth: "calc(100vw - 24px)",
              "--glass-x": `${Math.round(coords.left)}px`,
              "--glass-y": `${Math.round(coords.top)}px`,
            } as React.CSSProperties}
          >
            {(showSearch || (multiSelect && options && options.length > 1)) && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] shrink-0 z-10">
                {showSearch ? (
                  <div className="sa-dropdown-search px-2.5 h-7 flex items-center gap-1.5 flex-1 min-w-0 transition-colors">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] opacity-85 shrink-0">
                      {t("icon_search", "search")}
                    </span>
                    <input
                      type="text"
                      data-1p-ignore="true"
                      autoFocus
                      placeholder={t("search", "Search...")}
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
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(options.map((o: any) => String(o.id)));
                      }}
                      className="sa-dropdown-action-chip px-2 h-6 text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      {t("all", "All")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange([]);
                      }}
                      className="sa-dropdown-action-chip px-2 h-6 text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      {t("clear", "Clear")}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-1">
              {(options || [])
                .filter((opt: any) => {
                  if (!showSearch || !query) return true;
                  const searchTarget =
                    opt.searchText !== undefined
                      ? opt.searchText
                      : typeof opt.label === "string"
                        ? opt.label
                        : "";
                  return searchTarget
                    .toLowerCase()
                    .includes(query.toLowerCase());
                })
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
                      className={`sa-dropdown-item w-full text-left px-2.5 py-2 text-xs tracking-wide flex items-center gap-2.5 group cursor-pointer ${
                        isSelected ? "is-selected font-bold" : "font-medium"
                      }`}
                    >
                      {multiSelect && (
                        <div
                          style={{ borderRadius: "5px" }}
                          className={`w-4 h-4 border flex items-center justify-center transition-colors shrink-0 ${
                            isSelected
                              ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border-[color-mix(in_srgb,var(--accent)_65%,transparent)] text-[var(--accent)]"
                              : "bg-transparent border-[color-mix(in_srgb,var(--text)_22%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_40%,transparent)]"
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
                            isSelected
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)] opacity-75 group-hover:text-[var(--text)]"
                          }`}
                        >
                          {opt.icon}
                        </span>
                      )}
                      <span className="flex-1 truncate">{opt.label}</span>
                      {isSelected && !multiSelect && (
                        <span className="material-symbols-outlined !text-[15px] shrink-0 text-[var(--accent)]">
                          {t("icon_check", "check")}
                        </span>
                      )}
                    </button>
                  );
                })}
              {searchable &&
                query &&
                (options || []).filter((opt: any) => {
                  const searchTarget =
                    opt.searchText !== undefined
                      ? opt.searchText
                      : typeof opt.label === "string"
                        ? opt.label
                        : "";
                  return searchTarget
                    .toLowerCase()
                    .includes(query.toLowerCase());
                }).length === 0 &&
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
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[15px]">
                      {t("icon_add", "add")}
                    </span>
                    <span className="truncate w-full">
                      {t("ql_add", "Add")} &ldquo;{query}&rdquo;
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
      className={`relative ${className?.includes("w-") ? "" : "w-full"} ${className || ""}`}
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
                    ? "glass-surface sa-glass-active text-[var(--text)]"
                    : "glass-surface text-[var(--text)]"
                }`
              : `${
                  className?.includes("h-") ? "h-full px-4" : "h-11 px-4"
                } rounded-xl text-xs font-bold ${
                  isOpen || isActive
                    ? "glass-surface sa-glass-active text-[var(--text)]"
                    : "glass-surface text-[var(--text)]"
                }`
        } ${buttonClassName || ""}`}
      >
        <span
          className={`flex-1 text-left truncate min-w-0 ${
            !hasSelection ? "text-[var(--subtext)] opacity-60 font-medium" : ""
          }`}
        >
          {getSelectedLabel()}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {multiSelect && selectedValues.length > 1 && (
            <span className="px-1.5 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] text-[9px] font-black leading-none">
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
      </button>
      {dropdownMenu}
    </div>
  );
}
export function GameVersionMultiSelect({
  selectedVersions,
  onChange,
  variant = "default",
  dropUp = false,
}: {
  selectedVersions: string[];
  onChange: (v: string[]) => void;
  variant?: "default" | "pill";
  dropUp?: boolean;
}) {
  selectedVersions = Array.isArray(selectedVersions)
    ? selectedVersions
    : typeof selectedVersions === "string"
      ? (selectedVersions as string).split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
  const { t } = useLexicon();
  const [query, setQuery] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState({});

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => forceUpdate({});
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    async function fetchVersions() {
      if (
        !navigator.onLine ||
        localStorage.getItem("sanctuary_local_only") === "true"
      )
        return;
      const { data } = await supabase
        .from("game_versions")
        .select("version")
        .order("version", { ascending: false });
      if (data) {
        setVersions(data);
      }
    }
    fetchVersions();
  }, []);

  const toggleVersion = (v: string) => {
    if (selectedVersions.includes(v)) {
      const newVersions = selectedVersions.filter((ver) => ver !== v);
      onChange(newVersions);
    } else {
      const newVersions = [...selectedVersions.filter((ver) => ver !== "ALL"), v];
      onChange(newVersions);
    }
  };

  const applyRangeChange = (fromVal: string, toVal: string) => {
    setRangeFrom(fromVal);
    setRangeTo(toVal);
    const f = fromVal.trim();
    const to = toVal.trim();
    if (!f || !to) return;
    const withoutOldRanges = selectedVersions.filter(
      (ver) => ver !== "ALL" && !ver.includes(" - ")
    );
    if (f === to) {
      if (!withoutOldRanges.includes(f)) onChange([...withoutOldRanges, f]);
      return;
    }
    const rangeTag = `${f} - ${to}`;
    onChange([...withoutOldRanges, rangeTag]);
  };

  const latestPatch = versions[0]?.version;

  const filtered = versions
    .filter((v) => v.version && v.version.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 40);
  const rect = containerRef.current?.getBoundingClientRect();
  const popWidth = rect ? Math.min(Math.max(rect.width, 420), window.innerWidth - 24) : 420;
  const clampedLeft = rect
    ? Math.max(12, Math.min(rect.left, window.innerWidth - popWidth - 12))
    : 12;
  const shouldDropUp =
    dropUp || (rect ? window.innerHeight - rect.bottom < 360 && rect.top > 320 : false);

  const summaryLabel =
    selectedVersions.length === 0
      ? t("shared_search_versions", "Select game versions...")
      : selectedVersions.includes("ALL")
        ? t("filter_all_versions", "All Versions")
        : selectedVersions.join(", ");

  return (
    <div
      className={`relative ${variant === "pill" ? "h-full flex items-center" : "w-full"}`}
      ref={containerRef}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={
          variant === "pill"
            ? "flex items-center justify-between gap-2 bg-transparent text-[11px] font-bold text-[var(--text)] tracking-wider outline-none min-w-[160px] px-2 h-full cursor-pointer"
            : `w-full h-11 px-4 rounded-xl glass-surface ${
                isOpen ? "sa-glass-active" : ""
              } text-xs font-bold text-[var(--text)] flex items-center justify-between gap-2 transition-all cursor-pointer`
        }
      >
        <span
          className={`flex-1 text-left truncate ${
            selectedVersions.length === 0 ? "text-[var(--subtext)] opacity-60" : "text-[var(--text)]"
          }`}
        >
          {variant === "pill" && selectedVersions.length > 0
            ? `${t("versions", "Versions")} (${selectedVersions.length})`
            : summaryLabel}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {selectedVersions.length > 0 && variant !== "pill" && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setRangeFrom("");
                setRangeTo("");
                onChange([]);
              }}
              className="material-symbols-outlined !text-[15px] text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer"
            >
              {t("icon_close", "close")}
            </span>
          )}
          <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)] opacity-60">
            {isOpen ? t("icon_expand_less", "expand_less") : t("icon_expand_more", "expand_more")}
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
              onClick={(e) => e.stopPropagation()}
              className="!fixed pointer-events-auto glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col text-[var(--text)] overflow-hidden"
              style={{
                zIndex: 100000001,
                top: shouldDropUp ? "auto" : (rect ? rect.bottom + 6 : 0),
                bottom: shouldDropUp ? (rect ? window.innerHeight - rect.top + 6 : 0) : "auto",
                left: clampedLeft,
                width: popWidth,
                maxWidth: "calc(100vw - 24px)",
                "--glass-x": `${Math.round(clampedLeft)}px`,
                "--glass-y": `${Math.round(rect ? rect.bottom + 6 : 0)}px`,
              } as React.CSSProperties}
            >
              {/* Search & Quick Actions Row */}
              <div className="flex items-center justify-between gap-2 p-2 pb-1.5 shrink-0">
                <div className="sa-dropdown-search flex items-center flex-1 min-w-0 px-3 h-8">
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] opacity-85 mr-2 shrink-0">
                    {t("icon_search", "search")}
                  </span>
                  <input
                    autoFocus
                    placeholder={t("shared_search_versions", "Search game versions...")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-transparent border-none text-xs font-semibold focus:outline-none text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-55"
                  />
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {latestPatch && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedVersions.includes(latestPatch)) {
                          onChange([...selectedVersions.filter((ver) => ver !== "ALL"), latestPatch]);
                        }
                      }}
                      className="sa-dropdown-action-chip h-8 px-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      {t("ver_btn_latest", "Latest")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange(["ALL"])}
                    className="sa-dropdown-action-chip h-8 px-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                  >
                    {t("filter_all_versions", "All")}
                  </button>
                  {selectedVersions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRangeFrom("");
                        setRangeTo("");
                        onChange([]);
                      }}
                      className="sa-dropdown-action-chip h-8 px-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      {t("clear", "Clear")}
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Patch Range Row (always visible above list, auto-applies) */}
              {versions.length > 1 && (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 py-1.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] shrink-0">
                  <CustomDropdown
                    disableTint={true}
                    className="h-9"
                    buttonClassName="!h-9 !px-3 !text-xs !rounded-xl"
                    placeholder={t("ver_range_from", "From Patch")}
                    value={rangeFrom}
                    onChange={(val: string[]) => applyRangeChange(val[0] || "", rangeTo || latestPatch || "")}
                    options={[
                      { id: "", label: t("ver_range_from", "From Patch") },
                      ...versions.map((v) => ({ id: v.version, label: v.version })),
                    ]}
                  />
                  <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)] opacity-60 px-0.5">
                    {t("icon_arrow_forward", "arrow_forward")}
                  </span>
                  <CustomDropdown
                    disableTint={true}
                    className="h-9"
                    buttonClassName="!h-9 !px-3 !text-xs !rounded-xl"
                    placeholder={t("ver_range_to", "To Patch")}
                    value={rangeTo}
                    onChange={(val: string[]) => applyRangeChange(rangeFrom || versions[Math.min(5, versions.length - 1)]?.version || "", val[0] || "")}
                    options={[
                      { id: "", label: t("ver_range_to", "To Patch") },
                      ...versions.map((v) => ({ id: v.version, label: v.version })),
                    ]}
                  />
                </div>
              )}

              {/* Always-Visible Checkable Version List */}
              <div className="max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-1 p-2 pt-1">
                {filtered.map((v) => {
                  const isSelected = selectedVersions.includes(v.version);
                  return (
                    <button
                      key={v.version}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        toggleVersion(v.version);
                      }}
                      className={`sa-dropdown-item w-full text-left px-3 py-2 text-xs tracking-wide flex items-center gap-2.5 group cursor-pointer ${
                        isSelected ? "is-selected font-bold" : "font-semibold"
                      }`}
                    >
                      <div
                        style={{ borderRadius: "5px" }}
                        className={`w-4 h-4 border flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border-[color-mix(in_srgb,var(--accent)_65%,transparent)] text-[var(--accent)]"
                            : "bg-transparent border-[color-mix(in_srgb,var(--text)_22%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_40%,transparent)]"
                        }`}
                      >
                        {isSelected && (
                          <span className="material-symbols-outlined !text-[12px] font-bold">
                            {t("icon_check", "check")}
                          </span>
                        )}
                      </div>
                      <span className="flex-1 truncate">{v.version}</span>
                    </button>
                  );
                })}
                {query && !versions.some((v) => v.version === query) && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      toggleVersion(query);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-xs font-semibold text-[var(--accent)] cursor-pointer transition-colors"
                  >
                    + {t("ql_add", "Add")} "{query}"
                  </button>
                )}
              </div>
            </div>
          </>,
          document.getElementById("sa-portals") || document.body
        )}
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
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
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
    const updatePosition = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldDropUp = spaceBelow < 320 && rect.top > 320;
        setCoords({
          top: shouldDropUp ? rect.top : rect.bottom,
          left: rect.left >= window.innerWidth / 2 ? rect.right : rect.left,
          isRight: rect.left >= window.innerWidth / 2,
          isDropUp: shouldDropUp,
        });
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
        className={`w-full flex justify-start items-center focus:outline-none relative z-[10] transition-all group ${flat ? "bg-transparent border-none px-0 py-1 text-xs font-black capitalize tracking-widest text-[var(--text)] opacity-90 hover:opacity-100" : "h-11 px-4 rounded-xl glass-surface text-xs font-bold text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"}`}
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
              className="!fixed pointer-events-none"
              style={{
                zIndex: 100000001,
                top: coords.isDropUp ? undefined : coords.top,
                bottom: coords.isDropUp
                  ? window.innerHeight - coords.top
                  : undefined,
                left: coords.isRight ? undefined : coords.left,
                right: coords.isRight
                  ? window.innerWidth - coords.left
                  : undefined,
                transition: "none",
              }}
            >
              <div
                className={`!absolute ${coords.isDropUp ? "bottom-0 mb-2" : "top-0 mt-2"} ${coords.isRight ? "right-0" : "left-0"} pointer-events-auto glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl animate-in fade-in zoom-in-95 duration-150 p-4 w-72 text-[var(--text)]`}
                style={{
                  "--glass-x": `${Math.round(coords.left)}px`,
                  "--glass-y": `${Math.round(coords.top)}px`,
                } as React.CSSProperties}
              >
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
  const [isOpen, setIsOpen] = useState(false);
  const instanceId = React.useId();
  const [query, setQuery] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 0,
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
    const updatePosition = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldDropUp = dropUp !== undefined ? dropUp : (spaceBelow < 280 && rect.top > 260);
        const menuWidth = Math.min(Math.max(rect.width, 260), window.innerWidth - 24);
        const clampedLeft = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
        setCoords({
          top: shouldDropUp
            ? window.innerHeight - rect.top + 8
            : rect.bottom + 8,
          left: clampedLeft,
          width: menuWidth,
          isDropUp: shouldDropUp,
        });
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
      if (out.length >= 10) break;
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
            selectedItem ? selectedItem.displayName || selectedItem.name : query
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
            "w-full h-11 glass-surface hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl px-4 text-[var(--text)] text-xs font-bold capitalize tracking-wide focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all relative"
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
                className="!fixed glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl pointer-events-auto max-h-60 overflow-hidden flex flex-col text-[var(--text)] animate-in fade-in zoom-in-95 duration-150"
                style={{
                  zIndex: 100000001,
                  top: coords.isDropUp ? undefined : coords.top,
                  bottom: coords.isDropUp ? coords.top : undefined,
                  left: coords.left,
                  width: coords.width,
                  "--glass-x": `${Math.round(coords.left)}px`,
                  "--glass-y": `${Math.round(coords.top)}px`,
                } as React.CSSProperties}
              >
                <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar flex flex-col p-1.5 gap-1">
                  {results.map((m: any, idx: number) => (
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
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text)] capitalize">
                          {m.displayName || m.name.split("/").pop()}
                        </span>
                        {m.file_extension && (
                          <span className="px-1.5 py-0.5 rounded bg-transparent text-[9px] font-mono opacity-80 capitalize border border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
                            {m.file_extension}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--subtext)] opacity-70">
                        {m.version_label
                          ? `${t("shared_versions_prefix", "Version(s):") || "Version(s):"} ${m.version_label}`
                          : m.master_author ||
                            m.author ||
                            (m.created_at
                              ? `${t("shared_created_prefix", "Created:") || "Created:"} ${new Date(m.created_at).toLocaleDateString()}`
                              : `${t("landing_id_prefix", "ID: ") || "ID:"} ${m.id?.substring(0, 8).toUpperCase()}`)}
                      </span>
                    </button>
                  ))}
                  {results.length === 0 && (
                    <div className="p-4 text-center text-xs text-[var(--subtext)] font-semibold capitalize opacity-70">
                      {t("shared_no_signatures", "No Signatures Found") || "No matching mods found"}
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
  maxTier = 5,
}: {
  value: number;
  onChange: (val: number) => void;
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

  const options = allOptions.filter((opt) => opt.id <= maxTier);

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
  const options = [
    { id: "Unknown", label: t("unknown", "Unknown") || "Unknown" },
    ...(activeGameSchema?.mod_categories || []).map((c: any) => ({
      id: c.id,
      label: t(c.lexicon_key) || c.id,
    })),
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
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 0,
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
    const updatePosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldDropUp = spaceBelow < 200 && rect.top > 200;
        const menuWidth = Math.min(Math.max(rect.width, 260), window.innerWidth - 24);
        const clampedLeft = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
        setCoords({
          top: shouldDropUp
            ? window.innerHeight - rect.top + 8
            : rect.bottom + 8,
          left: clampedLeft,
          width: menuWidth,
          isDropUp: shouldDropUp,
        });
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
              className="fixed pointer-events-none"
              style={{
                zIndex: 100000001,
                top: coords.isDropUp ? undefined : coords.top,
                bottom: coords.isDropUp ? coords.top : undefined,
                left: coords.left,
                width: coords.width,
                transition: "none",
              }}
            >
              <div
                className="absolute top-0 left-0 w-full pointer-events-auto mt-1.5 glass-panel portal-glass-fix sa-dropdown-popover rounded-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col p-1.5 gap-1"
                style={{
                  "--glass-x": `${Math.round(coords.left)}px`,
                  "--glass-y": `${Math.round(coords.top)}px`,
                } as React.CSSProperties}
              >
                <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-1">
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
            </div>
          </>,
          document.getElementById("sa-portals") || document.body,
        )}
    </div>
  );
}

