import { useStore } from "../../store";
import { useLexicon } from "../../LexiconContext";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { formatDisplayName } from "../stringUtils";
import { getFileLabel } from "../modUtils";
import { computeDropdownViewportCoords, type DropdownViewportCoords } from "./typesAndPosition";
import { CustomDropdown } from "./CustomDropdown";

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
  const modCategories = useStore((state: any) => state.modCategories);
  const schemaCats = Array.isArray(modCategories) ? modCategories : [];
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


