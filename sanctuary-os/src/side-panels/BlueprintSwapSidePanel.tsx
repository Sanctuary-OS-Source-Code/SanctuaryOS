import React, { useMemo, useState } from "react";
import {
  SidePanel,
  EmptyState,
  ActionPill,
  HoverTooltip,
  SidePanelHeroCard,
  UniversalGroup,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";

interface BlueprintSwapSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  equipPlaySet?: (setName: string) => Promise<any> | void;
}

export default function BlueprintSwapSidePanel({
  isOpen,
  onClose,
  equipPlaySet,
}: BlueprintSwapSidePanelProps) {
  const { t } = useLexicon();
  const { playSets, activePlaySetIndex, setActivePlaySetIndex } = useStore();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelect = async (index: number) => {
    setActivePlaySetIndex(index);
    if (equipPlaySet && playSets && playSets[index]) {
      await equipPlaySet(playSets[index].name);
    }
  };

  const indexedPlaySets = useMemo(() => {
    const safe = Array.isArray(playSets) ? playSets : [];
    const q = searchQuery.trim().toLowerCase();
    return safe
      .map((bp: any, index: number) => ({ bp, index }))
      .filter(({ bp }) => {
        if (!q) return true;
        return String(bp?.name || "").toLowerCase().includes(q);
      });
  }, [playSets, searchQuery]);

  const activeSetName = useMemo(() => {
    const active = playSets?.[activePlaySetIndex];
    if (!active?.name) return t("none", "None");
    return (
      String(active.name).replace(/\s*\(imported\)\s*$/i, "").trim() ||
      String(active.name)
    );
  }, [playSets, activePlaySetIndex, t]);

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("playsets_title", "Blueprints")}
      subtitle={t("bp_available_blueprints", "Available Blueprints")}
      widthClass="w-[90vw] md:w-[760px]"
      icon={t("icon_map", "map")}
      iconColorClass="theme-text-accent"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_map", "map")}
          overline={t("playsets_title", "Blueprints")}
          title={activeSetName}
          description={t(
            "bp_available_blueprints",
            "Switch active mod loadouts and synchronize your Vault deployment."
          )}
          badge={`${(playSets || []).length} ${t("items", "Items")}`}
          badgeIcon={t("icon_layers", "layers")}
          variant="accent"
        />

        {playSets && playSets.length > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("ui_placeholder_search", "Search...")}
          />
        )}

        {!playSets || indexedPlaySets.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <EmptyState
              icon={t("icon_scan_delete", "scan_delete")}
              title={t("bp_no_blueprints_found", "No Blueprints Found")}
            />
          </div>
        ) : (
          <UniversalGroup
            title={`${t("bp_available_blueprints", "Available Blueprints")} (${indexedPlaySets.length})`}
            icon={t("icon_map", "map")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              {indexedPlaySets.map(({ bp, index }) => {
                const isActive = activePlaySetIndex === index;
                const rawName = String(bp.name || "");
                const cleanName =
                  rawName.replace(/\s*\(imported\)\s*$/i, "").trim() || rawName;
                const itemCount = bp.mods?.length || 0;

                return (
                  <div
                    key={bp.name}
                    onClick={() => handleSelect(index)}
                    className={`glass-surface rounded-xl p-4 flex items-center gap-3.5 transition-all duration-200 cursor-pointer border ${
                      isActive
                        ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl bg-transparent border flex items-center justify-center shrink-0 ${
                        isActive
                          ? "border-[color-mix(in_srgb,var(--success)_42%,transparent)] text-[var(--success)]"
                          : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[20px]">
                        {isActive
                          ? t("icon_verified_user", "verified_user")
                          : t("icon_map", "map")}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-bold text-[var(--text)] tracking-tight truncate leading-snug">
                        {cleanName}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--subtext)] mt-0.5">
                        <span>
                          {itemCount} {t("items", "Items")}
                        </span>
                        {isActive && (
                          <>
                            <span className="opacity-40">•</span>
                            <span className="text-[var(--success)] font-bold">
                              {t("active", "Active")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(index);
                      }}
                      className={`relative group/actionbtn w-8 h-8 rounded-lg bg-transparent border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                        isActive
                          ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                          : "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:border-[var(--accent)]"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {isActive
                          ? t("icon_check", "check")
                          : t("icon_swap_horiz", "swap_horiz")}
                      </span>
                      <HoverTooltip
                        className="z-[100] !right-0 !translate-x-0 !left-auto"
                        title={
                          isActive
                            ? t("active", "Active")
                            : t("action_equip", "Equip Blueprint")
                        }
                        icon={
                          isActive
                            ? t("icon_verified_user", "verified_user")
                            : t("icon_swap_horiz", "swap_horiz")
                        }
                        variant={isActive ? "success" : "accent"}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
