import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLexicon } from "../../LexiconContext";
import {
  CustomDropdown,
  CustomTierDropdown,
  HoverTooltip,
  ModSearchDropdown,
} from "../../shared";

export function ArtifactRulesTab({
  mode,
  mod,
  isCloudMod,
  isVerifiedMason,
  isCommitting,
  dlcRegistry,
  activeDlcIds,
  onToggleDlc,
  onClearAllDlc,
  dependencies,
  allConflictAndDepCandidates,
  onAddDependencyDirect,
  onRemoveDependency,
  conflicts,
  conflictSeverity,
  setConflictSeverity,
  onAddConflictCard,
  onRemoveConflict,
  unassignedCloudCollections,
  assignedCloudCollections,
  localCollectionNames,
  newCollectionName,
  setNewCollectionName,
  onToggleCloudCollection,
  onAddCollectionQuick,
  onRemoveLocalCollection,
  onChangeStaticManifestUrl,
  onExportRelease,
  onSyncToNetwork,
  onSaveCloudChanges,
}: {
  mode: "registry" | "sandbox";
  mod: any;
  isCloudMod: boolean;
  isVerifiedMason: boolean;
  isCommitting: boolean;
  dlcRegistry: any[];
  activeDlcIds: string[];
  onToggleDlc: (dlcId: string) => Promise<void>;
  onClearAllDlc: () => void;
  dependencies: any[];
  allConflictAndDepCandidates: any[];
  onAddDependencyDirect: (depCandidate: any) => Promise<void>;
  onRemoveDependency: (dep: any) => Promise<void>;
  conflicts: any[];
  conflictSeverity: number;
  setConflictSeverity: (val: number) => void;
  onAddConflictCard: (targetEnemy: any) => Promise<void>;
  onRemoveConflict: (conf: any) => Promise<void>;
  unassignedCloudCollections: any[];
  assignedCloudCollections: any[];
  localCollectionNames: string[];
  newCollectionName: string;
  setNewCollectionName: (val: string) => void;
  onToggleCloudCollection: (colId: string) => Promise<void>;
  onAddCollectionQuick: () => Promise<void>;
  onRemoveLocalCollection: (name: string) => void;
  onChangeStaticManifestUrl: (url: string) => void;
  onExportRelease?: () => void;
  onSyncToNetwork?: () => void;
  onSaveCloudChanges?: () => void;
}) {
  const { t } = useLexicon();

  const [isDlcDropdownOpen, setIsDlcDropdownOpen] = useState<boolean>(false);
  const [dlcFilterTab, setDlcFilterTab] = useState<string>("ALL");
  const [dlcSearchQuery, setDlcSearchQuery] = useState<string>("");
  const [dlcAssignedFilter, setDlcAssignedFilter] = useState<string>("");
  const [depsSearchFilter, setDepsSearchFilter] = useState<string>("");
  const [conflictsSearchFilter, setConflictsSearchFilter] = useState<string>("");
  const dlcBtnRef = useRef<HTMLButtonElement>(null);
  const dlcInstanceId = React.useId();
  const [dlcCoords, setDlcCoords] = useState({
    top: 0,
    left: 0,
    width: 340,
    isDropUp: false,
  });

  useEffect(() => {
    if (!isDlcDropdownOpen) return;
    window.dispatchEvent(new CustomEvent("sa-close-popovers", { detail: dlcInstanceId }));
    const onOtherOpen = (e: any) => {
      if (e.detail !== dlcInstanceId) setIsDlcDropdownOpen(false);
    };
    window.addEventListener("sa-close-popovers", onOtherOpen);
    return () => window.removeEventListener("sa-close-popovers", onOtherOpen);
  }, [isDlcDropdownOpen, dlcInstanceId]);

  React.useLayoutEffect(() => {
    if (!isDlcDropdownOpen) return;
    const updatePosition = () => {
      if (dlcBtnRef.current) {
        const rect = dlcBtnRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldDropUp = spaceBelow < 360 && rect.top > 360;
        const menuWidth = Math.min(Math.max(rect.width, 340), window.innerWidth - 24);
        const clampedLeft = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
        setDlcCoords({
          top: shouldDropUp ? rect.top - 6 : rect.bottom + 6,
          left: clampedLeft,
          width: menuWidth,
          isDropUp: shouldDropUp,
        });
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isDlcDropdownOpen]);

  const dlcCategories = [
    { id: "ALL", label: t("dlc_tab_all", "All Packs") },
    { id: "Expansion Pack", label: t("tab_expansion", "Expansions") },
    { id: "Game Pack", label: t("tab_game_pack", "Game Packs") },
    { id: "Stuff Pack", label: t("tab_stuff_pack", "Stuff Packs") },
    { id: "Kit", label: t("tab_kit", "Kits") },
  ];

  const filteredDlcList = dlcRegistry
    .filter((d) => dlcFilterTab === "ALL" || d.type === dlcFilterTab)
    .filter(
      (d) =>
        !dlcSearchQuery ||
        String(d.name || "").toLowerCase().includes(dlcSearchQuery.toLowerCase()) ||
        String(d.id || "").toLowerCase().includes(dlcSearchQuery.toLowerCase())
    );

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col gap-5 pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* CARD 1: REQUIRED EA PACKS (DLC) */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                {t("icon_inventory_2", "inventory_2")}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                {t("studio_rules_dlc_title", "Required EA Packs (DLC)")} ({activeDlcIds.length})
              </h4>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {activeDlcIds.length > 4 && (
                <input
                  value={dlcAssignedFilter}
                  onChange={(e) => setDlcAssignedFilter(e.target.value)}
                  placeholder={t("hub_filters", "Filter...")}
                  className="h-6 px-2 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-bold text-[var(--text)] w-24 outline-none"
                />
              )}
              {activeDlcIds.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAllDlc}
                  className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer"
                >
                  {t("studio_dlc_clear_all", "Clear All")}
                </button>
              )}
            </div>
          </div>

          <div className="relative w-full">
            <button
              ref={dlcBtnRef}
              type="button"
              onClick={() => setIsDlcDropdownOpen(!isDlcDropdownOpen)}
              className="w-full h-12 px-4 rounded-[var(--radius)] glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-between gap-2 text-xs font-bold text-[var(--text)] transition-all cursor-pointer"
            >
              <span className={activeDlcIds.length === 0 ? "text-[var(--subtext)]" : "text-[var(--text)]"}>
                {activeDlcIds.length === 0
                  ? t("studio_dlc_select_ph", "Select Required EA Packs...")
                  : `${activeDlcIds.length} ${t("studio_dlc_selected_count", "Packs Selected")}`}
              </span>
              <span className="material-symbols-outlined !text-[18px] text-[var(--subtext)]">
                {isDlcDropdownOpen ? "expand_less" : "expand_more"}
              </span>
            </button>

            {isDlcDropdownOpen &&
              createPortal(
                <>
                  <div
                    className="!fixed inset-0 pointer-events-auto"
                    style={{ zIndex: 100000000 }}
                    onClick={() => setIsDlcDropdownOpen(false)}
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="!fixed pointer-events-auto rounded-2xl glass-panel portal-glass-fix border border-[rgba(var(--text-rgb,255,255,255),0.14)] shadow-2xl p-3 flex flex-col gap-2.5 text-[var(--text)] animate-in fade-in zoom-in-95 duration-150"
                    style={{
                      zIndex: 100000001,
                      top: dlcCoords.isDropUp ? "auto" : dlcCoords.top,
                      bottom: dlcCoords.isDropUp ? window.innerHeight - dlcCoords.top + 8 : "auto",
                      left: dlcCoords.left,
                      width: dlcCoords.width,
                      maxWidth: "calc(100vw - 24px)",
                    }}
                  >
                    <div className="flex items-center gap-2 px-3 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">
                        {t("icon_search", "search")}
                      </span>
                      <input
                        type="text"
                        autoFocus
                        value={dlcSearchQuery}
                        onChange={(e) => setDlcSearchQuery(e.target.value)}
                        placeholder={t("search_ph", "Search packs...")}
                        className="bg-transparent border-none outline-none text-xs font-bold text-[var(--text)] w-full placeholder:text-[var(--subtext)]/60"
                      />
                      {dlcSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setDlcSearchQuery("")}
                          className="text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {dlcCategories.map((cat) => {
                        const active = dlcFilterTab === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setDlcFilterTab(cat.id)}
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                              active
                                ? "glass-surface border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--text)]"
                                : "text-[var(--subtext)] hover:text-[var(--text)] border border-transparent"
                            }`}
                          >
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                      {filteredDlcList.map((pack) => {
                        const isChecked = activeDlcIds.includes(pack.id);
                        return (
                          <button
                            key={pack.id}
                            type="button"
                            onClick={() => onToggleDlc(pack.id)}
                            className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left text-xs font-bold transition-all cursor-pointer ${
                              isChecked
                                ? "glass-surface border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--text)]"
                                : "hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`material-symbols-outlined !text-[16px] shrink-0 ${
                                  isChecked ? "text-[var(--accent)]" : "text-[var(--subtext)] opacity-50"
                                }`}
                              >
                                {isChecked ? "check_box" : "check_box_outline_blank"}
                              </span>
                              <span className="truncate">{pack.name || pack.id}</span>
                            </div>
                            <span className="font-mono text-[10px] text-[var(--subtext)] shrink-0">{pack.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>,
                document.getElementById("sa-portals") || document.body
              )}
          </div>

          {activeDlcIds.length === 0 ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("dlc_base_game_only", "Base Game Compatible — No Expansion Packs Required")}
            </div>
          ) : (
            <div className="h-[116px] overflow-y-auto custom-scrollbar p-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 content-start">
              {activeDlcIds
                .filter((id) => {
                  if (!dlcAssignedFilter.trim()) return true;
                  const pack = dlcRegistry.find((d) => d.id === id);
                  const q = dlcAssignedFilter.toLowerCase();
                  return id.toLowerCase().includes(q) || (pack?.name || "").toLowerCase().includes(q);
                })
                .map((id) => {
                  const pack = dlcRegistry.find((d) => d.id === id);
                  return (
                    <div
                      key={id}
                      className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[10px] font-bold text-[var(--accent)] shrink-0">{id}</span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {pack?.name || id}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleDlc(id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        <HoverTooltip title={t("lineage_btn_delete", "Remove")} variant="danger" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* CARD 2: REQUIRED MODS (DEPENDENCIES) */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                {t("icon_extension", "extension")}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                {t("studio_rules_deps_title", "Required Mods (Dependencies)")} ({dependencies.length})
              </h4>
            </div>
            {dependencies.length > 4 && (
              <input
                value={depsSearchFilter}
                onChange={(e) => setDepsSearchFilter(e.target.value)}
                placeholder={t("hub_filters", "Filter...")}
                className="h-6 px-2 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-bold text-[var(--text)] w-24 outline-none shrink-0"
              />
            )}
          </div>

          <div className="w-full relative z-30">
            <ModSearchDropdown
              modList={allConflictAndDepCandidates.filter(
                (m) => !dependencies.some((d) => (d.mod?.id || d.mod?.hash) === (m.id || m.hash))
              )}
              onSelect={(selectedMod: any) => {
                if (selectedMod) onAddDependencyDirect(selectedMod);
              }}
              selectedItem={null}
              onClear={() => {}}
              placeholder={t("studio_rules_deps_search_ph", "Search catalog to add a required mod...")}
            />
          </div>

          {dependencies.length === 0 ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("studio_deps_empty", "No required mods assigned")}
            </div>
          ) : (
            <div className="h-[116px] overflow-y-auto custom-scrollbar p-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 content-start">
              {dependencies
                .filter((dep) => {
                  if (!depsSearchFilter.trim()) return true;
                  return (dep.mod?.name || dep.dependency_name || "")
                    .toLowerCase()
                    .includes(depsSearchFilter.toLowerCase());
                })
                .map((dep) => (
                  <div
                    key={dep.id}
                    className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                  >
                    <span className="text-[11px] font-bold text-[var(--text)] truncate">
                      {dep.mod?.name || dep.dependency_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveDependency(dep)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                    >
                      <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                      <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* CARD 3: INCOMPATIBLE MODS (CONFLICTS) */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--danger)] shrink-0">
                {t("icon_security", "security")}
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                {t("studio_rules_conflicts_title", "Incompatible Mods (Conflicts)")} ({conflicts.length})
              </h4>
            </div>
            {conflicts.length > 4 && (
              <input
                value={conflictsSearchFilter}
                onChange={(e) => setConflictsSearchFilter(e.target.value)}
                placeholder={t("hub_filters", "Filter...")}
                className="h-6 px-2 rounded-md glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[10px] font-bold text-[var(--text)] w-24 outline-none shrink-0"
              />
            )}
          </div>

          <div className="flex flex-col gap-2.5 relative z-20">
            <div className="w-full">
              <CustomTierDropdown value={conflictSeverity} onChange={setConflictSeverity} />
            </div>
            <div className="w-full">
              <ModSearchDropdown
                modList={allConflictAndDepCandidates.filter(
                  (m) => !conflicts.some((c) => (c.enemyMod?.id || c.enemyMod?.hash) === (m.id || m.hash))
                )}
                onSelect={(selectedMod: any) => {
                  if (selectedMod) onAddConflictCard(selectedMod);
                }}
                selectedItem={null}
                onClear={() => {}}
                placeholder={t("studio_rules_conflicts_search_ph", "Search catalog to flag a conflicting mod...")}
              />
            </div>
          </div>

          {conflicts.length === 0 ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("studio_conflicts_empty", "No conflicting mods flagged")}
            </div>
          ) : (
            <div className="h-[116px] overflow-y-auto custom-scrollbar p-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 content-start">
              {conflicts
                .filter((conf) => {
                  if (!conflictsSearchFilter.trim()) return true;
                  return (conf.enemyMod?.name || "")
                    .toLowerCase()
                    .includes(conflictsSearchFilter.toLowerCase());
                })
                .map((conf) => {
                  const sev = conf.severity_rank || 4;
                  return (
                    <div
                      key={conf.id}
                      className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                            sev === 4
                              ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
                              : "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"
                          }`}
                        >
                          {sev === 4 ? "S4" : "S3"}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {conf.enemyMod?.name || "Conflict Mod"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveConflict(conf)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* CARD 4: COLLECTIONS */}
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
              {t("icon_collections_bookmark", "collections_bookmark")}
            </span>
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              {t("studio_rules_collections_title", "Collections")} (
              {isCloudMod ? assignedCloudCollections.length : localCollectionNames.length})
            </h4>
          </div>

          <div className="flex flex-col gap-2.5 relative z-10">
            {isCloudMod && unassignedCloudCollections.length > 0 && (
              <div className="w-full">
                <CustomDropdown
                  disableTint={true}
                  value=""
                  placeholder={t("studio_collections_select_ph", "Add to Existing Collection...")}
                  onChange={(val: string[]) => {
                    if (val[0]) onToggleCloudCollection(val[0]);
                  }}
                  options={unassignedCloudCollections.map((c) => ({
                    id: c.id,
                    label: c.name,
                  }))}
                />
              </div>
            )}
            <div className="flex items-center gap-2 w-full">
              <input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddCollectionQuick()}
                placeholder={t("studio_add_local_collection_ph", "New Collection name...")}
                className="h-12 glass-surface rounded-[var(--radius)] px-4 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={onAddCollectionQuick}
                className="h-12 px-4 rounded-[var(--radius)] glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                  {t("icon_add", "add")}
                </span>
                {t("cc_btn_add", "Add")}
              </button>
            </div>
          </div>

          {(isCloudMod ? assignedCloudCollections.length : localCollectionNames.length) === 0 ? (
            <div className="h-[116px] px-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center text-[11px] font-semibold text-[var(--subtext)]">
              {t("studio_collections_empty", "Not added to any collections")}
            </div>
          ) : (
            <div className="h-[116px] overflow-y-auto custom-scrollbar p-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] grid grid-cols-1 sm:grid-cols-2 gap-1.5 content-start">
              {isCloudMod
                ? assignedCloudCollections.map((col) => (
                    <div
                      key={col.id}
                      className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                    >
                      <span className="text-[11px] font-bold text-[var(--text)] truncate">{col.name}</span>
                      <button
                        type="button"
                        onClick={() => onToggleCloudCollection(col.id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
                      </button>
                    </div>
                  ))
                : localCollectionNames.map((name) => (
                    <div
                      key={name}
                      className="h-8 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-1.5"
                    >
                      <span className="text-[11px] font-bold text-[var(--text)] truncate">{name}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveLocalCollection(name)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0 relative group/btn"
                      >
                        <span className="material-symbols-outlined !text-[14px]">{t("icon_close", "close")}</span>
                        <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
                      </button>
                    </div>
                  ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar: Sandbox Static Manifest / Export / Sync OR Cloud Registry Save */}
      {mode === "sandbox" ? (
        <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
              {t("label_static_manifest_url", "Static Polling Manifest URL (manifest.json)")}
            </label>
            <input
              value={mod.static_manifest_url || ""}
              onChange={(e) => onChangeStaticManifestUrl(e.target.value)}
              placeholder={t(
                "placeholder_static_manifest_url",
                "https://raw.githubusercontent.com/author/mod/main/manifest.json"
              )}
              className="h-12 glass-surface rounded-[var(--radius)] px-4 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {onExportRelease && (
              <button
                type="button"
                disabled={isCommitting}
                onClick={onExportRelease}
                className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                  {t("icon_move_to_inbox", "move_to_inbox")}
                </span>
                {t("studio_publish_export_btn", "Export Static Manifest (.zip)")}
              </button>
            )}
            {isVerifiedMason && onSyncToNetwork && (
              <button
                type="button"
                disabled={isCommitting}
                onClick={onSyncToNetwork}
                className="h-11 px-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_22%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_36%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                  {t("icon_cloud_upload", "cloud_upload")}
                </span>
                {t("studio_publish_sync_btn", "Sync to Nexus")}
              </button>
            )}
          </div>
        </div>
      ) : (
        (onSaveCloudChanges || onSyncToNetwork) && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isCommitting}
              onClick={onSaveCloudChanges || onSyncToNetwork}
              className="h-11 px-5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_22%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_36%,transparent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                {t("icon_save", "save")}
              </span>
              {t("hub_save", "Save")}
            </button>
          </div>
        )
      )}
    </div>
  );
}

