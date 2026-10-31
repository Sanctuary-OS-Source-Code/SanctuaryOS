import React from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { formatDisplayName, HoverTooltip, openModDossier } from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";

export interface ConflictLoadOrderInfo {
  elevatedTierA?: string;
  elevatedTierB?: string;
  tierLabelA?: string;
  tierLabelB?: string;
  winner?: "A" | "B" | null;
}

export interface RadarPairPreviewBannerProps {
  leftIcon: string;
  leftPrimary: string;
  leftSecondary?: string;
  accentColorVar?: string;
  topIcon?: string;
  topLabel: string;
  topRightLabel?: string;
  topRightIcon?: string;
  topRightColorVar?: string;
  bottomIcon?: string;
  bottomLabel: string;
  heightClass?: string;
}

export function RadarPairPreviewBanner({
  leftIcon,
  leftPrimary,
  leftSecondary,
  accentColorVar = "var(--accent)",
  topIcon,
  topLabel,
  topRightLabel,
  topRightIcon,
  topRightColorVar = "var(--success)",
  bottomIcon,
  bottomLabel,
  heightClass = "h-full",
}: RadarPairPreviewBannerProps) {
  const { t } = useLexicon();

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden select-none transition-transform duration-500 group-hover/card:scale-[1.02] group-hover:scale-[1.02]`}
      style={{
        background: `radial-gradient(circle at 82% 20%, color-mix(in srgb, ${accentColorVar} 12%, transparent) 0%, transparent 62%), var(--glass-card-banner-bg)`,
      }}
    >
      {/* Subtle ambient watermark glyph */}
      <span
        className="material-symbols-outlined absolute -right-2 -bottom-3 !text-[72px] opacity-[0.04] pointer-events-none select-none rotate-[-10deg]"
        style={{ color: accentColorVar }}
      >
        {leftIcon}
      </span>

      <div className="absolute inset-x-3 top-12 bottom-2.5 flex gap-2 pointer-events-none z-10">
        {/* Box 1 (Left): Severity # or Tier / Rule Identity */}
        <div className="w-14 h-full rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex flex-col items-center justify-center p-1 gap-0.5 shrink-0">
          <span
            className="material-symbols-outlined !text-[16px]"
            style={{ color: accentColorVar }}
          >
            {leftIcon}
          </span>
          <span className="text-[9.5px] font-mono font-black uppercase tracking-wider text-[var(--text)] leading-none mt-0.5 truncate max-w-full">
            {leftPrimary}
          </span>
          {leftSecondary && (
            <span className="text-[6.5px] font-mono font-bold uppercase text-[var(--subtext)] opacity-75 truncate max-w-full">
              {leftSecondary}
            </span>
          )}
        </div>

        {/* Right Stack: Row 1 (First Mod / Winner + optional 4th Box) & Row 2 (2nd Mod / Overridden) */}
        <div className="flex-1 h-full flex flex-col justify-between gap-1 min-w-0">
          {/* Row 1: Top (First Mod / Winner) + Optional Top Right (4th Box: Recommended Winner / Winner Badge) */}
          <div className="flex items-stretch gap-1 flex-1 min-h-0">
            <div className="flex-1 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1.5 min-w-0">
              <span
                className="material-symbols-outlined !text-[10px] shrink-0"
                style={{ color: accentColorVar }}
              >
                {topIcon || t("icon_deployed_code", "deployed_code")}
              </span>
              <span className="text-[7.5px] font-black uppercase tracking-wider text-[var(--text)] opacity-95 truncate">
                {topLabel}
              </span>
            </div>

            {topRightLabel && (
              <div className="shrink-0 max-w-[44%] px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center gap-1 min-w-0">
                {topRightIcon && (
                  <span
                    className="material-symbols-outlined !text-[10px] shrink-0"
                    style={{ color: topRightColorVar }}
                  >
                    {topRightIcon}
                  </span>
                )}
                <span className="text-[7px] font-mono font-black uppercase tracking-wider text-[var(--text)] opacity-95 truncate">
                  {topRightLabel}
                </span>
              </div>
            )}
          </div>

          {/* Row 2: Bottom (2nd Mod / Overridden Mod) */}
          <div className="flex-1 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-1.5 min-w-0">
            <span
              className="material-symbols-outlined !text-[10px] opacity-80 shrink-0"
              style={{ color: accentColorVar }}
            >
              {bottomIcon || t("icon_deployed_code", "deployed_code")}
            </span>
            <span className="text-[7.5px] font-bold uppercase tracking-wider text-[var(--text)] opacity-85 truncate">
              {bottomLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConflictCardProps {
  conflict: any;
  tier: number;
  isSelected?: boolean;
  isSelectedA?: boolean;
  isSelectedB?: boolean;
  loadOrderInfo?: ConflictLoadOrderInfo;
  onKeepA?: () => void;
  onKeepB?: () => void;
  onIgnore?: () => void;
  onClick?: () => void;
}

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

const extractType = (name: string) => {
  const upper = String(name).toUpperCase();
  const activeGameSchema = useStore.getState().activeGameSchema;
  if (activeGameSchema?.extensions?.labels) {
    for (const [ext, label] of Object.entries(activeGameSchema.extensions.labels)) {
      if (upper.includes(`[${label}]`) || upper.endsWith(ext.toUpperCase())) return label;
    }
  }
  return "PACKAGE";
};

const cleanModName = (name: string) => {
  let cleaned = formatDisplayName(String(name).split("/").pop()?.split("\\").pop() || name);
  const activeGameSchema = useStore.getState().activeGameSchema;
  if (activeGameSchema?.extensions?.labels) {
    for (const [ext, label] of Object.entries(activeGameSchema.extensions.labels)) {
      cleaned = cleaned
        .replace(new RegExp(`\\[${label}\\]`, "i"), "")
        .replace(new RegExp(ext.replace(".", "\\."), "i"), "");
    }
  }
  cleaned = cleaned.replace(/\.(package|ts4script|pak|archive|esp|esm|esl|rpf|asi|zip)$/i, "").trim();
  return cleaned;
};

function ConflictCardInner({
  conflict,
  tier,
  isSelected,
  isSelectedA,
  isSelectedB,
  loadOrderInfo,
  onKeepA,
  onKeepB,
  onClick,
  onIgnore,
}: ConflictCardProps) {
  const { t } = useLexicon();
  const modList = useStore((state: any) => state.modList);
  const showImages = useStore((state: any) => state.showImages);

  let label = "";
  let defaultAlertDesc = "";
  if (tier >= 5) {
    label = t("tier5_title", "Severity 5 • Critical Loop");
    defaultAlertDesc = t(
      "lo_cycle_desc",
      "Two or more {mods} are locked in an infinite load-order loop. Break one rule below to restore topological sorting."
    );
  } else if (tier === 4) {
    label = t("tier4_title", "Severity 4 Collisions")?.replace("dY>` ", "") || t("fatal", "Fatal");
    defaultAlertDesc = t("tier4_desc", "Core Python or Binary overlaps detected. Overrides impossible.");
  } else if (tier === 3) {
    label = t("tier3_title", "Severity 3 Collisions");
    defaultAlertDesc = t("tier3_desc", "XML / SimData overlaps detected. Neutralize via Override.");
  } else if (tier === 2) {
    label = t("tier2_title", "Severity 2 Collisions");
    defaultAlertDesc = t("identical_assets", "Identical asset signatures. Purge redundant files.");
  } else {
    label = t("tier1_title", "Severity 1 Collisions");
    defaultAlertDesc = t("safe_textures", "Usually safe textures or low-impact overrides");
  }

  const tColor =
    tier >= 4
      ? "text-[var(--danger)]"
      : tier === 3
        ? "text-[var(--warning)]"
        : tier === 2
          ? "text-[var(--accent)]"
          : "text-[var(--subtext)]";

  const bannerAccentVar =
    tier >= 4
      ? "var(--danger)"
      : tier === 3
        ? "var(--warning)"
        : "var(--accent)";

  const calloutBorderClass = "border-[color-mix(in_srgb,var(--text)_12%,transparent)]";

  const severityIcon =
    tier >= 5
      ? t("icon_sync_problem", "sync_problem")
      : tier === 4
        ? t("icon_crisis_alert", "crisis_alert")
        : tier === 3
          ? t("icon_tune", "tune")
          : tier === 2
            ? t("icon_file_copy", "file_copy")
            : t("icon_palette", "palette");

  const isLoadOrderGoverned = tier === 3 || tier === 1;
  const winnerSide = loadOrderInfo?.winner || null;

  const cleanA = cleanModName(conflict.modA);
  const cleanB = cleanModName(conflict.modB);
  const typeA = String(extractType(conflict.modA));
  const typeB = String(extractType(conflict.modB));
  const isScriptA = typeA.toUpperCase().includes("SCRIPT");
  const isScriptB = typeB.toUpperCase().includes("SCRIPT");

  const leafA = String(conflict.modA || "").split(/[\\/]/).pop()?.toLowerCase() || "";
  const leafB = String(conflict.modB || "").split(/[\\/]/).pop()?.toLowerCase() || "";
  const vaultModA = React.useMemo(() => {
    if (!Array.isArray(modList)) return null;
    return (
      modList.find((m: any) => {
        const mName = String(m?.name || m?.path || "").split(/[\\/]/).pop()?.toLowerCase() || "";
        return mName === leafA || cleanModName(mName).toLowerCase() === cleanA.toLowerCase();
      }) || null
    );
  }, [modList, leafA, cleanA]);

  const vaultModB = React.useMemo(() => {
    if (!Array.isArray(modList)) return null;
    return (
      modList.find((m: any) => {
        const mName = String(m?.name || m?.path || "").split(/[\\/]/).pop()?.toLowerCase() || "";
        return mName === leafB || cleanModName(mName).toLowerCase() === cleanB.toLowerCase();
      }) || null
    );
  }, [modList, leafB, cleanB]);

  const bannerImg =
    showImages && (vaultModA?.image_url || vaultModA?.image)
      ? vaultModA.image_url || vaultModA.image
      : undefined;

  // Suggested Winner for the 4th Box (Top Right). If not set, no 4th box is rendered!
  const recommendedWinnerLabel = (() => {
    const suggestedWord = t("radar_suggested", "Suggested");
    if (conflict.recommended_winner) {
      const recClean = cleanModName(conflict.recommended_winner);
      return recClean.toLowerCase() === cleanA.toLowerCase()
        ? suggestedWord
        : `${suggestedWord}: ${recClean}`;
    }
    if (winnerSide === "A") return suggestedWord;
    if (winnerSide === "B") return `${suggestedWord}: ${cleanB}`;
    if (loadOrderInfo?.elevatedTierA && !loadOrderInfo?.elevatedTierB) {
      return suggestedWord;
    }
    if (loadOrderInfo?.elevatedTierB && !loadOrderInfo?.elevatedTierA) {
      return `${suggestedWord}: ${cleanB}`;
    }
    return undefined;
  })();

  const sharedCount = Number(conflict.shared_assets || 0);
  const alertMessage = String(conflict.resolution_note || "").trim() || defaultAlertDesc;
  const hasBadges = sharedCount > 0;

  return (
    <UniversalCard
      layout="vertical"
      isActive={isSelected}
      onClick={onClick}
      title={
        <div className="flex flex-col gap-1.5 w-full min-w-0">
          <div className="text-[14px] md:text-[15px] font-black text-[var(--text)] leading-snug line-clamp-2 break-words">
            {cleanA}
          </div>
          <div className="flex items-center gap-2 py-0.5 w-full">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] shadow-[var(--glass-card-icon-shadow)] shrink-0">
              <span className={`material-symbols-outlined !text-[11px] ${tColor}`}>
                {t("icon_bolt", "bolt")}
              </span>
              <span className="text-[9px] font-mono font-black uppercase tracking-[0.16em] text-[var(--text)]">
                {t("vs", "VS")}
              </span>
            </span>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-[color-mix(in_srgb,var(--text)_14%,transparent)] to-transparent" />
          </div>
          <div className="text-[14px] md:text-[15px] font-black text-[var(--text)] leading-snug line-clamp-2 break-words">
            {cleanB}
          </div>
        </div>
      }
      image={bannerImg}
      icon={severityIcon}
      customIcon={
        <RadarPairPreviewBanner
          leftIcon={severityIcon}
          leftPrimary={`#${tier}`}
          leftSecondary={t("severity", "Severity").slice(0, 3)}
          accentColorVar={bannerAccentVar}
          topIcon={isScriptA ? t("icon_code", "code") : t("icon_deployed_code", "deployed_code")}
          topLabel={cleanA}
          topRightLabel={recommendedWinnerLabel}
          topRightIcon={t("icon_lightbulb", "lightbulb")}
          bottomIcon={isScriptB ? t("icon_code", "code") : t("icon_deployed_code", "deployed_code")}
          bottomLabel={cleanB}
        />
      }
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[82%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className={`material-symbols-outlined !text-[12px] ${tColor}`}>
              {severityIcon}
            </span>
            <span>{label}</span>
          </div>
          {isLoadOrderGoverned && winnerSide && (
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {t("icon_verified", "verified")}
              </span>
              <span>
                {winnerSide === "A"
                  ? t("lo_badge_wins_override", "Wins Override")
                  : t("lo_badge_overridden", "Overridden")}
              </span>
            </div>
          )}
        </div>
      }
      actions={
        onIgnore ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIgnore();
            }}
            className="group/igbtn relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[14px]">
              {t("icon_visibility_off", "visibility_off")}
            </span>
            <HoverTooltip title={t("ignore_tooltip", "Ignore this conflict")} />
          </button>
        ) : undefined
      }
      badges={
        hasBadges ? (
          <div className={VAULT_CHIP_CLASS}>
            <span className={`material-symbols-outlined !text-[12px] ${tColor}`}>
              {t("icon_layers", "layers")}
            </span>
            <span>
              {sharedCount} {t("radar_shared_resources", "Shared Resources")}
            </span>
          </div>
        ) : undefined
      }
      footer={
        <div
          className="flex items-center justify-between w-full gap-2 text-xs text-[var(--subtext)] font-bold"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => openModDossier(vaultModA || conflict.modA)}
              className="group/dosA relative h-7 px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center gap-1 text-[9px] font-mono font-black uppercase tracking-wider transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_open_in_new", "open_in_new")}
              </span>
              <span>A</span>
              <HoverTooltip
                title={`${t("btn_inspect", "Inspect {Mod}")}: ${cleanA}`}
                className="z-[200]"
              />
            </button>
            <button
              type="button"
              onClick={() => openModDossier(vaultModB || conflict.modB)}
              className="group/dosB relative h-7 px-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center gap-1 text-[9px] font-mono font-black uppercase tracking-wider transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[13px]">
                {t("icon_open_in_new", "open_in_new")}
              </span>
              <span>B</span>
              <HoverTooltip
                title={`${t("btn_inspect", "Inspect {Mod}")}: ${cleanB}`}
                className="z-[200]"
              />
            </button>
          </div>

          {onClick && (
            <button
              type="button"
              onClick={() => onClick()}
              className="text-[10px] font-black text-[var(--text)] opacity-85 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)] uppercase tracking-wider transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>{t("radar_inspect_btn", "Inspect & Resolve")}</span>
              <span className="text-base leading-none">&rarr;</span>
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full">
        {/* In-Card Alert Summary Box (Aligned icon + message, no redundant mod name) */}
        <div
          className={`rounded-xl px-3 py-2.5 glass-surface border ${calloutBorderClass} flex flex-col gap-2`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-7 h-7 rounded-lg glass-surface border ${calloutBorderClass} flex items-center justify-center shrink-0`}
            >
              <span className={`material-symbols-outlined !text-[14px] ${tColor}`}>
                {severityIcon}
              </span>
            </div>
            <div className="text-[11px] font-semibold text-[var(--text)] opacity-90 leading-snug break-words min-w-0 flex-1">
              {alertMessage}
            </div>
          </div>

          {(onKeepA || onKeepB) && (
            <div
              className="grid grid-cols-2 gap-1.5 pt-1"
              onClick={(e) => e.stopPropagation()}
            >
              {onKeepA && (
                <button
                  type="button"
                  onClick={onKeepA}
                  className={`h-7 px-2 rounded-lg glass-surface border text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    isSelectedA
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[12px]">
                    {isSelectedA ? t("icon_check_circle", "check_circle") : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                  </span>
                  <span className="truncate">{t("enemy_a", "{Mod} A")}</span>
                </button>
              )}
              {onKeepB && (
                <button
                  type="button"
                  onClick={onKeepB}
                  className={`h-7 px-2 rounded-lg glass-surface border text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    isSelectedB
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[12px]">
                    {isSelectedB ? t("icon_check_circle", "check_circle") : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                  </span>
                  <span className="truncate">{t("enemy_b", "{Mod} B")}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </UniversalCard>
  );
}

export const ConflictCard = React.memo(ConflictCardInner);
export default ConflictCard;
