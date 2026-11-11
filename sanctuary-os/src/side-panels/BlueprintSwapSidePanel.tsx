import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  SidePanel,
  EmptyState,
  ActionPill,
  HoverTooltip,
  SidePanelHeroCard,
  UniversalGroup,
  countBlueprintArtifacts,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { isDesktop } from "../utils/envUtils";
import {
  fetchEncryptedVaultCompanionSnapshots,
  stageFullBlueprintToRigQueue,
  VaultCompanionDesktopBlueprint,
} from "../utils/stagingCrypto";

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
  const {
    playSets,
    activePlaySetIndex,
    setActivePlaySetIndex,
    activeGameSchema,
    modList,
    selectedVersion,
    session,
    setView,
  } = useStore(
    useShallow((s) => ({
      playSets: s.playSets,
      activePlaySetIndex: s.activePlaySetIndex,
      setActivePlaySetIndex: s.setActivePlaySetIndex,
      activeGameSchema: s.activeGameSchema,
      modList: s.modList,
      selectedVersion: s.selectedVersion,
      session: s.session,
      setView: s.setView,
    }))
  );
  const {
    setStagingDraftMode,
    setStagingDraftName,
    setStagingTargetDesktopBlueprint,
    stagingTargetDesktopBlueprint,
  } = useModalStore(
    useShallow((s) => ({
      setStagingDraftMode: s.setStagingDraftMode,
      setStagingDraftName: s.setStagingDraftName,
      setStagingTargetDesktopBlueprint: s.setStagingTargetDesktopBlueprint,
      stagingTargetDesktopBlueprint: s.stagingTargetDesktopBlueprint,
    }))
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [stagingSetName, setStagingSetName] = useState<string | null>(null);
  const [stagedSuccessSetName, setStagedSuccessSetName] = useState<string | null>(null);
  const [companionBlueprints, setCompanionBlueprints] = useState<
    VaultCompanionDesktopBlueprint[]
  >([]);

  useEffect(() => {
    if (!isOpen || isDesktop() || !session?.user?.id) return;
    let active = true;
    fetchEncryptedVaultCompanionSnapshots(session).then((snaps) => {
      if (!active) return;
      const latest = snaps[0];
      if (Array.isArray(latest?.desktopBlueprints)) {
        setCompanionBlueprints(latest.desktopBlueprints);
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen, session?.user?.id]);

  const effectivePlaySets = useMemo(() => {
    if (!isDesktop() && companionBlueprints.length > 0) {
      return companionBlueprints.map((bp) => ({
        name: bp.name,
        code: bp.code,
        isActive: bp.isActive,
        modsCount: bp.modsCount,
        artifacts: bp.artifacts || [],
        mods: bp.artifacts || [],
      }));
    }
    if (Array.isArray(playSets) && playSets.length > 0) {
      return playSets;
    }
    return companionBlueprints.map((bp) => ({
      name: bp.name,
      code: bp.code,
      isActive: bp.isActive,
      modsCount: bp.modsCount,
      artifacts: bp.artifacts || [],
      mods: bp.artifacts || [],
    }));
  }, [playSets, companionBlueprints]);

  const effectiveActiveIndex = useMemo(() => {
    if (!isDesktop()) {
      if (stagingTargetDesktopBlueprint) {
        const targetIdx = effectivePlaySets.findIndex(
          (bp: any) =>
            String(bp?.name || "").toLowerCase() ===
            stagingTargetDesktopBlueprint.toLowerCase()
        );
        if (targetIdx >= 0) return targetIdx;
      }
      const idx = effectivePlaySets.findIndex((bp: any) => bp.isActive);
      return idx >= 0 ? idx : 0;
    }
    return activePlaySetIndex;
  }, [
    playSets,
    activePlaySetIndex,
    effectivePlaySets,
    stagingTargetDesktopBlueprint,
  ]);

  const handleSelect = async (index: number) => {
    const selected = effectivePlaySets[index];
    if (!selected) return;
    if (!isDesktop()) {
      setStagingDraftMode("blueprint");
      setStagingDraftName(selected.name);
      setStagingTargetDesktopBlueprint(selected.name);
      window.dispatchEvent(
        new CustomEvent("sanctuary-select-desktop-blueprint", {
          detail: selected,
        })
      );
      onClose();
      setView("playsets");
      return;
    }
    setActivePlaySetIndex(index);
    if (equipPlaySet && playSets && playSets[index]) {
      await equipPlaySet(playSets[index].name);
    }
  };

  const indexedPlaySets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return effectivePlaySets
      .map((bp: any, index: number) => ({ bp, index }))
      .filter(({ bp }) => {
        if (!q) return true;
        return String(bp?.name || "").toLowerCase().includes(q);
      });
  }, [effectivePlaySets, searchQuery]);

  const activePlaySet = effectivePlaySets?.[effectiveActiveIndex];
  const activeModCount = useMemo(() => {
    if (typeof activePlaySet?.modsCount === "number") {
      return activePlaySet.modsCount;
    }
    return countBlueprintArtifacts(activePlaySet?.mods, activeGameSchema);
  }, [activePlaySet, activeGameSchema]);

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
          badge={`${effectivePlaySets.length} ${t("playsets_title", "{Blueprints}")}`}
          badgeIcon={t("icon_layers", "layers")}
          variant="accent"
        />

        {effectivePlaySets.length > 0 && (
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("nav_search", "Search...")}
          />
        )}

        {effectivePlaySets.length === 0 || indexedPlaySets.length === 0 ? (
          <EmptyState
            icon={t("icon_scan_delete", "scan_delete")}
            title={t("bp_no_blueprints_found", "No {Blueprints} Found")}
          />
        ) : (
          <UniversalGroup
            title={`${t("bp_available_blueprints", "Available {Blueprints}")} (${indexedPlaySets.length})`}
            icon={t("icon_map", "map")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {indexedPlaySets.map(({ bp, index }) => {
                const isActive = effectiveActiveIndex === index;
                const rawName = String(bp.name || "");
                const cleanName =
                  rawName.replace(/\s*\(imported\)\s*$/i, "").trim() || rawName;
                const itemCount =
                  typeof bp.modsCount === "number"
                    ? bp.modsCount
                    : countBlueprintArtifacts(bp.mods, activeGameSchema);

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

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isDesktop() && session?.user?.id && (
                        <button
                          type="button"
                          disabled={stagingSetName === bp.name}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setStagingSetName(bp.name);
                            const res = await stageFullBlueprintToRigQueue(
                              bp,
                              modList || [],
                              activeGameSchema,
                              session,
                              selectedVersion
                            );
                            setStagingSetName(null);
                            if (res.success) {
                              setStagedSuccessSetName(bp.name);
                              setTimeout(() => setStagedSuccessSetName(null), 3500);
                              useStore
                                .getState()
                                .pushStatus(
                                  t(
                                    "status_rig_queue_sent",
                                    "{Blueprint} encrypted and staged to your Rig Queue! Open Signature Queue on your Steam Deck or other PC to deploy."
                                  ),
                                  "success"
                                );
                            } else {
                              useStore
                                .getState()
                                .pushStatus(
                                  res.error || t("err_save_failed", "Failed to save blueprint"),
                                  "error"
                                );
                            }
                          }}
                          className={`relative group/rigbtn w-8 h-8 rounded-xl glass-surface border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                            stagedSuccessSetName === bp.name
                              ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]"
                              : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--accent)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            {stagingSetName === bp.name
                              ? t("icon_sync", "sync")
                              : stagedSuccessSetName === bp.name
                                ? t("icon_check_circle", "check_circle")
                                : t("icon_devices", "devices")}
                          </span>
                          <HoverTooltip
                            className="z-[100] !right-0 !translate-x-0 !left-auto"
                            title={
                              stagedSuccessSetName === bp.name
                                ? t("status_rig_queue_sent", "{Blueprint} Staged to Rig Queue!")
                                : t("action_send_rig_queue", "Send to Rig Queue")
                            }
                            icon={t("icon_devices", "devices")}
                            variant={stagedSuccessSetName === bp.name ? "success" : "accent"}
                          />
                        </button>
                      )}

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
