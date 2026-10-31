import { useState, Fragment, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  formatDisplayName,
  HoverTooltip,
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  openModDossier,
} from "../shared";
import { ConflictLoadOrderInfo } from "../ConflictCard";

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

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

const ModNameWithBadge = ({
  name,
  elevatedTierLabel,
  isLoadWinner,
}: {
  name: string;
  elevatedTierLabel?: string;
  isLoadWinner?: boolean;
}) => {
  const { t } = useLexicon();
  const type = extractType(name);
  const cleanName = cleanModName(name);
  const isScript = String(type).toUpperCase().includes("SCRIPT");
  return (
    <div className="flex flex-col gap-1.5 min-w-0 w-full">
      <div className="text-sm font-black text-[var(--text)] break-words whitespace-normal leading-tight">
        {cleanName}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className={VAULT_CHIP_CLASS}>
          <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
            {isScript ? t("icon_code", "code") : t("icon_extension", "extension")}
          </span>
          <span>{type as any}</span>
        </div>
        {elevatedTierLabel && (
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
              {t("icon_low_priority", "low_priority")}
            </span>
            <span>{elevatedTierLabel}</span>
          </div>
        )}
        {isLoadWinner && (
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[11px] text-[var(--success)]">
              {t("icon_verified", "verified")}
            </span>
            <span>{t("lo_status_loads_later_wins", "Loads Later • Wins Override")}</span>
          </div>
        )}
      </div>
    </div>
  );
};

interface ConflictResolutionSidebarProps {
  conflict: any;
  loadOrderInfo?: ConflictLoadOrderInfo;
  onClose: () => void;
  onVault: (modName: string) => void;
  onOverride: (
    winnerName: string,
    modPair: string,
    targetTierFolder?: string,
    loserName?: string
  ) => void;
  onUndo?: (winnerName: string) => void;
  onOpenLoadOrder?: (modName: string) => void;
}

