import { useStore } from '../store';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useModalStore } from '../store/modalStore';
import { useTooltipStore } from '../store/tooltipStore';
import { supabase } from '../supabase';
import { UniversalCard } from '../components/universal/UniversalCard';

import { SidePanelContext } from "./layout";
export function CustomDropdown({
  value,
  onChange,
  options,
  allowCustom,
  searchable,
  multiSelect,
  disableTint,
  placeholder,
  className,
  buttonClassName,
  flat,
  variant = "default",
}: any) {
  const { t } = useLexicon();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 0,
    isRight: false,
  });
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const shouldDropUp = rect.bottom + 200 > window.innerHeight;
        setCoords({
          top: shouldDropUp ? rect.top - 4 : rect.bottom + 4,
          left: rect.left >= window.innerWidth / 2 ? rect.right : rect.left,
          width: rect.width,
          isRight: rect.left >= window.innerWidth / 2,
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
      if (selectedValues.length === 0) return placeholder || "Select...";
      if (selectedValues.length === 1)
        return (
          options.find((o: any) => String(o.id) === String(selectedValues[0]))
            ?.label || selectedValues[0]
        );
      return `${selectedValues.length} Selected`;
    }
    const selected =
      options.find((o: any) => String(o.id) === String(value)) ||
      options.find((o: any) => selectedValues.includes(o.id));
    if (allowCustom && !selected && value) return value;
    return selected?.label || placeholder || "Select...";
  };

  const handleSelect = (id: string) => {
    if (multiSelect) {
      const newVals = selectedValues.includes(id)
        ? selectedValues.filter((v: any) => v !== id)
        : [...selectedValues, id];
      onChange(newVals);
    } else {
      onChange([id]);
      setIsOpen(false);
    }
  };

  const isInsideSidePanel = React.useContext(SidePanelContext);
  const effectiveVariant =
    variant === "panel" ? "panel" : isInsideSidePanel ? "panel" : variant;

  const isActive =
    !disableTint &&
    (multiSelect
      ? selectedValues.length > 0
      : value !== undefined &&
        value !== null &&
        String(value).trim() !== "" &&
        String(value).toLowerCase() !== "all" &&
        String(value).toLowerCase() !== "any" &&
        String(value).toLowerCase() !== "vlocal");

  const dropdownMenu = isOpen
    ? createPortal(
        <>
          <div
            className="!fixed inset-0"
            style={{ zIndex: 100000000 }}
            onClick={() => setIsOpen(false)}
          />
          <div
            className={`!fixed pointer-events-auto backdrop-blur-2xl bg-[color-mix(in_srgb,var(--panelTint)_15%,transparent)] border ${isInsideSidePanel || effectiveVariant === "panel" ? "border-[rgba(var(--text-rgb),0.1)]" : "border-[rgba(var(--text-rgb),0.2)]"} shadow-[0_30px_60px_rgba(0,0,0,0.6)] rounded-[var(--radius)] animate-in fade-in zoom-in-95 max-h-60 overflow-y-auto custom-scrollbar flex flex-col`}
            style={{
              zIndex: 100000001,
              top: (coords as any).isDropUp ? "auto" : coords.top,
              bottom: (coords as any).isDropUp
                ? window.innerHeight - coords.top + 8
                : "auto",
              left: coords.isRight ? "auto" : coords.left,
              right: coords.isRight ? window.innerWidth - coords.left : "auto",
              transition: "none",
              width: coords.width || "max-content",
              minWidth: Math.max(coords.width, 200),
            }}
          >
            {searchable && (
              <div className="border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] sticky top-0 bg-transparent z-10 shrink-0 flex items-center px-4">
                <span className="material-symbols-outlined !text-[16px] opacity-50 mr-2">
                  search
                </span>
                <input
                  type="text"
                  data-1p-ignore="true"
                  autoFocus
                  placeholder={t("shared_search") || "Search..."}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-transparent border-none py-3 text-[11px] font-black capitalize focus:outline-none text-[var(--text)] placeholder:opacity-30"
                />
              </div>
            )}
            {multiSelect && options && options.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] sticky top-0 z-[5]">
                <span className="text-[9px] font-black text-[var(--subtext)] opacity-70 tracking-widest uppercase">
                  {selectedValues.length} {t("shared_selected") || "Selected"}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onChange(options.map((o: any) => String(o.id)))
                    }
                    className="text-[9px] font-black text-[var(--accent)] hover:text-white transition-colors uppercase tracking-widest"
                  >
                    {t("shared_select_all") || "Select All"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-[9px] font-black text-[var(--subtext)] hover:text-[var(--danger)] transition-colors uppercase tracking-widest"
                  >
                    {t("shared_clear") || "Clear"}
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
              {(options || [])
                .filter((opt: any) => {
                  if (!searchable || !query) return true;
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
                .map((opt: any) => {
                  const isSelected = multiSelect
                    ? selectedValues.includes(opt.id)
                    : String(value) === String(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelect(opt.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-lg text-[11px] font-black capitalize flex items-center gap-2 group transition-all ${isSelected ? "text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "text-[var(--text)]"}`}
                    >
                      {multiSelect && (
                        <div
                          className={`w-4 h-4 rounded-[4px] border-[1.5px] flex items-center justify-center transition-colors shrink-0 ${isSelected ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--bg)]" : "border-[color-mix(in_srgb,var(--text)_30%,transparent)] group-hover:border-[var(--text)]"}`}
                        >
                          {isSelected && (
                            <span className="material-symbols-outlined !text-[12px] font-bold">
                              check
                            </span>
                          )}
                        </div>
                      )}
                      {opt.icon && (
                        <span className="material-symbols-outlined !text-[16px] opacity-70 shrink-0">
                          {opt.icon}
                        </span>
                      )}
                      <span className="flex-1">{opt.label}</span>
                      {isSelected && !multiSelect && (
                        <span className="material-symbols-outlined !text-[16px] shrink-0">
                          check
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
                  <div className="p-4 text-center text-xs font-bold text-[var(--subtext)] opacity-60">
                    {t("shared_no_options")}
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
                    onClick={() => handleSelect(query)}
                    className="w-full text-left px-4 py-3 text-sm font-bold transition-all hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined !text-[16px] opacity-60">
                      add
                    </span>
                    <span className="text-[11px] font-black capitalize w-full">
                      Create "{query}"
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
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex justify-start items-center focus:outline-none relative z-[10] transition-all ${flat ? "bg-transparent border-b-2 border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:border-[var(--accent)] px-0 py-1 text-xs font-black capitalize tracking-widest text-[var(--text)] opacity-90" : isPill ? `h-10 px-5 rounded-full text-[10px] font-black uppercase tracking-widest ${isActive ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]" : "glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-inner text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]"}` : `${className ? "h-full px-4 rounded-full" : "h-12 px-5 rounded-[12px]"} text-sm font-bold ${isActive ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-[var(--radius)] text-[var(--accent)] shadow-md" : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] focus:border-[var(--accent)] transform-gpu"}`} ${buttonClassName || ""}`}
      >
        <span className="pr-4 flex-1 text-left flex items-center h-full capitalize overflow-hidden whitespace-nowrap text-ellipsis min-w-0">
          {getSelectedLabel()}
        </span>
        <span
          className={`transition-colors shrink-0 flex items-center justify-center ${isActive ? "text-[var(--accent)]" : "text-[var(--subtext)] opacity-60 hover:text-[var(--text)]"}`}
        >
          <span
            className={`material-symbols-outlined ${flat ? "!text-[16px]" : "!text-[20px]"}`}
          >
            {isOpen ? "expand_less" : "expand_more"}
          </span>
        </span>
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
      ? [selectedVersions]
      : [];
  const { t } = useLexicon();
  const [query, setQuery] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
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
      if (data) setVersions(data);
    }
    fetchVersions();
  }, []);

  const toggleVersion = (v: string) => {
    if (selectedVersions.includes(v)) {
      const newVersions = selectedVersions.filter((ver) => ver !== v);
      onChange(newVersions);
    } else {
      const newVersions = [...selectedVersions, v];
      onChange(newVersions);
    }
  };

  const filtered = versions
    .filter((v) => v.version && v.version.includes(query))
    .slice(0, 10);
  const rect = containerRef.current?.getBoundingClientRect();
  const isRightHalf = rect ? rect.left >= window.innerWidth / 2 : false;

  return (
    <div
      className={`relative ${variant === "pill" ? "h-full flex items-center" : "w-full"}`}
      ref={containerRef}
    >
      {variant !== "pill" && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedVersions.map((v) => (
            <span
              key={v}
              className="px-2.5 py-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-md text-[9px] font-black capitalize flex items-center gap-2"
            >
              {v}{" "}
              <button
                type="button"
                onClick={() => toggleVersion(v)}
                className="text-red-400 hover:text-red-300 flex items-center justify-center"
              >
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_close")}
                </span>
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        placeholder={
          variant === "pill" && selectedVersions.length > 0
            ? `VERSIONS (${selectedVersions.length})`
            : t("shared_search_versions")
        }
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={(e) => {
          setTimeout(() => setIsOpen(false), 200);
        }}
        className={
          variant === "pill"
            ? "bg-transparent text-[11px] font-bold text-[var(--text)] tracking-wider outline-none w-[160px] px-2 h-full placeholder:opacity-50"
            : "w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl px-5 h-12 text-[var(--text)] text-[11px] font-black capitalize tracking-widest focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all placeholder:opacity-30"
        }
      />
      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 pointer-events-auto"
              style={{ zIndex: 200000 }}
              onClick={() => setIsOpen(false)}
            />
            <div
              className="fixed pointer-events-none"
              style={{
                zIndex: 200001,
                top: rect ? (dropUp ? undefined : rect.bottom) : 0,
                bottom: rect ? (dropUp ? window.innerHeight - rect.top : undefined) : undefined,
                left: rect ? (isRightHalf ? undefined : rect.left) : 0,
                right: rect
                  ? isRightHalf
                    ? window.innerWidth - rect.right
                    : undefined
                  : undefined,
                width: rect ? rect.width : "max-content",
              }}
            >
              <div className={`absolute ${dropUp ? 'bottom-0' : 'top-0'} left-0 w-full pointer-events-auto ${dropUp ? 'mb-2' : 'mt-2'} glass-panel portal-glass-fix border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[var(--radius)] shadow-2xl animate-in fade-in ${dropUp ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2'} flex flex-col`}>
                <style>{`
                  #sa-portals .portal-glass-fix::before,
                  #sa-portals .portal-glass-fix .glass-surface::before,
                  #sa-portals .portal-glass-fix .glass-panel::before {
                    display: block !important;
                  }
                `}</style>
                <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col p-1">
                  {filtered.map((v) => (
                    <button
                      key={v.version}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        toggleVersion(v.version);
                        setQuery("");
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 text-[11px] font-black capitalize text-[var(--text)] flex justify-between items-center cursor-pointer"
                    >
                      <span>{v.version}</span>
                      {selectedVersions.includes(v.version) && (
                        <span className="text-emerald-400 flex items-center justify-center">
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_check")}
                          </span>
                        </span>
                      )}
                    </button>
                  ))}
                  {query && !versions.some((v) => v.version === query) && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        toggleVersion(query);
                        setQuery("");
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 text-[11px] font-black capitalize text-emerald-400 cursor-pointer"
                    >
                      + {t("cc_btn_add")} "{query}"
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>,
          document.getElementById("sa-portals") || document.body,
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
  onChange: (date: string | null) => void;
  placeholder?: string;
  className?: string;
  flat?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, isRight: false });
  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom,
          left: rect.left >= window.innerWidth / 2 ? rect.right : rect.left,
          isRight: rect.left >= window.innerWidth / 2,
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

  const isInsideSidePanel = React.useContext(SidePanelContext);

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return (
    <div className={`relative w-full ${className}`}>
      <button
        type="button"
        ref={btnRef}
        onClick={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        className={`w-full flex justify-start items-center focus:outline-none relative z-[10] transition-all group ${flat ? "bg-transparent border-b-2 border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:border-[var(--accent)] px-0 py-1 text-xs font-black capitalize tracking-widest text-[var(--text)] opacity-90" : "h-12 px-5 rounded-[var(--radius)] glass-surface shadow-inner text-sm font-bold text-[var(--text)] focus:theme-border-accent hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"}`}
      >
        <span
          className={`flex-1 text-left flex items-center h-full overflow-hidden ${flat ? "" : "truncate pr-4"}`}
        >
          {value
            ? new Date(value).toLocaleDateString()
            : placeholder || "Select Date..."}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="material-symbols-outlined !text-[16px] text-[var(--danger)] opacity-60 hover:opacity-100 transition-all cursor-pointer rounded-full hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] p-0.5"
            >
              close
            </span>
          )}
          <span className="text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] transition-colors flex items-center justify-center">
            <span className="material-symbols-outlined !text-[20px]">
              {isOpen ? "expand_less" : "expand_more"}
            </span>
          </span>
        </div>
      </button>
      {isOpen &&
        createPortal(
          <>
            <div
              className="!fixed inset-0 pointer-events-auto"
              style={{ zIndex: 200000 }}
              onClick={() => setIsOpen(false)}
            />
            <div
              className="!fixed pointer-events-none"
              style={{
                zIndex: 200001,
                top: coords.top,
                left: coords.isRight ? undefined : coords.left,
                right: coords.isRight
                  ? window.innerWidth - coords.left
                  : undefined,
                transition: "none",
              }}
            >
              <div
                className={`!absolute top-0 ${coords.isRight ? "right-0" : "left-0"} mt-2 pointer-events-auto backdrop-blur-2xl bg-[color-mix(in_srgb,var(--panelTint)_15%,transparent)] border ${isInsideSidePanel ? "border-[rgba(var(--text-rgb),0.1)]" : "border-[rgba(var(--text-rgb),0.2)]"} shadow-[0_30px_60px_rgba(0,0,0,0.6)] rounded-[var(--radius)] animate-in fade-in slide-in-from-top-2 p-4 w-64`}
              >
                <div className="flex justify-start items-center mb-4">
                  <button
                    onClick={() => setViewDate(new Date(year, month - 1, 1))}
                    className="text-[var(--subtext)] hover:text-[var(--text)] px-2 py-1"
                  >
                    {"<"}
                  </button>
                  <div className="text-[11px] font-black capitalize tracking-widest text-[var(--text)]">
                    {monthNames[month]} {year}
                  </div>
                  <button
                    onClick={() => setViewDate(new Date(year, month + 1, 1))}
                    className="text-[var(--subtext)] hover:text-[var(--text)] px-2 py-1"
                  >
                    {">"}
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div
                      key={d}
                      className="text-[8px] font-bold text-[var(--subtext)] opacity-60"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {blanks.map((b) => (
                    <div key={`blank-${b}`} className="p-1" />
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
                        onClick={() => handleSelect(d)}
                        className={`p-1.5 text-[10px] rounded-lg transition-all ${isSelected ? "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] font-black shadow-md backdrop-blur-sm scale-[1.05] relative z-10" : isToday ? "border border-[color-mix(in_srgb,var(--text)_20%,transparent)] font-bold" : "border border-transparent hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"}`}
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
  const isInsideSidePanel = React.useContext(SidePanelContext);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 0,
    isDropUp: false,
  });

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldDropUp = dropUp !== undefined ? dropUp : spaceBelow < 300;
        setCoords({
          top: shouldDropUp
            ? window.innerHeight - rect.top + 8
            : rect.bottom + 8,
          left: rect.left,
          width: rect.width,
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

  const rawResults = (modList || []).filter(
    (m: any) =>
      !query ||
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.displayName?.toLowerCase().includes(query.toLowerCase()),
  );
  const results = Array.from(
    new Map(rawResults.map((m: any) => [m.id || m.name, m])).values(),
  ).slice(0, 10);

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
            "w-full h-12 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl px-5 text-[var(--text)] text-[11px] font-black capitalize tracking-widest focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all relative"
          }
        />
        {selectedItem ? (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--danger)] opacity-80 hover:opacity-100 font-bold flex items-center justify-center"
            onClick={onClear}
          >
            <span className="material-symbols-outlined !text-[18px]">
              {t("icon_close")}
            </span>
          </button>
        ) : (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] opacity-60 flex items-center justify-center"
            onClick={() => setIsOpen(!isOpen)}
          >
            <span className="material-symbols-outlined !text-[20px]">
              {isOpen ? "expand_less" : "expand_more"}
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
                style={{ zIndex: 300000 }}
                onClick={() => setIsOpen(false)}
              />
              <div
                className={`!fixed glass-panel portal-glass-fix ${isInsideSidePanel ? "!border-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md shadow-[0_0_40px_rgba(0,0,0,0.5)]" : "border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl"} rounded-[var(--radius)] pointer-events-auto max-h-60 overflow-y-auto custom-scrollbar flex flex-col`}
                style={{
                  zIndex: 300001,
                  top: coords.isDropUp ? undefined : coords.top,
                  bottom: coords.isDropUp ? coords.top : undefined,
                  left: coords.left,
                  width: coords.width,
                }}
              >
                <style>{`
                  #sa-portals .portal-glass-fix::before,
                  #sa-portals .portal-glass-fix .glass-surface::before,
                  #sa-portals .portal-glass-fix .glass-panel::before {
                    display: block !important;
                  }
                `}</style>
                {results.map((m: any, idx: number) => (
                  <button
                    key={`${m.hash || m.name}-${idx}`}
                    onClick={() => {
                      onSelect(m);
                      setQuery("");
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-5 py-3 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-[var(--text)] capitalize">
                        {m.displayName || m.name.split("/").pop()}
                      </span>
                      {m.file_extension && (
                        <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[8px] font-mono opacity-80 capitalize border border-[color-mix(in_srgb,var(--text)_20%,transparent)]">
                          {m.file_extension}
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] font-mono text-[var(--subtext)] opacity-60">
                      {m.version_label
                        ? `Version(s): ${m.version_label}`
                        : m.master_author ||
                          m.author ||
                          (m.created_at
                            ? `Created: ${new Date(m.created_at).toLocaleDateString()}`
                            : `ID: ${m.id?.substring(0, 8).toUpperCase()}`)}
                    </span>
                  </button>
                ))}
                {results.length === 0 && (
                  <div className="p-5 text-center text-[10px] text-[var(--subtext)] font-bold capitalize">
                    {t("shared_no_signatures")}
                  </div>
                )}
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
    { id: 0, label: t("tier_0_label") || "Clean / Safe (Tier 0)" },
    { id: 1, label: t("tier_1_label") || "Explicit Content (Tier 1)" },
    { id: 2, label: t("tier_2_label") || "Illicit / Substance (Tier 2)" },
    { id: 3, label: t("tier_3_label") || "Extreme Violence (Tier 3)" },
    { id: 4, label: t("tier_4_label") || "Taboo / Sensitive (Tier 4)" },
    { id: 5, label: t("tier_5_label") || "Malware (Tier 5)" },
  ];

  const options = allOptions.filter((opt) => opt.id <= maxTier);

  return (
    <div className="w-full">
      <CustomDropdown
        value={value}
        options={options}
        onChange={(v: number[]) => onChange(v[0])}
        placeholder={t("shared_select_compliance")}
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
    { id: "Unknown", label: t("ui_icon_unknown") || "Unknown" },
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
        placeholder={t("shared_select_classification")}
        disableTint={true}
        className={className}
        buttonClassName={buttonClassName}
        flat={flat}
      />
    </div>
  );
}
export function CustomTierDropdown({ value, onChange, className }: any) {
  const { t } = useLexicon();
  const isInsideSidePanel = React.useContext(SidePanelContext);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 0,
    isDropUp: false,
  });

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldDropUp = spaceBelow < 200;
        setCoords({
          top: shouldDropUp
            ? window.innerHeight - rect.top + 8
            : rect.bottom + 8,
          left: rect.left,
          width: rect.width,
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
      label: t("tier4"),
      color: "theme-text-danger",
      glow: "theme-bg-danger",
      activeBg:
        "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]",
    },
    {
      id: 3,
      label: t("tier3"),
      color: "theme-text-warning",
      glow: "theme-bg-warning",
      activeBg:
        "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]",
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
        className={`w-full h-12 glass-surface rounded-xl px-5 text-[11px] font-black capitalize tracking-widest focus:outline-none flex justify-start items-center transition-all ${selected.color}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${selected.glow}`} />
          {selected.label}
        </div>
        <span className="transition-colors shrink-0 flex items-center justify-center text-[var(--subtext)] opacity-60 ml-auto">
          <span className="material-symbols-outlined !text-[20px]">
            {isOpen ? "expand_less" : "expand_more"}
          </span>
        </span>
      </button>

      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 pointer-events-auto"
              style={{ zIndex: 500000 }}
              onClick={() => setIsOpen(false)}
            />
            <div
              className="fixed pointer-events-none"
              style={{
                zIndex: 500001,
                top: coords.isDropUp ? undefined : coords.top,
                bottom: coords.isDropUp ? coords.top : undefined,
                left: coords.left,
                width: coords.width,
                transition: "none",
              }}
            >
              <div
                className={`absolute top-0 left-0 w-full pointer-events-auto mt-2 glass-panel portal-glass-fix ${isInsideSidePanel ? "!border-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md shadow-[0_0_40px_rgba(0,0,0,0.5)]" : "border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-2xl"} rounded-[var(--radius)] animate-in fade-in slide-in-from-top-2 flex flex-col`}
              >
                <style>{`
                #sa-portals .portal-glass-fix::before,
                #sa-portals .portal-glass-fix .glass-surface::before,
                #sa-portals .portal-glass-fix .glass-panel::before {
                  display: block !important;
                }
              `}</style>
                <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col">
                  {options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChange(opt.id);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-5 py-4 transition-colors border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 flex items-center gap-3 ${value === opt.id ? opt.activeBg + " " + opt.color : "text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] opacity-70 hover:opacity-100"}`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${opt.glow} ${value === opt.id ? "animate-pulse" : ""}`}
                      />
                      <span className="text-[11px] font-black capitalize tracking-widest">
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
export function HubTabDropdown({
  icon,
  label,
  options,
  activeTab,
  setTab,
  variant = "default",
}: any) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActiveGroup = options.some((opt: any) => opt.id === activeTab);
  const activeOption = options.find((opt: any) => opt.id === activeTab);
  const displayLabel = activeOption ? activeOption.label : label;
  const displayIcon = activeOption?.icon || icon;

  return (
    <div className="relative flex-1 h-full" ref={containerRef}>
      <button
        ref={btnRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-full px-4 py-3 flex items-center justify-center gap-2 font-black text-xs capitalize tracking-widest transition-all whitespace-nowrap ${
          isActiveGroup || isOpen
            ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-md"
            : "text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)] opacity-60 hover:opacity-100"
        }`}
      >
        {displayIcon && (
          <span className="material-symbols-outlined !text-lg">
            {displayIcon}
          </span>
        )}
        {displayLabel}
        <span className="material-symbols-outlined !text-md ml-1 opacity-50">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 pointer-events-auto"
            style={{ zIndex: 200000 }}
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={menuRef}
            className={`absolute mt-2 min-w-[200px] glass-panel border ${variant === "panel" ? "!border-transparent" : "border-[color-mix(in_srgb,var(--accent)_20%,transparent)]"} rounded-[var(--radius)] shadow-xl pointer-events-auto flex flex-col p-1 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-md`}
            style={{
              zIndex: 200001,
              top: "calc(100% + 4px)",
              right:
                (btnRef.current?.getBoundingClientRect().left || 0) >=
                window.innerWidth / 2
                  ? 0
                  : undefined,
              left:
                (btnRef.current?.getBoundingClientRect().left || 0) <
                window.innerWidth / 2
                  ? 0
                  : undefined,
              width: Math.max(
                200,
                btnRef.current?.getBoundingClientRect().width || 0,
              ),
            }}
          >
            <div className="px-3 py-2 text-[12px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-50 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] mb-1">
              {label}
            </div>
            {options.map((opt: any) => (
              <button
                key={opt.id}
                onClick={() => {
                  setTab(opt.id);
                  setIsOpen(false);
                }}
                className={`px-4 py-3 w-full flex items-center gap-3 rounded-lg text-[12px] font-black capitalize tracking-widest transition-all text-left group relative overflow-hidden ${
                  activeTab === opt.id
                    ? "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] shadow-[inset_0_0_15px_rgba(0,0,0,0.1)] border-l-[3px] border-[var(--accent)] pl-3"
                    : "text-[var(--subtext)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)] border-l-[3px] border-transparent"
                }`}
              >
                {opt.icon && (
                  <span className="material-symbols-outlined !text-md opacity-80">
                    {opt.icon}
                  </span>
                )}
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export function VerticalTabDropdown({
  icon,
  label,
  options,
  activeTab,
  setTab,
}: any) {
  const [isOpen, setIsOpen] = useState(false);

  const isActiveGroup = options.some((opt: any) => opt.id === activeTab);
  const activeOption = options.find((opt: any) => opt.id === activeTab);
  const displayLabel = activeOption ? activeOption.label : label;
  const displayIcon = activeOption?.icon || icon;

  return (
    <div className="w-full flex flex-col mb-1 shrink-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 relative overflow-hidden group
          ${
            isActiveGroup
              ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] backdrop-blur-md border border-transparent"
              : "text-[var(--sidebartext)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:text-[var(--accent)] border-transparent"
          }`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10 overflow-hidden flex-1 text-left">
          {displayIcon && (
            <span
              className={`material-symbols-outlined !text-[22px] transition-all duration-500 shrink-0 ${isActiveGroup ? "scale-110" : "group-hover:scale-110"}`}
            >
              {displayIcon}
            </span>
          )}
          <span
            className="font-black capitalize tracking-[0.15em] truncate leading-none pt-0.5 flex-1"
            style={{ fontSize: "var(--fontSizeSidebar, 11px)" }}
          >
            {displayLabel}
          </span>
        </div>
        <span className="material-symbols-outlined !text-[18px] opacity-50 relative z-10 shrink-0">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-1 mt-1 pl-8 relative before:content-[''] before:absolute before:left-[1.35rem] before:top-2 before:bottom-2 before:w-[2px] before:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] before:rounded-full shrink-0">
          {options.map((opt: any) => (
            <button
              key={opt.id}
              onClick={() => {
                setTab(opt.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 relative overflow-hidden group
                ${
                  activeTab === opt.id
                    ? "text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]"
                    : "text-[var(--sidebartext)] opacity-60 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                }`}
            >
              {opt.icon && (
                <span
                  className={`material-symbols-outlined !text-[18px] transition-all duration-500 shrink-0 ${activeTab === opt.id ? "scale-110" : "group-hover:scale-110"}`}
                >
                  {opt.icon}
                </span>
              )}
              <span
                className="font-black capitalize tracking-[0.15em] truncate leading-none pt-0.5 text-left flex-1"
                style={{ fontSize: "10px" }}
              >
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

