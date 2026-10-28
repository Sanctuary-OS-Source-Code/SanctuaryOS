import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  useLexicon,
  DEFAULT_TITLE_AREA_SUBTITLES,
  interpolateGlossaryTokens,
  CoreTitleAreaConfig,
} from "../LexiconContext";
import enDefaultRaw from "../lexicons/en-default.json";
import enSanctuaryRaw from "../lexicons/en-sanctuary.json";
import {
  ActionButton,
  EmptyState,
  HoverTooltip,
  PanelHeaderButton,
  PanelHeaderGroup,
  SidePanel,
  SidePanelHeroCard,
} from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";
import { notifyOS } from "../utils/notificationHelper";

const enDefault = enDefaultRaw as Record<string, any>;
const enSanctuary = enSanctuaryRaw as Record<string, any>;

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

function humanizeKey(key: string): string {
  return key
    .replace(
      /^(btn_|lbl_|label_|title_|tab_|nav_|msg_|err_|alert_|lex_studio_|schema_studio_|wb_|icon_|action_|filter_|status_|vault_cat_|dlc_type_|role_)/,
      ""
    )
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildTitleAreaIdeJsonObject(config: CoreTitleAreaConfig): Record<string, any> {
  const obj: Record<string, any> = {
    _meta_name: "Title & Subtitles",
    _meta_badge: "Sanctuary Foundry",
    _meta_author: "Keepers Core",
    _meta_version: 1,
    sidebar_app_title: config?.appTitle || "Sanctuary OS",
  };

  const subs =
    Array.isArray(config?.subtitles) && config.subtitles.length > 0
      ? config.subtitles
      : DEFAULT_TITLE_AREA_SUBTITLES;
  subs.forEach((s, idx) => {
    obj[`sidebar_app_subtitle_${idx + 1}`] = s;
  });

  return obj;
}

export function parseTitleAreaIdeJsonToConfig(
  parsed: Record<string, any>
): Partial<CoreTitleAreaConfig> {
  const appTitle =
    typeof parsed?.sidebar_app_title === "string" && parsed.sidebar_app_title.trim()
      ? parsed.sidebar_app_title.trim()
      : "Sanctuary OS";

  const subtitleEntries: { num: number; val: string }[] = [];

  for (const [k, v] of Object.entries(parsed || {})) {
    if (k.startsWith("sidebar_app_subtitle_")) {
      const num = parseInt(k.replace("sidebar_app_subtitle_", ""), 10);
      const cleanVal = String(v ?? "").trim();
      if (cleanVal) {
        subtitleEntries.push({
          num: Number.isFinite(num) ? num : subtitleEntries.length + 1,
          val: cleanVal,
        });
      }
    }
  }

  subtitleEntries.sort((a, b) => a.num - b.num);
  const subtitles =
    subtitleEntries.length > 0
      ? subtitleEntries.map((e) => e.val)
      : [...DEFAULT_TITLE_AREA_SUBTITLES];

  return {
    appTitle,
    subtitles,
    lockedStrings: {},
  };
}

export interface KeepersTitleAreaStudioProps {
  content?: string;
  onChange?: (newContent: string) => void;
  fileName?: string;
  searchQuery?: string;
}

export default function KeepersTitleAreaStudio({
  content,
  onChange,
  fileName = "core-title-area.json",
}: KeepersTitleAreaStudioProps) {
  const { t, previewSubtitleText, setPreviewSubtitleText, titleAreaConfig, saveTitleAreaConfig } = useLexicon();
  const [newSubtitleText, setNewSubtitleText] = useState("");

  useEffect(() => {
    return () => {
      setPreviewSubtitleText(null);
    };
  }, []);

  const effectiveContent = useMemo(() => {
    if (typeof content === "string") return content;
    return JSON.stringify(buildTitleAreaIdeJsonObject(titleAreaConfig), null, 2);
  }, [content, titleAreaConfig]);

  const { parsedDict, parseError } = useMemo(() => {
    try {
      const parsed = JSON.parse(effectiveContent || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { parsedDict: parsed as Record<string, any>, parseError: null };
      }
      return { parsedDict: {} as Record<string, any>, parseError: "Root JSON must be an object" };
    } catch (e: any) {
      return { parsedDict: {} as Record<string, any>, parseError: e?.message || "Invalid JSON" };
    }
  }, [effectiveContent]);

  const commitDict = (nextDict: Record<string, any>) => {
    if (onChange) {
      onChange(JSON.stringify(nextDict, null, 2));
    } else {
      saveTitleAreaConfig(parseTitleAreaIdeJsonToConfig(nextDict)).catch(() => {});
    }
  };

  const handleUpdateKey = (key: string, val: any) => {
    const next = { ...parsedDict, [key]: val };
    commitDict(next);
  };

  const handleResetKey = (key: string) => {
    const next = { ...parsedDict };
    if (key === "sidebar_app_title") {
      next[key] = "Sanctuary OS";
    } else if (key.startsWith("sidebar_app_subtitle_")) {
      const idx = Math.max(0, (parseInt(key.replace("sidebar_app_subtitle_", ""), 10) || 1) - 1);
      next[key] = DEFAULT_TITLE_AREA_SUBTITLES[idx] || DEFAULT_TITLE_AREA_SUBTITLES[0];
    } else {
      next[key] = enSanctuary[key] ?? enDefault[key] ?? "";
    }
    commitDict(next);
  };

  const subtitleKeys = useMemo(() => {
    const keys = Object.keys(parsedDict).filter((k) => k.startsWith("sidebar_app_subtitle_"));
    keys.sort((a, b) => {
      const na = parseInt(a.replace("sidebar_app_subtitle_", ""), 10) || 0;
      const nb = parseInt(b.replace("sidebar_app_subtitle_", ""), 10) || 0;
      return na - nb;
    });
    return keys;
  }, [parsedDict]);

  const handleAddSubtitle = () => {
    const clean = newSubtitleText.trim();
    if (!clean) return;
    const nextNum = subtitleKeys.length + 1;
    const next = { ...parsedDict };
    // Normalize existing subtitle numbering 1..N then append
    subtitleKeys.forEach((oldKey, i) => {
      const val = next[oldKey];
      delete next[oldKey];
      next[`sidebar_app_subtitle_${i + 1}`] = val;
    });
    next[`sidebar_app_subtitle_${nextNum}`] = clean;
    commitDict(next);
    setNewSubtitleText("");
    setPreviewSubtitleText(clean);
  };

  const handleDeleteSubtitle = (targetKey: string) => {
    if (subtitleKeys.length <= 1) return;
    const remainingVals = subtitleKeys
      .filter((k) => k !== targetKey)
      .map((k) => parsedDict[k]);
    const next = { ...parsedDict };
    for (const k of subtitleKeys) {
      delete next[k];
    }
    remainingVals.forEach((v, idx) => {
      next[`sidebar_app_subtitle_${idx + 1}`] = v;
    });
    commitDict(next);
  };

  const handleMoveSubtitle = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= subtitleKeys.length) return;
    const vals = subtitleKeys.map(
      (k, i) => parsedDict[k] ?? DEFAULT_TITLE_AREA_SUBTITLES[i] ?? ""
    );
    const temp = vals[idx];
    vals[idx] = vals[targetIdx];
    vals[targetIdx] = temp;
    const next = { ...parsedDict };
    for (const k of subtitleKeys) {
      delete next[k];
    }
    vals.forEach((v, i) => {
      next[`sidebar_app_subtitle_${i + 1}`] = v;
    });
    commitDict(next);
  };

  const handleResetAllSubtitles = () => {
    const next = { ...parsedDict };
    for (const k of subtitleKeys) {
      delete next[k];
    }
    DEFAULT_TITLE_AREA_SUBTITLES.forEach((v, i) => {
      next[`sidebar_app_subtitle_${i + 1}`] = v;
    });
    commitDict(next);
  };

  if (parseError) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full">
        <EmptyState
          icon={t("icon_error", "error")}
          title={t("lex_studio_json_err_title", "JSON Syntax Error")}
          subtitle={parseError}
        />
      </div>
    );
  }

  const renderFieldGridCard = (key: string, defaultBaseline: string) => {
    const rawVal = parsedDict[key];
    const effectiveStr =
      rawVal !== undefined && rawVal !== null ? String(rawVal) : String(defaultBaseline);
    const isCustomized = effectiveStr !== String(defaultBaseline);
    const hasTokens = effectiveStr.includes("{") || String(defaultBaseline).includes("{");
    const livePreview = hasTokens
      ? interpolateGlossaryTokens(effectiveStr, enSanctuary)
      : null;

    return (
      <div
        key={key}
        className={`glass-surface rounded-2xl p-3.5 border flex flex-col justify-between gap-2 transition-all ${
          isCustomized
            ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
            : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        }`}
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-wider truncate">
              {humanizeKey(key)}
              <HoverTooltip title={humanizeKey(key)} />
            </label>
            <span className="text-[9px] font-mono text-[var(--subtext)] opacity-55 truncate">
              {key}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isCustomized && (
              <button
                type="button"
                onClick={() => handleResetKey(key)}
                className="px-2 py-0.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_18%,transparent)] bg-transparent text-[9px] font-black text-[var(--subtext)] hover:text-[var(--text)] transition-all cursor-pointer"
              >
                {t("reset", "Reset")}
                <HoverTooltip title={String(defaultBaseline)} />
              </button>
            )}
          </div>
        </div>

        <input
          type="text"
          value={effectiveStr}
          placeholder={String(defaultBaseline)}
          onChange={(e) => handleUpdateKey(key, e.target.value)}
          className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />

        {livePreview && livePreview !== effectiveStr && (
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[var(--success)] px-1 truncate">
            <span className="truncate">{`→ ${livePreview}`}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-y-auto custom-scrollbar px-5 pt-4 pb-10 gap-4 select-none">
      {/* Header Bar */}
      <div className="flex flex-col gap-3.5 pb-1 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col justify-start min-w-0">
            <input
              type="text"
              value={parsedDict._meta_name || t("title_area_card_title_subtitles", "Title & Subtitles")}
              onChange={(e) => handleUpdateKey("_meta_name", e.target.value)}
              className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-xl md:text-2xl font-black text-[var(--text)] tracking-tight transition-colors py-0.5 truncate"
              placeholder={t("title_area_card_title_subtitles", "Title & Subtitles")}
            />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 mt-0.5 truncate">
              {`${fileName} • KEEPERS CORE • ${subtitleKeys.length} ${t("title_area_subtitles_group", "Rotating Title Area Taglines")}`}
            </p>
          </div>
        </div>
      </div>

      {/* BRAND TITLE & ROTATING TAGLINES */}
      <div className="flex flex-col gap-5 animate-in fade-in duration-200">
        <UniversalGroup
          title={t("title_area_app_title_label", "Two-Tone OS Title")}
          icon={t("icon_branding_watermark", "branding_watermark")}
        >
          <div className="grid grid-cols-1 gap-3.5 w-full">
            {renderFieldGridCard("sidebar_app_title", "Sanctuary OS")}
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("title_area_subtitles_group", "Rotating Title Area Taglines")}
          icon={t("icon_subtitles", "subtitles")}
          headerAction={
            <ActionButton
              variant="glass"
              icon={t("icon_restart_alt", "restart_alt")}
              label={t("reset", "Reset")}
              onClick={handleResetAllSubtitles}
              className="!h-7 !px-2.5 !text-[9px] !rounded-lg"
            />
          }
        >
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full">
              <input
                type="text"
                value={newSubtitleText}
                onChange={(e) => setNewSubtitleText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSubtitle();
                  }
                }}
                placeholder={
                  t(
                    "title_area_new_subtitle_placeholder",
                    "Enter new rotating tagline..."
                  ) as string
                }
                className="flex-1 h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                label={t("title_area_add_subtitle", "Add Tagline")}
                disabled={!newSubtitleText.trim()}
                onClick={handleAddSubtitle}
                className="!h-10 !px-4 !rounded-xl shrink-0"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              {subtitleKeys.map((subKey, idx) => {
                const defVal =
                  DEFAULT_TITLE_AREA_SUBTITLES[idx] || DEFAULT_TITLE_AREA_SUBTITLES[0];
                const curVal = String(parsedDict[subKey] ?? defVal);
                const isPreviewing = previewSubtitleText === curVal;
                return (
                  <div
                    key={subKey}
                    className={`glass-surface rounded-2xl p-3.5 border flex flex-col justify-between gap-2 transition-all ${
                      isPreviewing
                        ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={VAULT_CHIP_CLASS}>
                          <span>{`#${String(idx + 1).padStart(2, "0")}`}</span>
                        </span>
                        <span className="text-[9px] font-mono text-[var(--subtext)] opacity-55 truncate">
                          {subKey}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewSubtitleText(isPreviewing ? null : curVal)
                          }
                          className={`px-2 py-0.5 rounded-lg border bg-transparent text-[9px] font-black transition-all cursor-pointer flex items-center gap-1 ${
                            isPreviewing
                              ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]"
                              : "border-[color-mix(in_srgb,var(--text)_16%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_visibility", "visibility")}
                          </span>
                          <span>{t("preview", "Preview")}</span>
                        </button>
                        <ActionButton
                          variant="glass"
                          icon={t("icon_arrow_upward", "arrow_upward")}
                          iconOnly={true}
                          disabled={idx === 0}
                          onClick={() => handleMoveSubtitle(idx, -1)}
                          className="!w-6 !h-6 !rounded-lg"
                        />
                        <ActionButton
                          variant="glass"
                          icon={t("icon_arrow_downward", "arrow_downward")}
                          iconOnly={true}
                          disabled={idx >= subtitleKeys.length - 1}
                          onClick={() => handleMoveSubtitle(idx, 1)}
                          className="!w-6 !h-6 !rounded-lg"
                        />
                        {subtitleKeys.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSubtitle(subKey)}
                            className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[9px] font-black text-[var(--text)] flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[10px] text-[var(--danger)]">{t("icon_delete", "delete")}</span>
                            {t("delete", "Delete")}
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      type="text"
                      value={curVal}
                      placeholder={defVal}
                      onChange={(e) => handleUpdateKey(subKey, e.target.value)}
                      className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </UniversalGroup>
      </div>
    </div>
  );
}

export function KeepersLogoSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t, osLogoUrl, titleAreaConfig, saveTitleAreaConfig } = useLexicon();
  const [logoUrl, setLogoUrl] = useState<string>(osLogoUrl || "/icon.png");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLogoUrl(titleAreaConfig?.logoUrl || "/icon.png");
    }
  }, [isOpen, titleAreaConfig?.logoUrl]);

  const hasChanges =
    ((logoUrl || "").trim() || "/icon.png") !==
    ((titleAreaConfig?.logoUrl || "").trim() || "/icon.png");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSaveLogo = async () => {
    setIsSaving(true);
    try {
      await saveTitleAreaConfig({
        logoUrl: (logoUrl || "").trim() || "/icon.png",
      });
      notifyOS(
        t("keepers_tab_title_area", "Title Area"),
        t("title_area_saved_toast", "Core Title Area & Logo synced to Foundry Hub"),
        "SYSTEM"
      ).catch(() => {});
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const titleWords = (titleAreaConfig?.appTitle || "Sanctuary OS").trim().split(/\s+/);
  const primaryWord = titleWords[0] || "Sanctuary";
  const secondaryWords = titleWords.slice(1).join(" ");
  const sampleSubtitle =
    titleAreaConfig?.subtitles?.[0] || DEFAULT_TITLE_AREA_SUBTITLES[0];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("title_area_logo_group", "Logo & Brand Header")}
      subtitle={t("keepers_tab_title_area", "Title Area")}
      icon={t("icon_branding_watermark", "branding_watermark")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          {logoUrl !== "/icon.png" && (
            <PanelHeaderButton
              icon={t("icon_undo", "undo")}
              tooltip={t("title_area_reset_logo", "Default Logo")}
              onClick={() => setLogoUrl("/icon.png")}
            />
          )}
          <PanelHeaderButton
            icon={t("icon_save", "save")}
            variant="accent"
            disabled={isSaving || !hasChanges}
            tooltip={t("save", "Save")}
            onClick={handleSaveLogo}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_branding_watermark", "branding_watermark")}
          overline={t("keepers_tab_title_area", "Title Area")}
          title={t("title_area_logo_group", "Logo & Brand Header")}
          description={t(
            "lex_studio_keeper_locked_desc",
            "OS Brand Title, Rotating Subtitles, and Brand Logo can only be modified by Keepers in Keepers Core."
          )}
          badge={
            hasChanges
              ? t("unsaved_changes", "Unsaved")
              : t("status_active", "Active")
          }
          variant={hasChanges ? "warning" : "accent"}
        />

        <UniversalGroup
          title={t("preview", "Preview")}
          icon={t("icon_visibility", "visibility")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch w-full">
            <div className="sm:col-span-8 glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                {t("title_area_preview_expanded", "Expanded Sidebar Header")}
              </span>
              <div className="relative flex items-center justify-between cursor-pointer glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--sidebartext)_14%,rgba(255,255,255,0.18))] group/logo overflow-hidden px-3 py-2.5 min-h-[62px]">
                <img
                  src={logoUrl || "/icon.png"}
                  alt={primaryWord}
                  className="absolute top-1/2 -translate-y-1/2 transition-all duration-700 pointer-events-none w-24 h-24 -right-4 opacity-[0.06] grayscale group-hover/logo:grayscale-0 group-hover/logo:opacity-[0.14] group-hover/logo:scale-110 group-hover/logo:rotate-12 object-contain"
                />
                <div className="flex items-center w-full relative z-10 justify-between gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl glass-panel border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_12px_rgba(0,0,0,0.2)] flex items-center justify-center shrink-0">
                    <img
                      src={logoUrl || "/icon.png"}
                      alt={primaryWord}
                      className="w-5 h-5 object-contain"
                    />
                  </div>
                  <div className="flex flex-col justify-center min-w-0 flex-1">
                    <h1 className="text-[16px] tracking-tight capitalize leading-tight flex items-center gap-1 whitespace-nowrap">
                      <span className="font-black text-[var(--sidebartext)]">
                        {primaryWord}
                      </span>
                      {secondaryWords && (
                        <span className="font-light text-[var(--sidebartext)] opacity-75">
                          {secondaryWords}
                        </span>
                      )}
                    </h1>
                    <span className="text-[7px] font-black tracking-[0.14em] text-[var(--accent)] opacity-85 capitalize leading-snug mt-0.5 break-words">
                      {sampleSubtitle}
                    </span>
                  </div>
                  <div className="ml-auto self-center w-7 h-7 rounded-lg glass-panel border border-[color-mix(in_srgb,var(--sidebartext)_14%,transparent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[16px] leading-none flex items-center justify-center text-[var(--sidebartext)] opacity-75">
                      {t("icon_keyboard_double_arrow_left", "keyboard_double_arrow_left")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="sm:col-span-4 glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between items-center gap-2.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] self-start">
                {t("title_area_preview_collapsed", "Collapsed Rail")}
              </span>
              <div className="relative flex items-center justify-center cursor-pointer group/logo overflow-hidden rounded-2xl w-[62px] h-[56px] border border-[color-mix(in_srgb,var(--sidebartext)_14%,rgba(255,255,255,0.18))] glass-surface shrink-0">
                <div className="w-9 h-9 rounded-xl glass-panel border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_12px_rgba(0,0,0,0.2)] flex items-center justify-center shrink-0">
                  <img
                    src={logoUrl || "/icon.png"}
                    alt={primaryWord}
                    className="w-5 h-5 object-contain transition-transform duration-500 group-hover/logo:scale-110"
                  />
                </div>
              </div>
            </div>
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("title_area_logo_url", "Logo Image URL or Data Asset")}
          icon={t("icon_image", "image")}
        >
          <div className="flex flex-col gap-3.5 w-full">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="/icon.png"
              className="w-full h-11 glass-panel rounded-xl px-4 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex items-center justify-end gap-2">
              {logoUrl !== "/icon.png" && (
                <ActionButton
                  variant="glass"
                  icon={t("icon_undo", "undo")}
                  label={t("title_area_reset_logo", "Default Logo")}
                  onClick={() => setLogoUrl("/icon.png")}
                  className="!h-10 !px-4 !rounded-xl"
                />
              )}
              <ActionButton
                variant="accent"
                icon={t("icon_upload", "upload")}
                label={t("title_area_upload_logo", "Upload Logo")}
                onClick={() => fileInputRef.current?.click()}
                className="!h-10 !px-4 !rounded-xl"
              />
            </div>
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
