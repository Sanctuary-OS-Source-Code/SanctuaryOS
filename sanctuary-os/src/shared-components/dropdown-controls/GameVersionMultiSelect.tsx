import { useLexicon } from "../../LexiconContext";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../supabase";
import { SidePanelContext } from "../layout";
import { VAULT_CHIP_CLASS } from "../constants";
import { compareVersions, formatVersionRangesLabel } from "../versionUtils";
import { computeDropdownViewportCoords, type DropdownViewportCoords } from "./typesAndPosition";

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
