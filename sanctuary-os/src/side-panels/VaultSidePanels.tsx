import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  CustomDropdown,
  formatDisplayName,
  HoverTooltip,
  ActionButton,
  getModIcon,
  ActionPill,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
  EmptyState,
  VAULT_CHIP_CLASS,
  InlineFilterGroup,
} from "../shared";
import { useStore } from "../store";
import { UniversalCard } from "../components/universal/UniversalCard";
import { formatCleanModTitle } from "./CommandIncompatiblePanel";

export function VaultToolsSidePanel({
  isOpen,
  onClose,
  playSets,
  activePlaySetIndex,
  setActivePlaySetIndex,
  equipPlaySet,
  runRadarSweep,
  finalVisibleMods,
  equipFilter,
  setPurgeTargetFiles,
  activeLocalFolder,
  setActiveLocalFolder,
  setIsLocalFolderEditorOpen,
}: any) {
  const { t } = useLexicon();
  const setIsSidePanelOpen = (val: boolean) => !val && onClose();

  if (!isOpen) return null;

  const localSets = JSON.parse(
    localStorage.getItem(
      `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`
    ) || "[]"
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("vault_tools_title", "{Vault} Tools")}
      subtitle={t("vault_tools_subtitle", "Quick Actions & Folder Controls")}
      icon={t("icon_tune", "tune")}
      iconColorClass="theme-text-accent"
      widthClass="w-[90vw] md:w-[620px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_tune", "tune")}
          overline={t("vault_tools_title", "{Vault} Tools")}
          description={t(
            "vault_tools_subtitle",
            "Switch active Blueprints, trigger a radar sweep, or manage custom local folders."
          )}
          variant="accent"
        />

        {playSets && playSets.length > 0 && (
          <UniversalGroup
            title={t("blueprint", "{Blueprint}")}
            icon={t("icon_layers", "layers")}
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 min-w-0">
                <CustomDropdown
                  disableTint={true}
                  value={activePlaySetIndex}
                  options={playSets.map((set: any, idx: number) => ({
                    id: idx,
                    label: set.name,
                  }))}
                  onChange={(val: any) =>
                    setActivePlaySetIndex && setActivePlaySetIndex(Number(val))
                  }
                />
              </div>
              <ActionButton
                variant="glass"
                icon={t("icon_check_circle", "check_circle")}
                label={t("hub_save", "Equip")}
                onClick={() =>
                  equipPlaySet &&
                  equipPlaySet(playSets[activePlaySetIndex]?.name)
                }
                className="shrink-0 !text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_42%,transparent)]"
              />
            </div>
          </UniversalGroup>
        )}

        <UniversalGroup
          title={t("sidebar_actions", "System Actions")}
          icon={t("icon_bolt", "bolt")}
        >
          <div className="flex flex-col gap-2.5">
            <ActionButton
              variant="glass"
              icon={t("icon_refresh", "refresh")}
              label={t("btn_radar", "Run Radar Sweep")}
              onClick={() => {
                runRadarSweep(true);
                setIsSidePanelOpen(false);
              }}
              className="w-full"
            />
            {equipFilter === "ARCHIVES" && (
              <ActionButton
                variant="glass"
                icon={t("icon_delete_sweep", "delete_sweep")}
                label={t("btn_purge_folder", "{Delete} Archives")}
                onClick={() => {
                  const allFilesToPurge = new Set<string>();
                  finalVisibleMods.forEach((mod: any) => {
                    if (mod && mod.isVirtual && mod.flavors) {
                      mod.flavors.forEach((f: any) => {
                        if (f.name) allFilesToPurge.add(f.name);
                      });
                    } else if (mod && mod.name) {
                      allFilesToPurge.add(mod.name);
                    }
                  });
                  if (allFilesToPurge.size === 0) return;
                  setPurgeTargetFiles(Array.from(allFilesToPurge));
                  setIsSidePanelOpen(false);
                }}
                className="w-full !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
              />
            )}
          </div>
        </UniversalGroup>

        {localSets.length > 0 && (
          <UniversalGroup
            title={t("local_folders", "Local Folders")}
            icon={t("icon_folder", "folder")}
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 min-w-0">
                <CustomDropdown
                  disableTint={true}
                  value={activeLocalFolder || localSets[0]?.id}
                  options={localSets.map((set: any) => ({
                    id: set.id,
                    label: set.name,
                  }))}
                  onChange={(val: any) => setActiveLocalFolder(String(val))}
                />
              </div>
              <ActionButton
                variant="glass"
                icon={t("icon_edit", "edit")}
                label={t("btn_edit", "Edit")}
                onClick={() => {
                  const target = activeLocalFolder || localSets[0]?.id;
                  if (!target) return;
                  setIsLocalFolderEditorOpen(true);
                }}
                className="shrink-0"
              />
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}

export function VaultLocalFolderEditorSidePanel({
  isOpen,
  onClose,
  activeLocalFolder,
  renameFolderInput,
  setRenameFolderInput,
  runRadarSweep,
  displayModList,
}: any) {
  const { t } = useLexicon();
  const { activeGameSchema } = useStore();
  const setIsLocalFolderEditorOpen = (val: boolean) => {
    if (!val) {
      runRadarSweep(true);
      onClose();
    }
  };
  const [searchToAdd, setSearchToAdd] = React.useState("");
  const [, setUpdateTrigger] = React.useState(0);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);

  const searchResults = React.useMemo(() => {
    const q = searchToAdd.trim().toLowerCase();
    if (!isOpen || !q) return [];
    return (displayModList || []).filter((m: any) =>
      (m.displayName || m.name || "").toLowerCase().includes(q)
    );
  }, [isOpen, displayModList, searchToAdd]);

  if (!isOpen) return null;

  const localSets = JSON.parse(
    localStorage.getItem(
      `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`
    ) || "[]"
  );
  const target = activeLocalFolder || localSets[0]?.id;
  const targetSet = localSets.find((s: any) => s.id === target) || {
    id: "default",
    name: "",
    items: [],
    isCollection: false,
    archetypes: { core: null, twins: [], addons: [] },
  };

  if (!targetSet.archetypes) {
    targetSet.archetypes = { core: null, twins: [], addons: [] };
  }

  const typeIcon = targetSet.isCollection
    ? t("icon_category", "category")
    : t("icon_folder", "folder");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={() => setIsLocalFolderEditorOpen(false)}
      title={t("local_folders_edit", "Edit Local Folder")}
      subtitle={t("local_folder_desc", "Group these {mods} locally. This does not affect the global database.")}
      icon={typeIcon}
      iconColorClass={
        targetSet.isCollection ? "text-[var(--accent)]" : "text-[var(--success)]"
      }
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ="z-[115000]"
      panelZ="z-[115001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={deleteConfirm ? t("icon_warning", "warning") : t("icon_delete", "delete")}
            tooltip={
              deleteConfirm
                ? t("btn_confirm_delete", "Confirm {Delete}")
                : t("local_folders_delete", "{Delete} Folder")
            }
            variant="danger"
            onClick={() => {
              if (deleteConfirm) {
                const updatedSets = localSets.filter((s: any) => s.id !== target);
                localStorage.setItem(
                  `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                  JSON.stringify(updatedSets)
                );
                setDeleteConfirm(false);
                setIsLocalFolderEditorOpen(false);
              } else {
                setDeleteConfirm(true);
                setTimeout(() => setDeleteConfirm(false), 3000);
              }
            }}
          />
          <PanelHeaderButton
            icon={t("icon_check", "check")}
            tooltip={t("btn_done", "Done")}
            variant="accent"
            onClick={() => {
              if (deleteConfirm) setDeleteConfirm(false);
              else setIsLocalFolderEditorOpen(false);
            }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-12">
        <SidePanelHeroCard
          icon={typeIcon}
          overline={
            targetSet.isCollection
              ? t("collection", "Collection")
              : t("folder", "Local Folder")
          }
          title={targetSet.name || t("local_folders_edit", "Local Folder")}
          description={t("local_folder_desc", "Group these {mods} locally. This does not affect the global database.")}
          badge={`${targetSet.items.length} ${t("term_mods", "Items")}`}
          badgeIcon={t("icon_inventory_2", "inventory_2")}
          variant={targetSet.isCollection ? "accent" : "success"}
        />

        <div className="grid grid-cols-2 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_folder", "folder")}
            label={t("local_folder_title", "Container Type")}
            value={t("folder", "Folder")}
            isActive={!targetSet.isCollection}
            onClick={() => {
              const updated = localSets.map((s: any) =>
                s.id === target ? { ...s, isCollection: false } : s
              );
              localStorage.setItem(
                `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                JSON.stringify(updated)
              );
              runRadarSweep(true);
              setUpdateTrigger((prev) => prev + 1);
            }}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_category", "category")}
            label={t("local_folder_title", "Container Type")}
            value={t("collection", "Collection")}
            isActive={Boolean(targetSet.isCollection)}
            onClick={() => {
              const updated = localSets.map((s: any) =>
                s.id === target ? { ...s, isCollection: true } : s
              );
              localStorage.setItem(
                `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                JSON.stringify(updated)
              );
              runRadarSweep(true);
              setUpdateTrigger((prev) => prev + 1);
            }}
          />
        </div>

        <UniversalGroup
          title={
            targetSet.isCollection
              ? t("ph_collection_name", "Collection Name")
              : t("ph_folder_name", "Folder Name")
          }
          icon={t("icon_edit_note", "edit_note")}
        >
          <div className="relative">
            <span
              className={`material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 !text-[18px] pointer-events-none ${
                targetSet.isCollection
                  ? "text-[var(--accent)]"
                  : "text-[var(--success)]"
              }`}
            >
              {typeIcon}
            </span>
            <input
              value={renameFolderInput === "" ? targetSet.name : renameFolderInput}
              onChange={(e) => setRenameFolderInput(e.target.value)}
              onBlur={() => {
                const val =
                  renameFolderInput === "" ? targetSet.name : renameFolderInput;
                if (val.trim() && val.trim() !== targetSet.name) {
                  const updated = localSets.map((s: any) =>
                    s.id === target ? { ...s, name: val.trim() } : s
                  );
                  localStorage.setItem(
                    `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                    JSON.stringify(updated)
                  );
                  setRenameFolderInput("");
                  runRadarSweep(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="w-full glass-surface rounded-xl pl-11 pr-4 py-3 text-sm font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
              placeholder={
                targetSet.isCollection
                  ? t("ph_collection_name", "Collection Name...")
                  : t("ph_folder_name", "Folder Name...")
              }
            />
          </div>

          <div className="relative shrink-0 w-full z-[60]">
            <ActionPill
              searchQuery={searchToAdd}
              setSearchQuery={setSearchToAdd}
              searchPlaceholder={t("btn_search", "Search Vault to add...")}
            />

            {searchToAdd.trim() !== "" && (
              <div className="mt-2.5 max-h-72 glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-2xl overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-center text-[var(--subtext)] text-xs font-bold opacity-60">
                    {t("empty_folder", "No matching artifacts found")}
                  </div>
                ) : (
                  Array.from(
                    new Map(searchResults.map((m: any) => [m.hash, m])).values()
                  )
                    .slice(0, 50)
                    .map((m: any) => {
                      const isAdded = targetSet.items.includes(m.hash);
                      if (isAdded) return null;

                      return (
                        <UniversalCard
                          key={m.hash}
                          layout="compact"
                          image={m.image_url || m.imageUrl}
                          icon={getModIcon(m, activeGameSchema, t)}
                          title={formatDisplayName(m.displayName || m.name)}
                          className="glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          actions={
                            targetSet.isCollection ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedSets = localSets.map((s: any) =>
                                    s.id === target
                                      ? { ...s, items: [...s.items, m.hash] }
                                      : s
                                  );
                                  localStorage.setItem(
                                    `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                                    JSON.stringify(updatedSets)
                                  );
                                  setSearchToAdd("");
                                  setUpdateTrigger((prev) => prev + 1);
                                }}
                                className="h-8 px-3 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center justify-center gap-1 shrink-0 text-[10px] font-black uppercase tracking-wider"
                              >
                                <span className="material-symbols-outlined !text-[14px]">
                                  {t("icon_add", "add")}
                                </span>{" "}
                                {t("ql_add", "Add")}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedArch = {
                                      ...targetSet.archetypes,
                                      core: m.hash,
                                    };
                                    const updatedSets = localSets.map((s: any) =>
                                      s.id === target
                                        ? {
                                            ...s,
                                            items: [...s.items, m.hash],
                                            archetypes: updatedArch,
                                          }
                                        : s
                                    );
                                    localStorage.setItem(
                                      `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                                      JSON.stringify(updatedSets)
                                    );
                                    setSearchToAdd("");
                                    setUpdateTrigger((prev) => prev + 1);
                                  }}
                                  className="w-8 h-8 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all flex items-center justify-center relative group/actionbtn"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">
                                    {t("icon_stars", "stars")}
                                  </span>
                                  <HoverTooltip
                                    title={t("tab_core", "Core")}
                                    variant="accent"
                                    className="z-[200] !right-0 !left-auto !translate-x-0"
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedArch = {
                                      ...targetSet.archetypes,
                                      twins: [
                                        ...(targetSet.archetypes?.twins || []),
                                        m.hash,
                                      ],
                                    };
                                    const updatedSets = localSets.map((s: any) =>
                                      s.id === target
                                        ? {
                                            ...s,
                                            items: [...s.items, m.hash],
                                            archetypes: updatedArch,
                                          }
                                        : s
                                    );
                                    localStorage.setItem(
                                      `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                                      JSON.stringify(updatedSets)
                                    );
                                    setSearchToAdd("");
                                    setUpdateTrigger((prev) => prev + 1);
                                  }}
                                  className="w-8 h-8 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] hover:border-[var(--success)] hover:text-[var(--success)] transition-all flex items-center justify-center relative group/actionbtn"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">
                                    {t("icon_join_inner", "join_inner")}
                                  </span>
                                  <HoverTooltip
                                    title={t("editor_twin", "Twin")}
                                    variant="success"
                                    className="z-[200] !right-0 !left-auto !translate-x-0"
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedArch = {
                                      ...targetSet.archetypes,
                                      addons: [
                                        ...(targetSet.archetypes?.addons || []),
                                        m.hash,
                                      ],
                                    };
                                    const updatedSets = localSets.map((s: any) =>
                                      s.id === target
                                        ? {
                                            ...s,
                                            items: [...s.items, m.hash],
                                            archetypes: updatedArch,
                                          }
                                        : s
                                    );
                                    localStorage.setItem(
                                      `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                                      JSON.stringify(updatedSets)
                                    );
                                    setSearchToAdd("");
                                    setUpdateTrigger((prev) => prev + 1);
                                  }}
                                  className="w-8 h-8 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] hover:border-[var(--warning)] hover:text-[var(--warning)] transition-all flex items-center justify-center relative group/actionbtn"
                                >
                                  <span className="material-symbols-outlined !text-[16px]">
                                    {t("icon_extension", "extension")}
                                  </span>
                                  <HoverTooltip
                                    title={t("editor_addon", "Add-On")}
                                    variant="warning"
                                    className="z-[200] !right-0 !left-auto !translate-x-0"
                                  />
                                </button>
                              </div>
                            )
                          }
                        />
                      );
                    })
                )}
              </div>
            )}
          </div>
        </UniversalGroup>

        {targetSet.items.length === 0 ? (
          <EmptyState
            icon={t("icon_inventory_2", "inventory_2")}
            title={t("empty_folder", "Folder is Empty")}
          />
        ) : targetSet.isCollection ? (
          <UniversalGroup
            title={`${t("collection_contents", "Collection Contents")} (${targetSet.items.length})`}
            icon={t("icon_category", "category")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {targetSet.items.map((hash: string) => {
                const art = displayModList.find((m: any) => m.hash === hash);
                if (!art) return null;
                return (
                  <UniversalCard
                    key={hash}
                    layout="vertical-compact"
                    image={art.image_url || art.imageUrl}
                    icon={
                      !art.image_url && !art.imageUrl
                        ? getModIcon(art, activeGameSchema, t)
                        : undefined
                    }
                    title={formatDisplayName(art.displayName || art.name)}
                    className="border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all h-[250px]"
                    actions={
                      <div className="absolute top-2 right-2 pointer-events-auto z-50">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const updatedItems = targetSet.items.filter(
                              (h: string) => h !== hash
                            );
                            const updatedSets = localSets.map((s: any) =>
                              s.id === target
                                ? { ...s, items: updatedItems }
                                : s
                            );
                            localStorage.setItem(
                              `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                              JSON.stringify(updatedSets)
                            );
                            setUpdateTrigger((prev) => prev + 1);
                          }}
                          className="w-8 h-8 rounded-lg text-[var(--danger)] glass-surface border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] transition-all flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            {t("icon_close", "close")}
                          </span>
                        </button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </UniversalGroup>
        ) : (
          <div className="flex flex-col gap-4">
            <UniversalGroup
              title={t("core_artifact", "Core {Mod}")}
              icon={t("icon_stars", "stars")}
              headerColorClass="text-[var(--accent)]"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {targetSet.archetypes?.core ? (
                  (() => {
                    const hash = targetSet.archetypes.core;
                    const art = displayModList.find(
                      (m: any) => m.hash === hash
                    );
                    if (!art) return null;
                    return (
                      <UniversalCard
                        layout="vertical-compact"
                        isActive={true}
                        image={art.image_url || art.imageUrl}
                        icon={
                          !art.image_url && !art.imageUrl
                            ? getModIcon(art, activeGameSchema, t)
                            : undefined
                        }
                        title={formatDisplayName(art.displayName || art.name)}
                        className="border-[color-mix(in_srgb,var(--accent)_35%,transparent)] transition-all h-[250px]"
                        actions={
                          <div className="absolute top-2 right-2 pointer-events-auto z-50">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const updatedArch = {
                                  ...targetSet.archetypes,
                                  core: undefined,
                                };
                                const updatedItems = targetSet.items.filter(
                                  (h: string) => h !== hash
                                );
                                const updatedSets = localSets.map((s: any) =>
                                  s.id === target
                                    ? {
                                        ...s,
                                        items: updatedItems,
                                        archetypes: updatedArch,
                                      }
                                    : s
                                );
                                localStorage.setItem(
                                  `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                                  JSON.stringify(updatedSets)
                                );
                                setUpdateTrigger((prev) => prev + 1);
                              }}
                              className="w-8 h-8 rounded-lg glass-surface text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] transition-all flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined !text-[16px]">
                                {t("icon_close", "close")}
                              </span>
                            </button>
                          </div>
                        }
                      />
                    );
                  })()
                ) : (
                  <div className="col-span-full w-full p-4 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--subtext)] text-xs font-bold text-center">
                    {t("editor_no_core_selected", "No Core Artifact Selected")}
                  </div>
                )}
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("twin_artifacts", "Twin {Mods}")}
              icon={t("icon_join_inner", "join_inner")}
              headerColorClass="text-[var(--success)]"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(!targetSet.archetypes?.twins ||
                  targetSet.archetypes.twins.length === 0) && (
                  <div className="col-span-full w-full p-4 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] text-xs font-bold text-center opacity-70">
                    {t("empty_folder", "Empty")}
                  </div>
                )}
                {(targetSet.archetypes?.twins || []).map((hash: string) => {
                  const art = displayModList.find((m: any) => m.hash === hash);
                  if (!art) return null;
                  return (
                    <UniversalCard
                      key={hash}
                      layout="vertical-compact"
                      image={art.image_url || art.imageUrl}
                      icon={
                        !art.image_url && !art.imageUrl
                          ? getModIcon(art, activeGameSchema, t)
                          : undefined
                      }
                      title={formatDisplayName(art.displayName || art.name)}
                      className="border-[color-mix(in_srgb,var(--success)_35%,transparent)] transition-all h-[250px]"
                      actions={
                        <div className="absolute top-2 right-2 pointer-events-auto z-50">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const updatedArch = {
                                ...targetSet.archetypes,
                                twins: targetSet.archetypes.twins.filter(
                                  (h: string) => h !== hash
                                ),
                              };
                              const updatedItems = targetSet.items.filter(
                                (h: string) => h !== hash
                              );
                              const updatedSets = localSets.map((s: any) =>
                                s.id === target
                                  ? {
                                      ...s,
                                      items: updatedItems,
                                      archetypes: updatedArch,
                                    }
                                  : s
                              );
                              localStorage.setItem(
                                `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                                JSON.stringify(updatedSets)
                              );
                              setUpdateTrigger((prev) => prev + 1);
                            }}
                            className="w-8 h-8 rounded-lg glass-surface text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] transition-all flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_close", "close")}
                            </span>
                          </button>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("addon_artifacts", "Addon {Mods}")}
              icon={t("icon_extension", "extension")}
              headerColorClass="text-[var(--warning)]"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(!targetSet.archetypes?.addons ||
                  targetSet.archetypes.addons.length === 0) && (
                  <div className="col-span-full w-full p-4 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] text-xs font-bold text-center opacity-70">
                    {t("empty_folder", "Empty")}
                  </div>
                )}
                {(targetSet.archetypes?.addons || []).map((hash: string) => {
                  const art = displayModList.find((m: any) => m.hash === hash);
                  if (!art) return null;
                  return (
                    <UniversalCard
                      key={hash}
                      layout="vertical-compact"
                      image={art.image_url || art.imageUrl}
                      icon={
                        !art.image_url && !art.imageUrl
                          ? getModIcon(art, activeGameSchema, t)
                          : undefined
                      }
                      title={formatDisplayName(art.displayName || art.name)}
                      className="border-[color-mix(in_srgb,var(--warning)_35%,transparent)] transition-all h-[250px]"
                      actions={
                        <div className="absolute top-2 right-2 pointer-events-auto z-50">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const updatedArch = {
                                ...targetSet.archetypes,
                                addons: targetSet.archetypes.addons.filter(
                                  (h: string) => h !== hash
                                ),
                              };
                              const updatedItems = targetSet.items.filter(
                                (h: string) => h !== hash
                              );
                              const updatedSets = localSets.map((s: any) =>
                                s.id === target
                                  ? {
                                      ...s,
                                      items: updatedItems,
                                      archetypes: updatedArch,
                                    }
                                  : s
                              );
                              localStorage.setItem(
                                `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`,
                                JSON.stringify(updatedSets)
                              );
                              setUpdateTrigger((prev) => prev + 1);
                            }}
                            className="w-8 h-8 rounded-lg glass-surface text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] transition-all flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              {t("icon_close", "close")}
                            </span>
                          </button>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </UniversalGroup>
          </div>
        )}
      </div>
    </SidePanel>
  );
}

export function formatByteSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val >= 10 || idx === 0 ? Math.round(val) : val.toFixed(1)} ${units[idx]}`;
}

export function normalizeVersionPoolSearch(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[_.\-/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ModVersionBinaryGroup {
  key: string;
  relPath: string;
  fileName: string;
  displayTitle: string;
  isScript: boolean;
  typeLabel: string;
  versions: any[];
  activeVersion: any | null;
  isPinned?: boolean;
  totalBytes: number;
  reclaimableBytes: number;
  latestRecordedAt: number;
  searchIndex: string;
}

export interface ModVersionFamilyEntry {
  key: string;
  displayTitle: string;
  groups: ModVersionBinaryGroup[];
  isMultiModule: boolean;
  isScript: boolean;
  hasPackage: boolean;
  typeLabel: string;
  totalVersions: number;
  maxModuleVersions: number;
  totalBytes: number;
  reclaimableBytes: number;
  isPinned: boolean;
  compatLabel: string;
  isAllLinked: boolean;
  searchIndex: string;
}

export function groupModVersionPoolItems(
  items: any[],
  t: (k: string, f?: string) => string
): ModVersionBinaryGroup[] {
  const map = new Map<string, any[]>();
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item || !item.rel_path) continue;
    const rawRel = String(item.rel_path).replace(/\\/g, "/");
    const fileName = (rawRel.split("/").pop() || rawRel).toLowerCase();
    const arr = map.get(fileName);
    if (arr) {
      arr.push(item);
    } else {
      map.set(fileName, [item]);
    }
  }

  const groups: ModVersionBinaryGroup[] = [];
  map.forEach((rawVersions, key) => {
    // Deduplicate by dna_hash across duplicate subfolder paths, merging metadata
    const byHash = new Map<string, any>();
    for (const v of rawVersions) {
      const h = String(v.dna_hash || "").toLowerCase();
      if (!h) continue;
      const existing = byHash.get(h);
      if (!existing) {
        byHash.set(h, {
          ...v,
          compatible_versions: Array.isArray(v.compatible_versions)
            ? [...v.compatible_versions]
            : [],
        });
      } else {
        if (v.is_active && !existing.is_active) {
          existing.is_active = true;
          existing.rel_path = v.rel_path;
        }
        if (v.is_pinned && !existing.is_pinned) {
          existing.is_pinned = true;
        }
        if (!existing.mod_version && v.mod_version) {
          existing.mod_version = v.mod_version;
        }
        if (Array.isArray(v.compatible_versions)) {
          const mergedCompat = new Set([
            ...(existing.compatible_versions || []),
            ...v.compatible_versions,
          ]);
          existing.compatible_versions = Array.from(mergedCompat);
        }
        if ((Number(v.recorded_at) || 0) > (Number(existing.recorded_at) || 0)) {
          existing.recorded_at = v.recorded_at;
        }
      }
    }

    const versions = Array.from(byHash.values()).sort((a: any, b: any) => {
      const diff = (Number(b.recorded_at) || 0) - (Number(a.recorded_at) || 0);
      if (diff !== 0) return diff;
      if (Boolean(a.is_active) !== Boolean(b.is_active)) {
        return a.is_active ? -1 : 1;
      }
      return 0;
    });
    if (versions.length === 0) return;

    // Enforce at most one active version per binary group
    let foundActive = false;
    for (const v of versions) {
      if (v.is_active) {
        if (!foundActive) {
          foundActive = true;
        } else {
          v.is_active = false;
        }
      }
    }

    const activeVersion =
      versions.find((v: any) => v.is_active) || versions[0] || null;
    const relPath = String(activeVersion?.rel_path || versions[0].rel_path || key);
    const fileName = relPath.split(/[\\/]/).pop() || relPath;
    const isScript = /\.(ts4script|script)$/i.test(fileName);
    const typeLabel = isScript
      ? t("type_script", "Script")
      : t("type_package", "Package");
    const rawDisplay = formatDisplayName(fileName);
    const displayTitle = formatCleanModTitle(rawDisplay) || rawDisplay;

    let totalBytes = 0;
    let reclaimableBytes = 0;
    let latestRecordedAt = 0;
    const versionTokens: string[] = [];

    for (const v of versions) {
      const sz = Number(v.size_bytes) || 0;
      totalBytes += sz;
      if (!v.is_active) reclaimableBytes += sz;
      if ((Number(v.recorded_at) || 0) > latestRecordedAt) {
        latestRecordedAt = Number(v.recorded_at) || 0;
      }
      if (v.mod_version) versionTokens.push(String(v.mod_version));
      if (Array.isArray(v.compatible_versions)) {
        versionTokens.push(...v.compatible_versions.map(String));
      }
    }

    const searchIndex = normalizeVersionPoolSearch(
      `${displayTitle} ${fileName} ${relPath} ${typeLabel} ${versionTokens.join(" ")}`
    );
    const isPinned = versions.some((v: any) => Boolean(v.is_pinned));

    groups.push({
      key,
      relPath,
      fileName,
      displayTitle,
      isScript,
      typeLabel,
      versions,
      activeVersion,
      isPinned,
      totalBytes,
      reclaimableBytes,
      latestRecordedAt,
      searchIndex,
    });
  });

  groups.sort((a, b) => {
    const aMulti = a.versions.length > 1 ? 1 : 0;
    const bMulti = b.versions.length > 1 ? 1 : 0;
    if (bMulti !== aMulti) return bMulti - aMulti;
    if (b.versions.length !== a.versions.length) {
      return b.versions.length - a.versions.length;
    }
    return a.displayTitle.localeCompare(b.displayTitle);
  });

  return groups;
}

export function matchVersionGroupsForMod(
  target: any,
  groups: ModVersionBinaryGroup[]
): ModVersionBinaryGroup[] {
  if (!target || !Array.isArray(groups) || groups.length === 0) return [];
  const names = new Set<string>();
  const baseStems = new Set<string>();
  const hashes = new Set<string>();
  const addCandidate = (m: any) => {
    if (!m) return;
    const raw = String(m.name || m.file || "").replace(/\\/g, "/").toLowerCase();
    if (raw) {
      if (!/^(folder_|set_|local_set_|virtual_)/i.test(raw)) {
        names.add(raw);
        const base = raw.split("/").pop();
        if (base) {
          names.add(base);
          const stem = base
            .replace(/\.(package|ts4script|script|zip|rar|7z)$/i, "")
            .replace(/[_-]+/g, " ")
            .trim();
          if (stem.length >= 3) baseStems.add(stem);
        }
      }
    }
    const disp = String(m.displayName || "")
      .replace(/^(folder_|set_|local_set_|virtual_)/i, "")
      .replace(/\.(package|ts4script|script|zip|rar|7z)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase();
    if (disp.length >= 3 && !Boolean(m.isVirtual || m.isParent)) {
      baseStems.add(disp);
    }
    if (m.hash && !String(m.hash).startsWith("virtual_")) {
      hashes.add(String(m.hash).toLowerCase());
    }
  };
  addCandidate(target);
  if (Array.isArray(target.flavors)) target.flavors.forEach(addCandidate);
  if (Array.isArray(target._groupedModules))
    target._groupedModules.forEach(addCandidate);

  return groups.filter((g) => {
    const rel = String(g.relPath || "").replace(/\\/g, "/").toLowerCase();
    const base = rel.split("/").pop() || rel;
    const stem = base
      .replace(/\.(package|ts4script|script|zip|rar|7z)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
    if (names.has(rel) || names.has(base)) return true;
    if (stem && baseStems.has(stem)) return true;
    return g.versions.some((v: any) =>
      hashes.has(String(v.dna_hash || "").toLowerCase())
    );
  });
}

export function groupBinaryGroupsIntoFamilies(
  allGroups: ModVersionBinaryGroup[],
  displayModList: any[],
  t: (k: string, f?: string) => string
): ModVersionFamilyEntry[] {
  if (!Array.isArray(allGroups) || allGroups.length === 0) return [];

  const assignedKeys = new Set<string>();
  const rawBuckets: { key: string; title: string; groups: ModVersionBinaryGroup[] }[] = [];

  // Tier 1: Match parent suites from displayModList
  if (Array.isArray(displayModList) && displayModList.length > 0) {
    for (const m of displayModList) {
      if (
        !m ||
        !(m.isParent || (m.isVirtual && Array.isArray(m.flavors) && m.flavors.length > 1))
      ) {
        continue;
      }
      const matched = matchVersionGroupsForMod(m, allGroups).filter(
        (g) => !assignedKeys.has(g.key)
      );
      if (matched.length >= 2) {
        matched.forEach((g) => assignedKeys.add(g.key));
        const rawSuiteName = formatDisplayName(m.displayName || m.name || "");
        const cleanSuiteTitle = formatCleanModTitle(rawSuiteName) || rawSuiteName;
        rawBuckets.push({
          key: `suite_${String(m.hash || m.name || cleanSuiteTitle).toLowerCase()}`,
          title: cleanSuiteTitle,
          groups: matched,
        });
      }
    }
  }

  // Tier 2: Group remaining MC Command Center modules together if multiple mc_* binaries exist
  const unassignedAfterSuites = allGroups.filter((g) => !assignedKeys.has(g.key));
  const mcccCandidates = unassignedAfterSuites.filter((g) =>
    /^mc_(cmd_center|career|cas|cheats|cleaner|clubs|control|dresser|gedcom|occult|population|pregnancy|tuner|woohoo)\b/i.test(
      g.fileName
    )
  );
  if (mcccCandidates.length >= 2) {
    mcccCandidates.forEach((g) => assignedKeys.add(g.key));
    const existingMccc = rawBuckets.find((b) =>
      /mc\s*(cmd|command)\s*center/i.test(b.title)
    );
    if (existingMccc) {
      existingMccc.groups.push(...mcccCandidates);
    } else {
      rawBuckets.push({
        key: "suite_mc_command_center",
        title: "MC Command Center",
        groups: mcccCandidates,
      });
    }
  }

  // Tier 3: Group remaining binaries that share the exact same clean displayTitle (e.g. .package + .ts4script pair)
  const byCleanTitle = new Map<string, ModVersionBinaryGroup[]>();
  for (const g of allGroups) {
    if (assignedKeys.has(g.key)) continue;
    const normTitle = g.displayTitle
      .toLowerCase()
      .replace(/\b(script|scripts|package|pkg|core)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const key = normTitle || g.displayTitle.toLowerCase();
    const list = byCleanTitle.get(key);
    if (list) list.push(g);
    else byCleanTitle.set(key, [g]);
  }

  byCleanTitle.forEach((list, normKey) => {
    if (list.length >= 2) {
      list.forEach((g) => assignedKeys.add(g.key));
      rawBuckets.push({
        key: `pair_${normKey}`,
        title: list[0].displayTitle,
        groups: list,
      });
    }
  });

  // Remaining standalone binaries
  for (const g of allGroups) {
    if (assignedKeys.has(g.key)) continue;
    assignedKeys.add(g.key);
    rawBuckets.push({
      key: g.key,
      title: g.displayTitle,
      groups: [g],
    });
  }

  const entries: ModVersionFamilyEntry[] = rawBuckets.map((bucket) => {
    const sortedGroups = [...bucket.groups].sort((a, b) =>
      a.displayTitle.localeCompare(b.displayTitle)
    );
    const isMultiModule = sortedGroups.length > 1;
    const isScript = sortedGroups.some((g) => g.isScript);
    const hasPackage = sortedGroups.some((g) => !g.isScript);
    const typeLabel = isMultiModule
      ? `${sortedGroups.length} ${t("badge_modules_count", "Modules")}`
      : sortedGroups[0].typeLabel;
    const totalVersions = sortedGroups.reduce((s, g) => s + g.versions.length, 0);
    const maxModuleVersions = Math.max(
      0,
      ...sortedGroups.map((g) => g.versions.length)
    );
    const totalBytes = sortedGroups.reduce((s, g) => s + g.totalBytes, 0);
    const reclaimableBytes = sortedGroups.reduce((s, g) => s + g.reclaimableBytes, 0);
    const isPinned = sortedGroups.some((g) => Boolean(g.isPinned));
    const isAllLinked = sortedGroups.every((g) => Boolean(g.activeVersion?.is_active));

    const compatSet = new Set<string>();
    sortedGroups.forEach((g) => {
      const av = g.activeVersion || g.versions[0];
      if (Array.isArray(av?.compatible_versions)) {
        av.compatible_versions.forEach((cv: string) => {
          if (cv && String(cv).trim()) compatSet.add(String(cv).trim());
        });
      }
    });
    const compatLabel =
      compatSet.size > 0 ? Array.from(compatSet).join(", ") : t("any", "Any");

    const searchIndex = normalizeVersionPoolSearch(
      `${bucket.title} ${typeLabel} ${compatLabel} ${sortedGroups
        .map((g) => g.searchIndex)
        .join(" ")}`
    );

    return {
      key: bucket.key,
      displayTitle: bucket.title,
      groups: sortedGroups,
      isMultiModule,
      isScript,
      hasPackage,
      typeLabel,
      totalVersions,
      maxModuleVersions,
      totalBytes,
      reclaimableBytes,
      isPinned,
      compatLabel,
      isAllLinked,
      searchIndex,
    };
  });

  entries.sort((a, b) => {
    const aMultiVer = a.maxModuleVersions > 1 ? 1 : 0;
    const bMultiVer = b.maxModuleVersions > 1 ? 1 : 0;
    if (bMultiVer !== aMultiVer) return bMultiVer - aMultiVer;
    if (a.isMultiModule !== b.isMultiModule) return a.isMultiModule ? -1 : 1;
    if (b.totalVersions !== a.totalVersions) return b.totalVersions - a.totalVersions;
    return a.displayTitle.localeCompare(b.displayTitle);
  });

  return entries;
}

export function ModVersionHistorySidePanel({
  group,
  groups,
  parentTitle,
  isOpen,
  onClose,
  onActivateVersion,
  onActivateBatchVersions,
  onResetToAutoSwap,
  onDeleteVersion,
  onRefresh,
  runRadarSweep,
  setStatus,
}: {
  group?: ModVersionBinaryGroup | null;
  groups?: ModVersionBinaryGroup[];
  parentTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onActivateVersion: (relPath: string, dnaHash: string) => void;
  onActivateBatchVersions?: (targets: { rel_path: string; dna_hash: string }[]) => void;
  onResetToAutoSwap?: (relPaths: string[]) => void;
  onDeleteVersion: (relPath: string, dnaHash: string) => void;
  onRefresh?: () => Promise<void> | void;
  runRadarSweep?: (silent?: boolean, skipSync?: boolean) => void;
  setStatus?: (msg: string) => void;
}) {
  const { t } = useLexicon();
  const resolvedGroups = React.useMemo(() => {
    if (Array.isArray(groups) && groups.length > 0) return groups;
    if (group) return [group];
    return [];
  }, [group, groups]);

  const [selectedSubKey, setSelectedSubKey] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setSelectedSubKey(null);
    } else if (
      selectedSubKey &&
      !resolvedGroups.some((g) => g.key === selectedSubKey)
    ) {
      setSelectedSubKey(null);
    }
  }, [isOpen, resolvedGroups, selectedSubKey]);

  const handleBatchActivate = React.useCallback(
    async (targets: { rel_path: string; dna_hash: string }[]) => {
      if (!targets || targets.length === 0 || isBusy) return;
      if (onActivateBatchVersions) {
        onActivateBatchVersions(targets);
        return;
      }
      setIsBusy(true);
      try {
        let vaultPath = useStore.getState().vaultPath;
        if (!vaultPath) {
          const cfg: any = await invoke("get_saved_coordinates");
          vaultPath = cfg?.vault_path || "";
        }
        if (!vaultPath) return;
        await invoke("activate_archived_mod_versions_batch", {
          vaultPath,
          targets,
        });
        if (onRefresh) await onRefresh();
        if (runRadarSweep) runRadarSweep(true, true);
        if (setStatus) {
          setStatus(
            t(
              "version_pool_toast_family_switched",
              "Switched {Mod} family to selected revision."
            )
          );
        }
      } catch (e) {
        console.warn("Batch version activation failed:", e);
      } finally {
        setIsBusy(false);
      }
    },
    [isBusy, onActivateBatchVersions, onRefresh, runRadarSweep, setStatus, t]
  );

  const handleResetAutoSwap = React.useCallback(
    async (relPaths: string[]) => {
      if (isBusy) return;
      if (onResetToAutoSwap) {
        onResetToAutoSwap(relPaths);
        return;
      }
      setIsBusy(true);
      try {
        let vaultPath = useStore.getState().vaultPath;
        if (!vaultPath) {
          const cfg: any = await invoke("get_saved_coordinates");
          vaultPath = cfg?.vault_path || "";
        }
        if (!vaultPath) return;
        const targetGameVersion = String(
          useStore.getState().selectedVersion || ""
        );
        await invoke("reset_mod_versions_to_auto", {
          vaultPath,
          relPaths,
          targetGameVersion,
        });
        if (onRefresh) await onRefresh();
        if (runRadarSweep) runRadarSweep(true, true);
        if (setStatus) {
          setStatus(
            t(
              "version_pool_toast_auto_swap",
              "Reset {Mod} version routing to automatic game-version matching."
            )
          );
        }
      } catch (e) {
        console.warn("Reset to auto-swap failed:", e);
      } finally {
        setIsBusy(false);
      }
    },
    [isBusy, onResetToAutoSwap, onRefresh, runRadarSweep, setStatus, t]
  );

  if (!isOpen || resolvedGroups.length === 0) return null;

  const isMultiModule = resolvedGroups.length > 1;
  const activeGroup = isMultiModule
    ? resolvedGroups.find((g) => g.key === selectedSubKey) || null
    : resolvedGroups[0];

  const renderSingleGroupTimeline = (
    targetGroup: ModVersionBinaryGroup,
    onClosePanel: () => void,
    backdropZ: string,
    panelZ: string
  ) => {
    const olderCount = targetGroup.versions.filter((v: any) => !v.is_active).length;
    const isTargetPinned = Boolean(
      targetGroup.isPinned ||
        targetGroup.versions.some((v: any) => Boolean(v.is_pinned))
    );
    const isOldRevisionLinked =
      targetGroup.versions.length > 1 && !Boolean(targetGroup.versions[0]?.is_active);

    return (
      <SidePanel
        isOpen={true}
        onClose={onClosePanel}
        backdropZ={backdropZ}
        panelZ={panelZ}
        title={targetGroup.displayTitle}
        subtitle={`${targetGroup.typeLabel} • ${targetGroup.versions.length} ${
          targetGroup.versions.length === 1
            ? t("revision", "Revision")
            : t("revisions", "Revisions")
        }`}
        icon={
          targetGroup.isScript
            ? t("icon_terminal", "terminal")
            : t("icon_history", "history")
        }
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[720px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={
              targetGroup.isScript
                ? t("icon_terminal", "terminal")
                : t("icon_deployed_code", "deployed_code")
            }
            overline={targetGroup.typeLabel}
            title={targetGroup.displayTitle}
            badge={
              isTargetPinned
                ? t("version_pool_badge_manual_pin", "Manual Override")
                : t("version_pool_badge_auto_swap", "Auto-Swap")
            }
            badgeIcon={
              isTargetPinned
                ? t("icon_push_pin", "push_pin")
                : t("icon_autorenew", "autorenew")
            }
            variant="accent"
          >
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <StatBox
                  label={t("revisions", "Revisions")}
                  value={targetGroup.versions.length}
                  icon={t("icon_inventory_2", "inventory_2")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("version_pool_older_versions", "Legacy Versions")}
                  value={olderCount}
                  icon={t("icon_history", "history")}
                  iconColorClass="text-[var(--warning)]"
                />
                <StatBox
                  label={t("version_pool_reclaimable_space", "Reclaimable Space")}
                  value={formatByteSize(targetGroup.reclaimableBytes)}
                  icon={t("icon_cleaning_services", "cleaning_services")}
                  iconColorClass="text-[var(--success)]"
                />
              </div>
              {(isTargetPinned || isOldRevisionLinked) && (
                <div className="flex items-center justify-end pt-1">
                  <ActionButton
                    variant="accent"
                    icon={t("icon_autorenew", "autorenew")}
                    label={t("version_pool_btn_auto_swap", "Auto-Swap Versions")}
                    disabled={isBusy}
                    onClick={() => handleResetAutoSwap([targetGroup.relPath])}
                  />
                </div>
              )}
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={`${t("revisions", "Revisions")} (${
              targetGroup.versions.length
            })`}
            icon={t("icon_history", "history")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {targetGroup.versions.map((item: any, idx: number) => {
                const compatStr =
                  Array.isArray(item.compatible_versions) &&
                  item.compatible_versions.length > 0
                    ? item.compatible_versions.join(", ")
                    : t("any", "Any");
                const verLabel = item.mod_version
                  ? `${t("version", "Version")} ${item.mod_version}`
                  : `${t("revision", "Revision")} #${
                      targetGroup.versions.length - idx
                    }`;
                const recordedDate = item.recorded_at
                  ? new Date(Number(item.recorded_at) * 1000).toLocaleDateString()
                  : t("source_local", "Local");
                const ageLabel =
                  idx === 0
                    ? t("version_pool_newest", "Newest")
                    : idx === targetGroup.versions.length - 1 &&
                        targetGroup.versions.length > 1
                      ? t("version_pool_oldest", "Oldest")
                      : null;
                const innerGhostClass = !item.is_active
                  ? "opacity-50 grayscale group-hover/vercard:opacity-100 group-hover/vercard:grayscale-0 transition-all duration-300"
                  : "";

                return (
                  <div
                    key={`${item.rel_path}-${item.dna_hash}-${idx}`}
                    className={`relative group/vercard flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border transition-all ${
                      item.is_active
                        ? "border-[color-mix(in_srgb,var(--success)_55%,rgba(255,255,255,0.28))] shadow-[0_0_24px_color-mix(in_srgb,var(--success)_14%,transparent)]"
                        : "!border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-solid hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                    }`}
                  >
                    {!item.is_active && (
                      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black/20 group-hover/vercard:bg-transparent transition-colors duration-300" />
                    )}
                    {/* Top Row: Liquid Glass Icon Well + Title & Subtitle */}
                    <div
                      className={`relative z-10 flex items-center gap-3 min-w-0 ${innerGhostClass}`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                          item.is_active
                            ? "text-[var(--success)]"
                            : "text-[var(--accent)]"
                        }`}
                      >
                        <span className="material-symbols-outlined !text-[20px]">
                          {item.is_active
                            ? t("icon_verified_user", "verified_user")
                            : t("icon_history", "history")}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                          {verLabel}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                          {ageLabel && (
                            <>
                              <span className="text-[var(--accent)] shrink-0">
                                {ageLabel}
                              </span>
                              <span className="opacity-40 shrink-0">•</span>
                            </>
                          )}
                          <span className="opacity-85 shrink-0">
                            {recordedDate}
                          </span>
                          <span className="opacity-40 shrink-0">•</span>
                          <span className="opacity-85 shrink-0">
                            {formatByteSize(item.size_bytes || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Status & Action Bar */}
                    <div className="relative z-10 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                      <div
                        className={`flex items-center gap-1.5 min-w-0 flex-wrap ${innerGhostClass}`}
                      >
                        {item.is_active && (
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                              {t("icon_check_circle", "check_circle")}
                            </span>
                            <span>
                              {t("version_pool_badge_linked", "Linked")}
                            </span>
                          </span>
                        )}
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                            {t("icon_sports_esports", "sports_esports")}
                          </span>
                          <span>{compatStr}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        {!item.is_active && (
                          <button
                            type="button"
                            onClick={() =>
                              onActivateVersion(
                                targetGroup.relPath,
                                item.dna_hash
                              )
                            }
                            className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)] text-[var(--success)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                          >
                            <span className="material-symbols-outlined !text-[15px]">
                              {t("icon_check", "check")}
                            </span>
                            <HoverTooltip
                              className="z-[100] !right-0 !translate-x-0 !left-auto"
                              title={t(
                                "version_pool_btn_use_version",
                                "Link Version"
                              )}
                              icon={t("icon_check", "check")}
                            />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onDeleteVersion(targetGroup.relPath, item.dna_hash)
                          }
                          className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined !text-[15px]">
                            {t("icon_delete", "delete")}
                          </span>
                          <HoverTooltip
                            className="z-[100] !right-0 !translate-x-0 !left-auto"
                            title={t("delete", "Delete")}
                            icon={t("icon_delete", "delete")}
                            variant="danger"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    );
  };

  if (!isMultiModule && activeGroup) {
    return renderSingleGroupTimeline(
      activeGroup,
      onClose,
      "z-[120010]",
      "z-[120011]"
    );
  }

  const suiteTitle =
    parentTitle ||
    t("version_pool_title", "{Mod} Version History");
  const totalSuiteOlder = resolvedGroups.reduce(
    (acc, g) => acc + g.versions.filter((v: any) => !v.is_active).length,
    0
  );
  const totalSuiteReclaimable = resolvedGroups.reduce(
    (acc, g) => acc + g.reclaimableBytes,
    0
  );
  const anySuitePinned = resolvedGroups.some(
    (g) => Boolean(g.isPinned) || g.versions.some((v: any) => Boolean(v.is_pinned))
  );
  const maxSuiteRevs = Math.max(
    1,
    ...resolvedGroups.map((g) => g.versions.length)
  );
  const familyRevisions = Array.from({ length: maxSuiteRevs }, (_, stepIdx) => {
    const revNum = maxSuiteRevs - stepIdx;
    const targets: { rel_path: string; dna_hash: string; item: any; group: ModVersionBinaryGroup }[] = [];
    for (const g of resolvedGroups) {
      const picked = g.versions[Math.min(stepIdx, g.versions.length - 1)];
      if (picked) {
        targets.push({
          rel_path: g.relPath,
          dna_hash: picked.dna_hash,
          item: picked,
          group: g,
        });
      }
    }
    const activeCount = targets.filter((x) => Boolean(x.item?.is_active)).length;
    const isAllActive = targets.length > 0 && activeCount === targets.length;
    const totalSize = targets.reduce(
      (acc, x) => acc + (Number(x.item?.size_bytes) || 0),
      0
    );
    const latestEpoch = Math.max(
      0,
      ...targets.map((x) => Number(x.item?.recorded_at) || 0)
    );
    const compatSet = new Set<string>();
    targets.forEach((x) => {
      if (Array.isArray(x.item?.compatible_versions)) {
        x.item.compatible_versions.forEach((cv: string) => {
          if (cv && String(cv).trim()) compatSet.add(String(cv).trim());
        });
      }
    });
    const compatStr =
      compatSet.size > 0 ? Array.from(compatSet).join(", ") : t("any", "Any");

    return {
      stepIdx,
      revNum,
      targets,
      activeCount,
      isAllActive,
      totalSize,
      latestEpoch,
      compatStr,
    };
  });

  const anyOldSuiteRevisionLinked =
    familyRevisions.length > 1 && !Boolean(familyRevisions[0]?.isAllActive);

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        backdropZ="z-[120010]"
        panelZ="z-[120011]"
        title={suiteTitle}
        subtitle={`${resolvedGroups.length} ${t(
          "badge_modules_count",
          "Modules"
        )} • ${
          maxSuiteRevs === 1
            ? `${t("revision", "Revision")} #1`
            : `${maxSuiteRevs} ${t("revisions", "Revisions")}`
        }`}
        icon={t("icon_account_tree", "account_tree")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_account_tree", "account_tree")}
            overline={t("version_pool_title", "{Mod} Version History")}
            title={suiteTitle}
            badge={
              anySuitePinned
                ? t("version_pool_badge_manual_pin", "Manual Override")
                : t("version_pool_badge_auto_swap", "Auto-Swap")
            }
            badgeIcon={
              anySuitePinned
                ? t("icon_push_pin", "push_pin")
                : t("icon_autorenew", "autorenew")
            }
            variant="accent"
          >
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <StatBox
                  label={t("badge_modules_count", "Modules")}
                  value={resolvedGroups.length}
                  icon={t("icon_account_tree", "account_tree")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("version_pool_older_versions", "Legacy Versions")}
                  value={totalSuiteOlder}
                  icon={t("icon_history", "history")}
                  iconColorClass="text-[var(--warning)]"
                />
                <StatBox
                  label={t("version_pool_reclaimable_space", "Reclaimable Space")}
                  value={formatByteSize(totalSuiteReclaimable)}
                  icon={t("icon_cleaning_services", "cleaning_services")}
                  iconColorClass="text-[var(--success)]"
                />
              </div>

              {(anySuitePinned || anyOldSuiteRevisionLinked) && (
                <div className="flex items-center justify-end pt-1">
                  <ActionButton
                    variant="accent"
                    icon={t("icon_autorenew", "autorenew")}
                    label={t("version_pool_btn_auto_swap", "Auto-Swap Versions")}
                    disabled={isBusy}
                    onClick={() =>
                      handleResetAutoSwap(resolvedGroups.map((g) => g.relPath))
                    }
                  />
                </div>
              )}
            </div>
          </SidePanelHeroCard>

          {familyRevisions.length > 1 && (
            <UniversalGroup
              title={`${t("version_pool_family_rollback", "Family Rollback")} (${
                familyRevisions.length
              })`}
              icon={t("icon_history", "history")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {familyRevisions.map((fRev) => {
                  const ageLabel =
                    fRev.stepIdx === 0
                      ? t("version_pool_newest", "Newest")
                      : fRev.stepIdx === familyRevisions.length - 1 &&
                          familyRevisions.length > 1
                        ? t("version_pool_oldest", "Oldest")
                        : null;
                  const recordedDate = fRev.latestEpoch
                    ? new Date(fRev.latestEpoch * 1000).toLocaleDateString()
                    : t("source_local", "Local");
                  const innerGhostClass = !fRev.isAllActive
                    ? "opacity-50 grayscale group-hover/vercard:opacity-100 group-hover/vercard:grayscale-0 transition-all duration-300"
                    : "";

                  return (
                    <div
                      key={`family-rev-${fRev.revNum}`}
                      className={`relative group/vercard flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border transition-all ${
                        fRev.isAllActive
                          ? "border-[color-mix(in_srgb,var(--success)_55%,rgba(255,255,255,0.28))] shadow-[0_0_24px_color-mix(in_srgb,var(--success)_14%,transparent)]"
                          : "!border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:!border-solid hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                      }`}
                    >
                      {!fRev.isAllActive && (
                        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black/20 group-hover/vercard:bg-transparent transition-colors duration-300" />
                      )}

                      <div
                        className={`relative z-10 flex items-center gap-3 min-w-0 ${innerGhostClass}`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 ${
                            fRev.isAllActive
                              ? "text-[var(--success)]"
                              : "text-[var(--accent)]"
                          }`}
                        >
                          <span className="material-symbols-outlined !text-[20px]">
                            {fRev.isAllActive
                              ? t("icon_verified_user", "verified_user")
                              : t("icon_history", "history")}
                          </span>
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate">
                            {`${t(
                              "version_pool_family_revision",
                              "Family Revision"
                            )} #${fRev.revNum}`}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                            {ageLabel && (
                              <>
                                <span className="text-[var(--accent)] shrink-0">
                                  {ageLabel}
                                </span>
                                <span className="opacity-40 shrink-0">•</span>
                              </>
                            )}
                            <span className="opacity-85 shrink-0">
                              {recordedDate}
                            </span>
                            <span className="opacity-40 shrink-0">•</span>
                            <span className="opacity-85 shrink-0">
                              {formatByteSize(fRev.totalSize)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="relative z-10 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                        <div
                          className={`flex items-center gap-1.5 min-w-0 flex-wrap ${innerGhostClass}`}
                        >
                          {fRev.isAllActive ? (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                                {t("icon_check_circle", "check_circle")}
                              </span>
                              <span>
                                {t("version_pool_badge_linked", "Linked")}
                              </span>
                            </span>
                          ) : fRev.activeCount > 0 ? (
                            <span className={VAULT_CHIP_CLASS}>
                              <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                                {t("icon_timelapse", "timelapse")}
                              </span>
                              <span>
                                {`${fRev.activeCount}/${fRev.targets.length} ${t(
                                  "version_pool_badge_linked",
                                  "Linked"
                                )}`}
                              </span>
                            </span>
                          ) : null}
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                              {t("icon_sports_esports", "sports_esports")}
                            </span>
                            <span>{fRev.compatStr}</span>
                          </span>
                        </div>

                        {!fRev.isAllActive && (
                          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleBatchActivate(
                                  fRev.targets.map((x) => ({
                                    rel_path: x.rel_path,
                                    dna_hash: x.dna_hash,
                                  }))
                                )
                              }
                              className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:border-[var(--success)] text-[var(--success)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                            >
                              <span className="material-symbols-outlined !text-[15px]">
                                {t("icon_check", "check")}
                              </span>
                              <HoverTooltip
                                className="z-[100] !right-0 !translate-x-0 !left-auto"
                                title={t(
                                  "version_pool_btn_use_version",
                                  "Link Version"
                                )}
                                icon={t("icon_check", "check")}
                              />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </UniversalGroup>
          )}

          <UniversalGroup
            title={`${t("badge_modules_count", "Modules")} (${
              resolvedGroups.length
            })`}
            icon={t("icon_account_tree", "account_tree")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {resolvedGroups.map((g) => {
                const activeVer = g.activeVersion || g.versions[0];
                const compatStr =
                  Array.isArray(activeVer?.compatible_versions) &&
                  activeVer.compatible_versions.length > 0
                    ? activeVer.compatible_versions.join(", ")
                    : t("any", "Any");
                const isLinked = Boolean(activeVer?.is_active);
                const activeIdx = g.versions.findIndex((v: any) => v.is_active);
                const activeRevNum =
                  activeIdx >= 0 ? g.versions.length - activeIdx : g.versions.length;

                return (
                  <div
                    key={g.key}
                    onClick={() => setSelectedSubKey(g.key)}
                    className="flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] transition-all cursor-pointer group"
                  >
                    {/* Top Row: Liquid Glass Icon Well + Title & Subtitle */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                        <span className="material-symbols-outlined !text-[20px]">
                          {g.isScript
                            ? t("icon_terminal", "terminal")
                            : t("icon_deployed_code", "deployed_code")}
                        </span>
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-sm font-black text-[var(--text)] tracking-tight leading-snug truncate group-hover:text-[var(--accent)] transition-colors">
                          {g.displayTitle}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                          <span className="opacity-85 shrink-0">
                            {g.typeLabel}
                          </span>
                          <span className="opacity-40 shrink-0">•</span>
                          <span className="text-[var(--accent)] shrink-0">
                            {`${t("revision", "Revision")} #${activeRevNum}/${
                              g.versions.length
                            }`}
                          </span>
                          <span className="opacity-40 shrink-0">•</span>
                          <span className="opacity-85 shrink-0">
                            {formatByteSize(g.totalBytes)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Status & Action Bar */}
                    <div className="relative z-10 pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        {isLinked && (
                          <span className={VAULT_CHIP_CLASS}>
                            <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                              {t("icon_check_circle", "check_circle")}
                            </span>
                            <span>
                              {t("version_pool_badge_linked", "Linked")}
                            </span>
                          </span>
                        )}
                        <span className={VAULT_CHIP_CLASS}>
                          <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                            {t("icon_sports_esports", "sports_esports")}
                          </span>
                          <span>{compatStr}</span>
                        </span>
                      </div>

                      <div className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover:border-[var(--accent)] text-[var(--subtext)] group-hover:text-[var(--accent)] flex items-center justify-center transition-all shrink-0 ml-auto">
                        <span className="material-symbols-outlined !text-[15px]">
                          {t("icon_open_in_new", "open_in_new")}
                        </span>
                        <HoverTooltip
                          className="z-[100] !right-0 !translate-x-0 !left-auto"
                          title={t(
                            "version_pool_view_versions",
                            "View Versions"
                          )}
                          icon={t("icon_history", "history")}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      {activeGroup &&
        renderSingleGroupTimeline(
          activeGroup,
          () => setSelectedSubKey(null),
          "z-[120012]",
          "z-[120013]"
        )}
    </>
  );
}

export function VaultVersionPoolSidePanel({
  isOpen,
  onClose,
  runRadarSweep,
  setStatus,
  displayModList = [],
}: any) {
  const { t } = useLexicon();
  const [poolStatus, setPoolStatus] = React.useState<any>({
    enabled: true,
    total_bytes: 0,
    reclaimable_bytes: 0,
    total_versions: 0,
    older_versions: 0,
    items: [],
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [typeFilter, setTypeFilter] = React.useState<"ALL" | "SCRIPT" | "PACKAGE">("ALL");
  const [versionCountFilter, setVersionCountFilter] = React.useState<"ALL" | "MULTI">("ALL");
  const [visibleCount, setVisibleCount] = React.useState(40);
  const [selectedFamilyKey, setSelectedFamilyKey] = React.useState<string | null>(null);

  const loadPoolStatus = React.useCallback(async () => {
    setIsLoading(true);
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (vaultPath) {
        const res: any = await invoke("get_mod_version_pool_status", { vaultPath });
        if (res) setPoolStatus(res);
      }
    } catch (e) {
      console.warn("Failed to load mod version pool status:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      setVisibleCount(40);
      loadPoolStatus();
    } else {
      setSelectedFamilyKey(null);
    }
  }, [isOpen, loadPoolStatus]);

  React.useEffect(() => {
    setVisibleCount(40);
  }, [deferredSearchQuery, typeFilter, versionCountFilter]);

  const handleToggleAutoArchive = async () => {
    const nextVal = !poolStatus.enabled;
    setPoolStatus((prev: any) => ({ ...prev, enabled: nextVal }));
    localStorage.setItem("sanctuary_archive_mod_versions", nextVal ? "true" : "false");
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (vaultPath) {
        await invoke("set_mod_version_archiving_enabled", {
          vaultPath,
          enabled: nextVal,
        });
      }
    } catch {}
  };

  const handlePruneVersions = async (keepActiveOnly: boolean) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("prune_archived_mod_versions", {
        vaultPath,
        keepActiveOnly,
      });
      await loadPoolStatus();
      if (setStatus) {
        setStatus(t("version_pool_prune_older", "Purge Legacy Versions"));
      }
    } catch {}
  };

  const handleResetAllAutoSwap = async () => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      const targetGameVersion = String(useStore.getState().selectedVersion || "");
      await invoke("reset_mod_versions_to_auto", {
        vaultPath,
        relPaths: null,
        targetGameVersion,
      });
      await loadPoolStatus();
      if (runRadarSweep) runRadarSweep(true, true);
      if (setStatus) {
        setStatus(
          t(
            "version_pool_toast_auto_swap",
            "Reset {Mod} version routing to automatic game-version matching."
          )
        );
      }
    } catch {}
  };

  const handleDeleteVersion = async (relPath: string, dnaHash: string) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("delete_archived_mod_version", {
        vaultPath,
        relPath,
        dnaHash,
      });
      await loadPoolStatus();
    } catch {}
  };

  const handleActivateVersion = async (relPath: string, dnaHash: string) => {
    try {
      let vaultPath = useStore.getState().vaultPath;
      if (!vaultPath) {
        const cfg: any = await invoke("get_saved_coordinates");
        vaultPath = cfg?.vault_path || "";
      }
      if (!vaultPath) return;
      await invoke("activate_archived_mod_version", {
        vaultPath,
        relPath,
        dnaHash,
      });
      await loadPoolStatus();
      if (runRadarSweep) runRadarSweep(true, true);
    } catch {}
  };

  const allGroups = React.useMemo(
    () => groupModVersionPoolItems(poolStatus.items, t),
    [poolStatus.items, t]
  );

  const allFamilies = React.useMemo(
    () => groupBinaryGroupsIntoFamilies(allGroups, displayModList, t),
    [allGroups, displayModList, t]
  );

  const anyVaultPinned = React.useMemo(
    () => allFamilies.some((f) => f.isPinned),
    [allFamilies]
  );

  const filteredFamilies = React.useMemo(() => {
    const qNorm = normalizeVersionPoolSearch(deferredSearchQuery);
    const qTokens = qNorm ? qNorm.split(" ").filter(Boolean) : [];

    return allFamilies.filter((fam) => {
      if (typeFilter === "SCRIPT" && !fam.isScript) return false;
      if (typeFilter === "PACKAGE" && !fam.hasPackage) return false;
      if (versionCountFilter === "MULTI" && fam.maxModuleVersions < 2) return false;
      if (qTokens.length > 0) {
        for (const tok of qTokens) {
          if (!fam.searchIndex.includes(tok)) return false;
        }
      }
      return true;
    });
  }, [allFamilies, deferredSearchQuery, typeFilter, versionCountFilter]);

  const visibleFamilies = React.useMemo(
    () => filteredFamilies.slice(0, visibleCount),
    [filteredFamilies, visibleCount]
  );

  const selectedFamily = React.useMemo(
    () =>
      selectedFamilyKey
        ? allFamilies.find((f) => f.key === selectedFamilyKey) || null
        : null,
    [allFamilies, selectedFamilyKey]
  );

  if (!isOpen) return null;

  const hasActiveFilters =
    typeFilter !== "ALL" || versionCountFilter !== "ALL" || searchQuery.trim() !== "";

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        backdropZ="z-[115000]"
        panelZ="z-[115001]"
        title={t("version_pool_title", "{Mod} Version History")}
        subtitle={t(
          "version_pool_subtitle",
          "Manage {mod} version history and automatic game version swapping"
        )}
        icon={t("icon_history", "history")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_history", "history")}
            overline={t("version_pool_title", "{Mod} Version History")}
            title={t(
              "version_pool_subtitle",
              "Manage {mod} version history and automatic game version swapping"
            )}
            badge={`${allFamilies.length} ${t("term_mods", "{Mods}")}`}
            badgeIcon={t("icon_inventory_2", "inventory_2")}
            variant="accent"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <StatBox
                label={t("term_mods", "{Mods}")}
                value={allFamilies.length}
                icon={t("icon_inventory_2", "inventory_2")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("version_pool_older_versions", "Legacy Versions")}
                value={poolStatus.older_versions || 0}
                icon={t("icon_history", "history")}
                iconColorClass="text-[var(--warning)]"
              />
              <StatBox
                label={t("version_pool_reclaimable_space", "Reclaimable Space")}
                value={formatByteSize(poolStatus.reclaimable_bytes || 0)}
                icon={t("icon_cleaning_services", "cleaning_services")}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("settings", "Settings")}
            icon={t("icon_tune", "tune")}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-black text-[var(--text)]">
                    {t("version_pool_auto_archive", "Version History System")}
                  </span>
                  <span className="text-[11px] font-medium text-[var(--subtext)]">
                    {t(
                      "version_pool_auto_archive_desc",
                      "When enabled, keeps multiple {mod} versions for rollback and auto-swapping. When disabled, keeps only one version."
                    )}
                  </span>
                </div>
                <ActionButton
                  variant="glass"
                  icon={
                    poolStatus.enabled
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_block", "block")
                  }
                  label={
                    poolStatus.enabled
                      ? t("enabled", "Enabled")
                      : t("disabled", "Disabled")
                  }
                  onClick={handleToggleAutoArchive}
                  className={
                    poolStatus.enabled
                      ? "shrink-0 !text-[var(--success)] !border-[color-mix(in_srgb,var(--success)_40%,transparent)]"
                      : "shrink-0 !text-[var(--subtext)]"
                  }
                />
              </div>

              {!poolStatus.enabled && (poolStatus.older_versions || 0) > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="material-symbols-outlined !text-[18px] text-[var(--warning)] shrink-0 mt-0.5">
                      {t("icon_warning", "warning")}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-bold text-[var(--text)] leading-snug">
                        {t(
                          "version_pool_disabled_legacy_warning",
                          "Version History System is disabled, but legacy versions are still stored. Purge legacy versions to keep only one version per {mod}."
                        )}
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--warning)]">
                        {`${poolStatus.older_versions || 0} ${t(
                          "version_pool_older_versions",
                          "Legacy Versions"
                        )} • ${formatByteSize(poolStatus.reclaimable_bytes || 0)}`}
                      </span>
                    </div>
                  </div>
                  <ActionButton
                    variant="glass"
                    icon={t("icon_cleaning_services", "cleaning_services")}
                    label={t("version_pool_prune_older", "Purge Legacy Versions")}
                    onClick={() => handlePruneVersions(true)}
                    className="shrink-0 !text-[var(--warning)] !border-[color-mix(in_srgb,var(--warning)_45%,transparent)]"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <ActionButton
                  variant={anyVaultPinned ? "accent" : "glass"}
                  icon={t("icon_autorenew", "autorenew")}
                  label={t("version_pool_btn_auto_swap", "Auto-Swap Versions")}
                  disabled={!poolStatus.total_versions}
                  onClick={handleResetAllAutoSwap}
                  className="w-full"
                />
                <ActionButton
                  variant="glass"
                  icon={t("icon_cleaning_services", "cleaning_services")}
                  label={`${t("version_pool_prune_older", "Purge Legacy Versions")} (${formatByteSize(
                    poolStatus.reclaimable_bytes || 0
                  )})`}
                  disabled={!poolStatus.older_versions}
                  onClick={() => handlePruneVersions(true)}
                  className="w-full !text-[var(--danger)] !border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
                />
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={`${t("term_mods", "{Mods}")} (${filteredFamilies.length})`}
            icon={t("icon_inventory_2", "inventory_2")}
          >
            <div className="flex flex-col gap-3">
              <ActionPill
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchPlaceholder={t("search_ph", "Search {mods}...")}
                primaryPopover={{
                  icon: t("icon_tune", "tune"),
                  label: t("filters", "Filters"),
                  content: (
                    <div className="flex flex-col gap-4 w-[300px] p-2">
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                          {t("filter_category", "Filter Category")}
                        </span>
                        <InlineFilterGroup
                          value={typeFilter}
                          onChange={(v) => setTypeFilter(v as any)}
                          options={[
                            { id: "ALL", label: t("filter_all", "All") },
                            { id: "SCRIPT", label: t("type_script", "Script") },
                            { id: "PACKAGE", label: t("type_package", "Package") },
                          ]}
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">
                          {t("revisions", "Revisions")}
                        </span>
                        <InlineFilterGroup
                          value={versionCountFilter}
                          onChange={(v) => setVersionCountFilter(v as any)}
                          options={[
                            { id: "ALL", label: t("filter_all", "All") },
                            {
                              id: "MULTI",
                              label: t("version_pool_filter_multi", "2+ Versions"),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  ),
                }}
                actions={
                  hasActiveFilters
                    ? [
                        {
                          id: "clear_filters",
                          icon: t("icon_close", "close"),
                          label: t("clear", "Clear"),
                          onClick: () => {
                            setSearchQuery("");
                            setTypeFilter("ALL");
                            setVersionCountFilter("ALL");
                          },
                        },
                      ]
                    : undefined
                }
              />

              {!isLoading && filteredFamilies.length === 0 ? (
                <EmptyState
                  icon={t("icon_history", "history")}
                  title={t("version_pool_empty_title", "No Archived {Mod} Versions")}
                  subtitle={t(
                    "version_pool_empty_desc",
                    "Archived {mod} versions appear here when {mods} are updated or synced."
                  )}
                />
              ) : (
                <div className="max-h-[460px] overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visibleFamilies.map((fam) => {
                      return (
                        <div
                          key={fam.key}
                          onClick={() => setSelectedFamilyKey(fam.key)}
                          className="flex flex-col justify-between gap-3 p-3.5 glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all cursor-pointer group/vcard"
                        >
                          {/* Top Row: Liquid Glass Icon Well + Title & Subtitle */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                              <span className="material-symbols-outlined !text-[20px]">
                                {fam.isMultiModule
                                  ? t("icon_account_tree", "account_tree")
                                  : fam.isScript
                                    ? t("icon_terminal", "terminal")
                                    : t("icon_deployed_code", "deployed_code")}
                              </span>
                            </div>

                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-sm font-black text-[var(--text)] group-hover/vcard:text-[var(--accent)] transition-colors tracking-tight leading-snug truncate">
                                {fam.displayTitle}
                              </span>
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--subtext)] min-w-0">
                                <span className="opacity-85 shrink-0">{fam.typeLabel}</span>
                                <span className="opacity-40 shrink-0">•</span>
                                <span className="text-[var(--accent)] shrink-0">
                                  {fam.maxModuleVersions === 1
                                    ? `${t("revision", "Revision")} #1`
                                    : `${fam.maxModuleVersions} ${t("revisions", "Revisions")}`}
                                </span>
                                <span className="opacity-40 shrink-0">•</span>
                                <span className="opacity-85 shrink-0">
                                  {formatByteSize(fam.totalBytes)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Bottom Status & Action Bar */}
                          <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              {fam.isAllLinked && (
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--success)]">
                                    {t("icon_check_circle", "check_circle")}
                                  </span>
                                  <span>{t("version_pool_badge_linked", "Linked")}</span>
                                </span>
                              )}
                              {fam.isPinned && (
                                <span className={VAULT_CHIP_CLASS}>
                                  <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--warning)]">
                                    {t("icon_push_pin", "push_pin")}
                                  </span>
                                  <span>
                                    {t("version_pool_badge_manual_pin", "Manual Override")}
                                  </span>
                                </span>
                              )}
                              <span className={VAULT_CHIP_CLASS}>
                                <span className="material-symbols-outlined !text-[12px] shrink-0 text-[var(--accent)]">
                                  {t("icon_sports_esports", "sports_esports")}
                                </span>
                                <span>{fam.compatLabel}</span>
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedFamilyKey(fam.key);
                                }}
                                className="relative group/actionbtn w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] group-hover/vcard:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--subtext)] group-hover/vcard:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                              >
                                <span className="material-symbols-outlined !text-[15px]">
                                  {t("icon_history", "history")}
                                </span>
                                <HoverTooltip
                                  className="z-[100] !right-0 !translate-x-0 !left-auto"
                                  title={t("version_pool_view_versions", "Inspect Versions")}
                                  icon={t("icon_history", "history")}
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredFamilies.length > visibleCount && (
                    <ActionButton
                      variant="glass"
                      icon={t("icon_expand_more", "expand_more")}
                      label={`${t("next", "Next")} (${
                        filteredFamilies.length - visibleCount
                      })`}
                      onClick={() => setVisibleCount((prev) => prev + 40)}
                      className="w-full justify-center"
                    />
                  )}
                </div>
              )}
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      <ModVersionHistorySidePanel
        groups={selectedFamily?.groups || []}
        parentTitle={selectedFamily?.displayTitle}
        isOpen={Boolean(selectedFamily)}
        onClose={() => setSelectedFamilyKey(null)}
        onActivateVersion={handleActivateVersion}
        onDeleteVersion={handleDeleteVersion}
        onRefresh={loadPoolStatus}
        runRadarSweep={runRadarSweep}
        setStatus={setStatus}
      />
    </>
  );
}
