import React from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { formatDisplayName, getFileLabel, isSupportedExtension } from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";

interface ConflictCardProps {
  conflict: any;
  tier: number;
  isSelected?: boolean;
  isSelectedA?: boolean;
  isSelectedB?: boolean;
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
  cleaned = cleaned.trim();
  return cleaned;
};

const ModNameWithBadge = ({ name }: { name: string }) => {
  const { t } = useLexicon();
  const type = extractType(name);
  const cleanName = cleanModName(name);
  const isScript = String(type).toUpperCase().includes("SCRIPT");
  return (
    <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
      <span className="text-sm font-black text-[var(--text)] truncate tracking-tight drop-shadow-md">
        {cleanName}
      </span>
      <div className={VAULT_CHIP_CLASS}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
          {isScript
            ? t("icon_code", "code")
            : t("icon_extension", "extension")}
        </span>
        <span>{type as any}</span>
      </div>
    </div>
  );
};

function ConflictCardInner({
  conflict,
  tier,
  isSelected,
  isSelectedA,
  isSelectedB,
  onKeepA,
  onKeepB,
  onClick,
  onIgnore,
}: ConflictCardProps) {
  const { t } = useLexicon();

  let label = "";

  if (tier === 4) {
    label = t("tier4_title", "Severity 4 Collisions")?.replace("dY>` ", "") || t("fatal", "Fatal");
  } else if (tier === 3) {
    label = t("tier3_title", "Severity 3 Collisions");
  } else if (tier === 2) {
    label = t("tier2_title", "Severity 2 Collisions");
  } else {
    label = t("tier1_title", "Severity 1 Collisions");
  }

  const tColor =
    tier === 4
      ? "text-[var(--danger)]"
      : tier === 3
        ? "text-[var(--warning)]"
        : tier === 2
          ? "text-[var(--accent)]"
          : "text-[var(--subtext)]";

  const borderHover =
    tier === 4
      ? "hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
      : tier === 3
        ? "hover:border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
        : tier === 2
          ? "hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
          : "hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)]";

  const titleNode = (
    <div className={VAULT_CHIP_CLASS}>
      <span className={`material-symbols-outlined !text-[12px] ${tColor}`}>
        {tier === 4
          ? t("icon_crisis_alert", "crisis_alert")
          : tier === 3
            ? t("icon_tune", "tune")
            : tier === 2
              ? t("icon_file_copy", "file_copy")
              : t("icon_info", "info")}
      </span>
      <span>{label}</span>
    </div>
  );

  const actionsNode =
    onIgnore && tier === 1 ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onIgnore?.();
        }}
        className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--danger)] transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5 shrink-0"
      >
        <span className="material-symbols-outlined !text-[12px]">
          {t("icon_visibility_off", "visibility_off")}
        </span>
        <span>{t("btn_ignore", "Ignore")}</span>
      </button>
    ) : undefined;

  return (
    <div
      onClick={!onKeepA && !onKeepB ? onClick : undefined}
      className={`glass-panel p-5 rounded-[var(--radius)] flex flex-col gap-4 group border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:shadow-xl ${borderHover} transition-all duration-500 relative ${
        isSelected ? "ring-1 ring-[color-mix(in_srgb,var(--accent)_55%,rgba(255,255,255,0.5))]" : ""
      } ${!onKeepA && !onKeepB ? "cursor-pointer" : ""}`}
    >
      {/* Header */}
      <div className="flex justify-between items-center z-10 relative gap-2">
        {titleNode}
        {actionsNode && <div className="shrink-0">{actionsNode}</div>}
      </div>

      {/* A vs B Section */}
      <div className="flex flex-col gap-2 relative z-10 w-full mt-1">
        <div
          onClick={
            onKeepA
              ? (e) => {
                  e.stopPropagation();
                  onKeepA();
                }
              : undefined
          }
          className={`flex flex-col gap-1.5 p-3 rounded-xl glass-surface border transition-colors duration-300 relative group/moda ${
            isSelectedA
              ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
              : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          } ${onKeepA ? "cursor-pointer hover:border-[color-mix(in_srgb,var(--success)_40%,transparent)]" : ""}`}
        >
          <div className="flex justify-between items-center">
            <span
              className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 opacity-80 ${tColor}`}
            >
              {t("enemy_a", "{Mod} A")}
            </span>
            {onKeepA && (
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all duration-300 ${
                  isSelectedA
                    ? "border-[var(--accent)] text-[var(--accent)] bg-transparent"
                    : "border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-transparent group-hover/moda:border-[color-mix(in_srgb,var(--success)_50%,transparent)] group-hover/moda:text-[var(--success)] bg-transparent"
                }`}
              >
                <span className="material-symbols-outlined font-black !text-[12px]">
                  {t("icon_check", "check")}
                </span>
              </div>
            )}
          </div>
          <ModNameWithBadge name={conflict.modA} />
        </div>

        <div className="relative h-px w-full flex items-center justify-center z-20 my-1.5">
          <div className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center absolute shadow-sm text-[var(--subtext)]">
            <span className="text-[8px] font-black uppercase tracking-wider">{t("vs", "VS")}</span>
          </div>
          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_10%,transparent)] to-transparent" />
        </div>

        <div
          onClick={
            onKeepB
              ? (e) => {
                  e.stopPropagation();
                  onKeepB();
                }
              : undefined
          }
          className={`flex flex-col gap-1.5 p-3 rounded-xl glass-surface border transition-colors duration-300 relative group/modb ${
            isSelectedB
              ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
              : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          } ${onKeepB ? "cursor-pointer hover:border-[color-mix(in_srgb,var(--success)_40%,transparent)]" : ""}`}
        >
          <div className="flex justify-between items-center">
            <span
              className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 opacity-80 ${tColor}`}
            >
              {t("enemy_b", "{Mod} B")}
            </span>
            {onKeepB && (
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all duration-300 ${
                  isSelectedB
                    ? "border-[var(--accent)] text-[var(--accent)] bg-transparent"
                    : "border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-transparent group-hover/modb:border-[color-mix(in_srgb,var(--success)_50%,transparent)] group-hover/modb:text-[var(--success)] bg-transparent"
                }`}
              >
                <span className="material-symbols-outlined font-black !text-[12px]">
                  {t("icon_check", "check")}
                </span>
              </div>
            )}
          </div>
          <ModNameWithBadge name={conflict.modB} />
        </div>
      </div>

      {conflict.is_ghost && (
        <div className="flex flex-col gap-1 relative z-10 pt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] mt-1">
          <div className={`flex items-center gap-2 opacity-80 ${tColor}`}>
            <span className="material-symbols-outlined !text-[14px]">
              {t("icon_policy", "policy")}
            </span>
            <span className="text-[9px] font-black uppercase tracking-wider">
              {t("logical_clash", "Logical Clash:")}
            </span>
          </div>
          <span className={`text-[10px] font-medium opacity-80 pl-6 ${tColor}`}>
            {conflict.resolution_note}
          </span>
        </div>
      )}
    </div>
  );
}

const arePropsEqual = (prev: ConflictCardProps, next: ConflictCardProps) => {
  return (
    prev.conflict.mod_pair === next.conflict.mod_pair &&
    prev.tier === next.tier &&
    prev.isSelected === next.isSelected &&
    prev.isSelectedA === next.isSelectedA &&
    prev.isSelectedB === next.isSelectedB
  );
};

export default React.memo(ConflictCardInner, arePropsEqual);
