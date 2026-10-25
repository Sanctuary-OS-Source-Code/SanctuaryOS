import React from "react";
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
  UniversalGroup,
} from "../shared";
import { useStore } from "../store";
import { UniversalCard } from "../components/universal/UniversalCard";

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

  const localSets = JSON.parse(
    localStorage.getItem(
      `sanctuary_${useStore.getState().activeWorkspaceId}_playsets`
    ) || "[]"
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      keepMounted={true}
      title={t("vault_tools_title", "Vault Tools")}
      subtitle={t("vault_tools_subtitle", "Quick Actions & Folder Controls")}
      icon="tune"
      iconColorClass="theme-text-accent"
      widthClass="w-[90vw] md:w-[620px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon="tune"
          overline={t("vault_tools_title", "Vault Operations")}
          description={t(
            "vault_tools_subtitle",
            "Switch active Blueprints, trigger a radar sweep, or manage custom local folders."
          )}
          variant="accent"
        />

        {playSets && playSets.length > 0 && (
          <UniversalGroup
            title={t("type_blueprint", "Active Blueprint")}
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
                label={t("auto_save", "Equip")}
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
              icon="refresh"
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
                icon="delete_sweep"
                label={t("btn_purge_folder", "Purge Archives")}
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

  const typeIcon = targetSet.isCollection ? "category" : "folder";

  const searchResults = (displayModList || []).filter((m: any) =>
    (m.displayName || m.name || "")
      .toLowerCase()
      .includes(searchToAdd.toLowerCase())
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={() => setIsLocalFolderEditorOpen(false)}
      keepMounted={true}
      title={t("local_folders_edit", "Edit Local Folder")}
      subtitle={t("local_folder_desc", "Manage grouped Vault packages")}
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
            icon={deleteConfirm ? "warning" : "delete"}
            tooltip={
              deleteConfirm
                ? t("btn_confirm_delete", "Confirm Delete")
                : t("local_folders_delete", "Delete Folder")
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
            icon="check"
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
          description={t(
            "local_folder_desc",
            "Assign core, twin, and add-on modules or manage collection members."
          )}
          badge={`${targetSet.items.length} ${t("items", "Items")}`}
          badgeIcon={t("icon_inventory_2", "inventory_2")}
          variant={targetSet.isCollection ? "accent" : "success"}
        />

        <div className="grid grid-cols-2 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon="folder"
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
            icon="category"
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
          icon="edit_note"
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
                                  add
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
                                    stars
                                  </span>
                                  <HoverTooltip
                                    title={t("editor_core", "Core")}
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
                                    join_inner
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
                                    extension
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
          <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center gap-2 text-[var(--subtext)] opacity-70">
            <span className="material-symbols-outlined !text-[28px]">
              inventory_2
            </span>
            <span className="text-xs font-bold uppercase tracking-widest">
              {t("empty_folder", "Folder is Empty")}
            </span>
          </div>
        ) : targetSet.isCollection ? (
          <UniversalGroup
            title={`${t("collection_contents", "Collection Contents")} (${targetSet.items.length})`}
            icon="category"
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
                          className="w-8 h-8 rounded-lg text-[var(--danger)] bg-transparent border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] transition-all flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            close
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
              title={t("editor_core_artifact", "Core Artifact")}
              icon="stars"
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
                              className="w-8 h-8 rounded-lg bg-transparent text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] transition-all flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined !text-[16px]">
                                close
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
              title={t("twin_artifacts", "Twin Artifacts")}
              icon="join_inner"
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
                            className="w-8 h-8 rounded-lg bg-transparent text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] transition-all flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              close
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
              title={t("addon_artifacts", "Add-On Artifacts")}
              icon="extension"
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
                            className="w-8 h-8 rounded-lg bg-transparent text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] transition-all flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined !text-[16px]">
                              close
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