export default function ConflictResolutionSidebar({
  conflict,
  loadOrderInfo,
  onClose,
  onVault,
  onOverride,
  onOpenLoadOrder,
}: ConflictResolutionSidebarProps) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const [selectedMod, setSelectedMod] = useState<string | null>(null);

  const overrideTiers = (
    activeGameSchema?.load_order?.priority_tiers || [
      { id: "tier_1", label: t("lo_role_tier1", "Late Load (Tier 1)"), folder: "Sanctuary", priority: 1000 },
      { id: "tier_2", label: t("lo_role_tier2", "High Priority (Tier 2)"), folder: "Sanctuary2", priority: 1500 },
      { id: "tier_3", label: t("lo_role_tier3", "Final Override (Tier 3)"), folder: "Sanctuary3", priority: 2000 },
    ]
  ).filter((pt: any) => pt.folder && pt.folder.length > 0);

  const defaultOverrideFolder =
    overrideTiers[0]?.folder || "Sanctuary";

  useEffect(() => {
    if (!conflict) return;
    if (loadOrderInfo?.winner === "A") {
      setSelectedMod(conflict.modA);
    } else if (loadOrderInfo?.winner === "B") {
      setSelectedMod(conflict.modB);
    } else {
      setSelectedMod(conflict.modA);
    }
  }, [conflict?.mod_pair, loadOrderInfo?.winner]);

  if (!conflict) return null;

  const sevRank = Number(conflict.severity_rank || 3);
  const isTier4 = sevRank >= 4;
  const isTier3 = sevRank === 3;
  const isTier2 = sevRank === 2;
  const isTier1 = sevRank <= 1;
  const isLoadOrderSoluble = isTier3 || isTier1;

  const applyWinnerChoice = (chosenMod: string) => {
    if (!chosenMod) return;
    const loser = conflict.modA === chosenMod ? conflict.modB : conflict.modA;
    if (isLoadOrderSoluble) {
      onOverride(chosenMod, conflict.mod_pair, defaultOverrideFolder, loser);
    } else {
      onVault(loser);
    }
    onClose();
  };

  const handleConfirmWinner = () => {
    if (!selectedMod) return;
    applyWinnerChoice(selectedMod);
  };

  const heroSubtitle = isTier4
    ? t("tier4_title", "Fatal Clash")?.replace("dY>` ", "") || "Fatal Clash"
    : isTier3
      ? t("tier3_title", "Tuning Overlap")
      : isTier2
        ? t("duplicate_clones", "Duplicate Clones")
        : t("tier1_title", "Visual / Texture Override");

  const heroIcon = isTier4
    ? t("icon_crisis_alert", "crisis_alert")
    : isTier3
      ? t("icon_tune", "tune")
      : isTier2
        ? t("icon_file_copy", "file_copy")
        : t("icon_palette", "palette");

  return (
    <SidePanel
      isOpen={!!conflict}
      onClose={onClose}
      title={t("radar_title", "Conflict Resolution")}
      subtitle={heroSubtitle}
      icon={t("icon_warning", "warning")}
      iconColorClass={
        isTier4
          ? "text-[var(--danger)]"
          : isTier3
            ? "text-[var(--warning)]"
            : "text-[var(--accent)]"
      }
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_check_circle", "check_circle")}
            tooltip={t("btn_set_winner", "Confirm Winner")}
            variant="success"
            disabled={!selectedMod}
            onClick={handleConfirmWinner}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-5 pb-10">
        <SidePanelHeroCard
          overline={t("radar_title", "Conflict Resolution")}
          title={heroSubtitle}
          icon={heroIcon}
          variant={isTier4 ? "danger" : isTier3 ? "warning" : "accent"}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full pt-1">
            <StatBox
              label={t("radar_severity_label", "Severity")}
              value={
                isTier4
                  ? `S4 • ${t("fatal", "Fatal")}`
                  : isTier3
                    ? `S3 • ${t("tuning", "Tuning")}`
                    : isTier2
                      ? `S2 • ${t("clone", "Clone")}`
                      : `S1 • ${t("visual", "Visual")}`
              }
              icon={heroIcon}
              iconColorClass={
                isTier4 ? "text-[var(--danger)]" : isTier3 ? "text-[var(--warning)]" : "text-[var(--accent)]"
              }
            />
            <StatBox
              label={t("type", "Type")}
              value={
                isTier2
                  ? t("duplicate_clones", "Duplicate Clones")
                  : conflict.resolution_note
                    ? t("radar_logical_rule", "Logical Rule")
                    : heroSubtitle
              }
              icon={t("icon_layers", "layers")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("lo_current_winner", "Current Winner")}
              value={
                loadOrderInfo?.winner === "A"
                  ? cleanModName(conflict.modA)
                  : loadOrderInfo?.winner === "B"
                    ? cleanModName(conflict.modB)
                    : t("radar_winner_unresolved", "Unresolved")
              }
              icon={t("icon_verified", "verified")}
              iconColorClass={loadOrderInfo?.winner ? "text-[var(--success)]" : "text-[var(--subtext)]"}
            />
          </div>
          {conflict.resolution_note && (
            <div className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-2.5 mt-1">
              <span
                className={`material-symbols-outlined !text-[16px] shrink-0 mt-0.5 ${
                  isTier4 ? "text-[var(--danger)]" : "text-[var(--warning)]"
                }`}
              >
                {t("icon_policy", "policy")}
              </span>
              <span className="text-xs font-bold text-[var(--text)] opacity-85 leading-relaxed">
                {conflict.resolution_note}
              </span>
            </div>
          )}
        </SidePanelHeroCard>

        {/* 1. Pick a Winner / Resolution Action */}
        <UniversalGroup
          title={
            isLoadOrderSoluble
              ? t("radar_step1_pick_winner", "1. Select Load Order Winner")
              : t("radar_step1_keep_one", "1. Select Winner to Keep")
          }
          icon={t("icon_check_circle", "check_circle")}
        >
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-bold text-[var(--subtext)] opacity-85">
              {isLoadOrderSoluble
                ? t(
                    "radar_step1_winner_desc",
                    "Select the {mod} whose changes should take priority in-game. Sanctuary will promote it so it loads after the rival {mod}."
                  )
                : t(
                    "radar_step1_keep_desc",
                    "Only one of these {mods} should remain active. Select the {mod} you want to keep; the other will be safely moved out of your active {blueprint}."
                  )}
            </p>
            <div className="flex flex-col relative">
              {[conflict.modA, conflict.modB].map((modName, idx) => {
                const isActive = selectedMod === modName;
                const isSideA = idx === 0;
                const isCurrentWinner =
                  isLoadOrderSoluble &&
                  ((isSideA && loadOrderInfo?.winner === "A") ||
                    (!isSideA && loadOrderInfo?.winner === "B"));
                const vsIconColor = isTier4
                  ? "text-[var(--danger)]"
                  : isTier3
                    ? "text-[var(--warning)]"
                    : "text-[var(--accent)]";

                return (
                  <Fragment key={modName}>
                    {idx === 1 && (
                      <div className="relative h-8 flex items-center justify-center z-20 shrink-0">
                        <div className="absolute left-6 right-6 h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] z-10 pointer-events-none" />
                        <div className="relative z-20 px-2.5 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider text-[var(--text)] pointer-events-none">
                          <span className={`material-symbols-outlined !text-[12px] ${vsIconColor}`}>
                            {t("icon_bolt", "bolt")}
                          </span>
                          {t("vs", "VS")}
                        </div>
                      </div>
                    )}
                    <div
                      onClick={() => setSelectedMod(modName)}
                      className={`relative group cursor-pointer w-full rounded-xl p-4 transition-all duration-300 border glass-surface flex items-center gap-4 ${
                        isActive
                          ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)]"
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] transition-all duration-300 ${
                          isActive
                            ? "text-[var(--accent)]"
                            : "text-[var(--subtext)] group-hover:text-[var(--text)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[22px]">
                          {t("icon_extension", "extension")}
                        </span>
                      </div>

                      <div className="flex-1 flex flex-col min-w-0 w-full">
                        <ModNameWithBadge
                          name={modName}
                          isLoadWinner={isCurrentWinner}
                        />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openModDossier(modName);
                          }}
                          className="group/dosbtn relative w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_open_in_new", "open_in_new")}
                          </span>
                          <HoverTooltip title={t("btn_inspect", "Inspect {Mod}")} />
                        </button>
                        {onOpenLoadOrder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenLoadOrder(modName);
                            }}
                            className="group/lopbtn relative w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_low_priority", "low_priority")}
                            </span>
                            <HoverTooltip title={t("lo_configure_mod", "Configure {Mod}")} />
                          </button>
                        )}
                        <div
                          className={`w-9 h-9 rounded-xl glass-surface border flex items-center justify-center shrink-0 transition-all duration-300 ${
                            isActive
                              ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)] text-[var(--accent)]"
                              : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-transparent group-hover:text-[var(--subtext)]"
                          }`}
                        >
                          <span className="material-symbols-outlined font-black !text-base">
                            {t("icon_check", "check")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>

            {selectedMod && (
              <button
                type="button"
                onClick={handleConfirmWinner}
                className="w-full py-3 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-xs font-black uppercase tracking-widest text-[var(--text)] flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">
                  {t("icon_check_circle", "check_circle")}
                </span>
                <span>
                  {isLoadOrderSoluble
                    ? `${t("btn_set_winner", "Set Winner")}: ${cleanModName(selectedMod)}`
                    : `${t("btn_keep_mod", "Keep Winner & Disable Rival")}: ${cleanModName(selectedMod)}`}
                </span>
              </button>
            )}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
