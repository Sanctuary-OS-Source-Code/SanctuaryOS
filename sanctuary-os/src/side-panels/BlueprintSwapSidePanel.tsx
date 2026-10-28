import { useMemo, useState } from "react";
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

  const activePlaySet = playSets?.[activePlaySetIndex];
  const activeModCount = Array.isArray(activePlaySet?.mods)
    ? activePlaySet.mods.length
    : 0;

  const activeSetName = useMemo(() => {
    if (!activePlaySet?.name) return t("none", "None");
    return (
      String(activePlaySet.name).replace(/\s*\(imported\)\s*$/i, "").trim() ||
      String(activePlaySet.name)
    );
  }, [activePlaySet, t]);

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("playsets_title", "{Blueprints}")}
      subtitle={t("bp_available_blueprints", "Available {Blueprints}")}
      widthClass="w-[90vw] md:w-[760px]"
      icon={t("icon_map", "map")}
      iconColorClass="theme-text-accent"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_map", "map")}
          overline={t("stat_blueprints", "Active {Blueprint}")}
          title={activeSetName}
          description={`${activeModCount} ${t("term_mods", "Items")}`}
          badge={`${(playSets || []).length} ${t("playsets_title", "{Blueprints}")}`}
          badgeIcon={t("icon_layers", "layers")}
          variant="accent"
        />

        {playSets && playSets.length > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("nav_search", "Search...")}
          />
        )}

        {!playSets || indexedPlaySets.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <EmptyState
              icon={t("icon_scan_delete", "scan_delete")}
              title={t("bp_no_blueprints_found", "No {Blueprints} Found")}
            />
          </div>
        ) : (
          <UniversalGroup
            title={`${t("bp_available_blueprints", "Available {Blueprints}")} (${indexedPlaySets.length})`}
            icon={t("icon_map", "map")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    className={`glass-panel rounded-2xl p-3.5 flex items-center justify-between gap-3.5 transition-all duration-200 cursor-pointer border h-full ${
                      isActive
                        ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                          isActive
                            ? "text-[var(--success)]"
                            : "text-[var(--accent)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[20px]">
                          {isActive
                            ? t("icon_verified_user", "verified_user")
                            : t("icon_map", "map")}
                        </span>
                      </div>

                      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                        <div className="relative group/bptitle flex items-center min-w-0 w-fit max-w-full">
                          <span className="text-sm font-black text-[var(--text)] tracking-tight truncate leading-snug">
                            {cleanName}
                          </span>
                          <HoverTooltip
                            className="z-[100]"
                            title={cleanName}
                            icon={
                              isActive
                                ? t("icon_verified_user", "verified_user")
                                : t("icon_map", "map")
                            }
                            variant={isActive ? "success" : "accent"}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--subtext)] opacity-85 truncate">
                          {itemCount} {t("term_mods", "Items")}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(index);
                      }}
                      className={`relative group/actionbtn w-8 h-8 rounded-xl glass-surface border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
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
                            : t("action_equip", "Equip {Blueprint}")
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
