import { useState, Fragment } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  formatDisplayName,
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  SidePanelHeroCard,
  DashboardStatTile,
  UniversalGroup,
} from "../shared";

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

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

const ModNameWithBadge = ({ name }: { name: string }) => {
  const { t } = useLexicon();
  const type = extractType(name);
  const cleanName = cleanModName(name);
  const isScript = String(type).toUpperCase().includes("SCRIPT");
  return (
    <div className="flex flex-col gap-1.5 min-w-0 w-full">
      <div className="text-sm font-black text-[var(--text)] break-words whitespace-normal leading-tight">
        {cleanName}
      </div>
      <div className={`self-start ${VAULT_CHIP_CLASS}`}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
          {isScript ? t("icon_code", "code") : t("icon_extension", "extension")}
        </span>
        <span>{type as any}</span>
      </div>
    </div>
  );
};

interface ConflictResolutionSidebarProps {
  conflict: any;
  onClose: () => void;
  onVault: (modName: string) => void;
  onOverride: (
    winnerName: string,
    modPair: string,
    targetTierFolder?: string,
    loserName?: string
  ) => void;
  onUndo?: (winnerName: string) => void;
}

export default function ConflictResolutionSidebar({
  conflict,
  onClose,
  onVault,
  onOverride,
}: ConflictResolutionSidebarProps) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const [selectedMod, setSelectedMod] = useState<string | null>(null);

  const overrideTiers = (
    activeGameSchema?.load_order?.priority_tiers || [
      { id: "tier_1", label: t("lo_tier_1", "Priority Tier 1"), folder: "Sanctuary", priority: 1000 },
      { id: "tier_2", label: t("lo_tier_2", "Priority Tier 2"), folder: "Sanctuary2", priority: 2000 },
      { id: "tier_3", label: t("lo_tier_3", "Priority Tier 3"), folder: "Sanctuary3", priority: 3000 },
    ]
  ).filter((pt: any) => pt.folder && pt.folder.length > 0);

  const [selectedTierFolder, setSelectedTierFolder] = useState<string>(
    overrideTiers[0]?.folder || "Sanctuary"
  );

  if (!conflict) return null;

  const isTier4 = conflict.severity_rank == 4;
  const isTier3 = conflict.severity_rank == 3;

  const handleConfirmWinner = () => {
    if (!selectedMod) return;
    const loser = conflict.modA === selectedMod ? conflict.modB : conflict.modA;
    if (isTier3) {
      onOverride(selectedMod, conflict.mod_pair, selectedTierFolder, loser);
    } else {
      onVault(loser);
    }
    onClose();
  };

  const heroSubtitle = isTier4
    ? t("tier4_title", "Fatal Clash")?.replace("dY>` ", "") || "Fatal Clash"
    : isTier3
      ? t("tier3_title", "Tuning Overlap")
      : t("duplicate_clones", "Duplicate Clones");

  const heroIcon = isTier4
    ? t("icon_crisis_alert", "crisis_alert")
    : isTier3
      ? t("icon_tune", "tune")
      : t("icon_file_copy", "file_copy");

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
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={heroIcon}
          overline={t("conflict_details", "Conflict Details")}
          title={heroSubtitle}
          description={
            isTier4
              ? t("tier4_desc_winner", "Only ONE of these {mods} can remain active. Choose the winner to keep in your {Blueprint}.")
              : isTier3
                ? t("tier3_desc_winner", "Both {mods} can remain active. Choose the winner to safely override the other in the Sanctuary.")
                : t("identical_assets_winner", "Identical assets detected. Choose the winner to keep in your {Blueprint}.")
          }
          badge={
            conflict.is_ghost
              ? t("logical_clash", "Logical Clash")
              : isTier4
                ? t("fatal_conflict", "Fatal Conflict")
                : t("tier3_conflict", "Tuning Overlap")
          }
          badgeIcon={heroIcon}
          variant={isTier4 ? "danger" : isTier3 ? "warning" : "accent"}
        >
          {conflict.is_ghost && conflict.resolution_note && (
            <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-2.5">
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

        {isTier3 && overrideTiers.length > 1 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {overrideTiers.map((tier: any) => (
              <DashboardStatTile
                key={tier.id || tier.folder}
                variant="filter"
                className="!w-full"
                isActive={selectedTierFolder === tier.folder}
                icon={t("icon_tune", "tune")}
                label={tier.label || tier.folder}
                value={tier.folder}
                onClick={() => setSelectedTierFolder(tier.folder)}
              />
            ))}
          </div>
        )}

        <UniversalGroup
          title={t("bp_select_winning_artifact", "Select Winner")}
          icon={t("icon_check_circle", "check_circle")}
        >
          <div className="flex flex-col relative">
            {[conflict.modA, conflict.modB].map((modName, idx) => {
              const isActive = selectedMod === modName;
              const vsBorderClass = isTier4
                ? "border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)]"
                : isTier3
                  ? "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]"
                  : "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)]";

              return (
                <Fragment key={modName}>
                  {idx === 1 && (
                    <div className="relative h-10 flex items-center justify-center z-20 shrink-0">
                      <div className="absolute left-6 right-6 h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] z-10 pointer-events-none" />
                      <div
                        className={`relative z-20 px-2.5 py-0.5 rounded-full bg-transparent border flex items-center justify-center text-[9px] font-black uppercase tracking-wider pointer-events-none ${vsBorderClass}`}
                      >
                        {t("vs", "VS")}
                      </div>
                    </div>
                  )}
                  <div
                    onClick={() => setSelectedMod(modName)}
                    className={`relative group cursor-pointer w-full rounded-xl p-4 transition-all duration-300 border glass-surface flex items-center gap-4 ${
                      isActive
                        ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)]"
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border bg-transparent transition-all duration-300 ${
                        isActive
                          ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)]"
                          : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] group-hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[22px]">
                        {t("icon_extension", "extension")}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col min-w-0 w-full">
                      <ModNameWithBadge name={modName} />
                    </div>

                    <div
                      className={`w-8 h-8 rounded-full border bg-transparent flex items-center justify-center shrink-0 transition-all duration-300 ${
                        isActive
                          ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)] text-[var(--accent)]"
                          : "border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-transparent group-hover:border-[color-mix(in_srgb,var(--text)_40%,transparent)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[16px] font-black">
                        {t("icon_check", "check")}
                      </span>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
