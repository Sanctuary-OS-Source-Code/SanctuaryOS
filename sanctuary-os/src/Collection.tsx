import React from 'react';
import { ViewHeader } from './shared';
import { useLexicon } from './LexiconContext';
import { invoke } from '@tauri-apps/api/core';
import { ModCard } from './ModCard';

export default function Collection(props: any) {
  const { 
    isBulkMode, setIsBulkMode, selectedMods, setSelectedMods, setConfirmDialog, 
    setStatus, runRadarSweep, setIsDropzoneOpen, setLocalFolderModal, playSets, 
    equipFilter, setEquipFilter, searchQuery, setSearchQuery, filterStatus, 
    setFilterStatus, activeCategory, setActiveCategory, activeSubType, setActiveSubType, 
    visibleMods, displayModList, activePlaySetIndex, toggleInActiveSet, 
    openUrl, setLocalFolderName, setLocalFolderType, executeHotSwap, setMetaNameInput, 
    setMetaAuthorInput, setMetaVersionInput, setActiveDossier, setDrawerConfirmHash, 
    quarantineList, restoreMod, purgeMod, ownedDLC, maskedDLC, setMetaDescInput, 
    setMetaImageInput, setMetaAllowWriteInput, expandedFolder, setExpandedFolder, 
    drawerConfirmHash, modList
  } = props;
  const { t } = useLexicon();
  
  return (
    <>
            <div className="flex flex-col gap-8 animate-in fade-in duration-700">
              <ViewHeader
                title={t("vault_title")}
                subtitle={t("vault_subtitle")}
              >
                <button
                  onClick={() => setIsDropzoneOpen(true)}
                  className="w-[220px] h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all theme-btn-standard shadow-md flex items-center justify-center gap-2 shrink-0"
                >
                  <span className="text-lg"></span> {t("vault_btn_add_assets")}
                </button>
                {isBulkMode && selectedMods.length > 0 && (
                  <button
                    onClick={() => {
                      setConfirmDialog({
                        message: `${t("confirm_purge_artifacts_prefix")}${selectedMods.length}${t("confirm_purge_artifacts_suffix")}`,
                        action: async () => {
                          setConfirmDialog(null);
                          setStatus(t("status_purging_artifacts"));
                          try {
                            const config: any = await invoke(
                              "get_saved_coordinates",
                            );
                            const msg = await invoke("purge_vault_artifacts", {
                              vaultPath: config.vault_path,
                              filenames: selectedMods,
                            });
                            setStatus(`${t("ui_icon_success")} ${msg}`);
                            setIsBulkMode(false);
                            setSelectedMods([]);
                            runRadarSweep(false);
                          } catch (err) {
                            setStatus(`${t("status_error")}${err}`);
                          }
                        },
                      });
                    }}
                    className="w-[140px] h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center shrink-0 theme-panel-danger theme-text-danger border border-red-500/50 hover:bg-red-500 hover:text-white"
                  >
                    {t("vault_btn_purge_artifacts")}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!isBulkMode) {
                      setIsBulkMode(true);
                    } else if (selectedMods.length > 0) {
                      setLocalFolderModal(true);
                    } else {
                      setIsBulkMode(false);
                    }
                  }}
                  className={`w-[220px] h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center shrink-0 ${isBulkMode ? (selectedMods.length > 0 ? "theme-bg-success theme-border-success text-[var(--bg)]" : "theme-bg-accent theme-border-accent text-[var(--bg)]") : "theme-btn-standard"}`}
                >
                  {isBulkMode
                    ? selectedMods.length > 0
                      ? t("vault_btn_group_folder")
                      : t("vault_btn_cancel_selection")
                    : t("vault_btn_select_assets")}
                </button>
              </ViewHeader>
              <div className="mb-8 animate-in slide-in-from-top-4 duration-500">
                <div className="flex justify-between items-end w-full relative z-10">
                  {playSets.length > 0 ? (
                    <div
                      className="flex items-end h-12 theme-glass-panel !shadow-none rounded-[2rem] rounded-b-none border-b-0 rounded-tl-3xl rounded-tr-xl pl-4 pr-2 pt-2 relative z-20"
                      style={{ marginBottom: "-1px" }}
                    >
                      <button
                        onClick={() => setEquipFilter("ALL")}
                        className={`relative h-full px-6 text-[10px] font-black uppercase tracking-widest transition-all bg-transparent ${equipFilter === "ALL" ? "border-t border-l border-r border-[color-mix(in_srgb,var(--text)_15%,transparent)] rounded-t-xl text-[var(--text)]" : "text-[var(--subtext)] opacity-60 hover:text-[var(--text)]"}`}
                      >
                        <span className="flex h-full items-center justify-center gap-2">
                          {equipFilter === "ALL" && (
                            <div className="w-1.5 h-1.5 rounded-full theme-bg-accent animate-pulse" />
                          )}
                          {t("vault_filter_all_vault")}
                        </span>
                        {equipFilter === "ALL" && (
                          <div className="absolute bottom-0 left-[-1px] right-[-1px] h-[2px] theme-bg-accent shadow-[0_0_10px_var(--accent)]" />
                        )}
                      </button>
                      <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-2 mb-2.5" />
                      <button
                        onClick={() => setEquipFilter("EQUIPPED")}
                        className={`relative h-full px-6 text-[10px] font-black uppercase tracking-widest transition-all bg-transparent ${equipFilter === "EQUIPPED" ? "border-t border-l border-r border-[color-mix(in_srgb,var(--text)_15%,transparent)] rounded-t-xl theme-text-success" : "text-[var(--subtext)] opacity-60 hover:text-[var(--text)]"}`}
                      >
                        <span className="flex h-full items-center justify-center gap-2">
                          {equipFilter === "EQUIPPED" && (
                            <div className="w-1.5 h-1.5 rounded-full theme-bg-success animate-pulse" />
                          )}
                          {t("vault_filter_equipped")}
                        </span>
                        {equipFilter === "EQUIPPED" && (
                          <div className="absolute bottom-0 left-[-1px] right-[-1px] h-[2px] theme-bg-success shadow-[0_0_10px_var(--success)]" />
                        )}
                      </button>
                      <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] mx-2 mb-2.5" />
                      <button
                        onClick={() => setEquipFilter("UNEQUIPPED")}
                        className={`relative h-full px-6 text-[10px] font-black uppercase tracking-widest transition-all bg-transparent ${equipFilter === "UNEQUIPPED" ? "border-t border-l border-r border-[color-mix(in_srgb,var(--text)_15%,transparent)] rounded-t-xl theme-text-danger" : "text-[var(--subtext)] opacity-60 hover:text-[var(--text)]"}`}
                      >
                        <span className="flex h-full items-center justify-center gap-2">
                          {equipFilter === "UNEQUIPPED" && (
                            <div className="w-1.5 h-1.5 rounded-full theme-bg-danger animate-pulse" />
                          )}
                          {t("vault_filter_unequipped")}
                        </span>
                        {equipFilter === "UNEQUIPPED" && (
                          <div className="absolute bottom-0 left-[-1px] right-[-1px] h-[2px] theme-bg-danger shadow-[0_0_10px_var(--danger)]" />
                        )}
                      </button>
                    </div>
                  ) : null}
                  <div className="flex-1 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] h-12 relative z-0" />
                  <div
                    className="flex items-center theme-glass-panel !shadow-none rounded-[2rem] rounded-b-none !border-b-0 px-6 rounded-tr-[2rem] rounded-tl-xl relative z-20 h-12 w-[320px] translate-y-[1px]"
                    style={{ marginBottom: "-1px" }}
                  >
                    <svg
                      className="w-4 h-4 text-[var(--subtext)] opacity-80 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      placeholder={t("vault_search")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none outline-none text-[var(--text)] text-sm w-full font-bold placeholder:text-[var(--subtext)] opacity-80 focus:outline-none"
                    />
                  </div>
                </div>
                <div
                  className="theme-glass-panel rounded-[2rem] rounded-t-none border-t-0 p-8 shadow-2xl flex flex-col gap-6 relative z-10 rounded-b-3xl"
                  style={{ borderTop: "none" }}
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <h3 className="text-[var(--text)] font-black uppercase tracking-widest text-sm flex items-center gap-2">
                      {t("vault_filter_matrix")}
                    </h3>
                  </div>
                  <div className="flex flex-col gap-6 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest min-w-[120px]">
                        {t("vault_filter_verification")}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {["ALL", "VERIFIED", "REVIEW", "UNVERIFIED"].map(
                          (f) => (
                            <button
                              key={f}
                              onClick={() => setFilterStatus(f)}
                              className={`px-4 py-1.5 rounded-lg text-[9px] font-black tracking-[0.2em] transition-all border ${filterStatus === f ? "theme-bg-accent text-[var(--bg)] theme-border-accent shadow-md scale-105" : "bg-transparent text-[var(--subtext)] opacity-60 border-white/10 hover:border-white/30 hover:text-[var(--text)]"}`}
                            >
                              {t(`vault_filter_tag_${f.toLowerCase()}`)}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest min-w-[120px]">
                          {t("vault_filter_classification")}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {[
                            "ALL",
                            "CAS",
                            "BuildBuy",
                            "Script",
                            "Animation",
                          ].map((cat) => (
                            <button
                              key={cat}
                              onClick={() => {
                                setActiveCategory(cat);
                                setActiveSubType("ALL");
                              }}
                              className={`px-5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${activeCategory === cat ? "theme-border-accent theme-bg-accent text-[var(--bg)] shadow-lg" : "border-transparent text-[var(--subtext)] opacity-80 hover:text-[var(--text)] hover:bg-white/10"}`}
                            >
                              {t(`vault_cat_${cat.toLowerCase()}`)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {activeCategory === "CAS" && (
                        <div className="flex items-center gap-4 animate-in slide-in-from-top-2 fade-in duration-300 sm:ml-[136px]">
                          <span className="text-[9px] font-bold theme-text-accent uppercase tracking-widest border-l border-white/10 pl-4">
                            {" "}
                            {t("vault_filter_cas_sub")}
                          </span>
                          <div className="flex items-center gap-2">
                            {["ALL", "Tattoo", "Hair", "Clothing"].map(
                              (sub) => (
                                <button
                                  key={sub}
                                  onClick={() => setActiveSubType(sub)}
                                  className={`px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all border ${activeSubType === sub ? "theme-border-accent theme-text-accent theme-bg-accent bg-opacity-20" : "border-white/5 text-[var(--subtext)] opacity-60 hover:border-white/20 hover:text-gray-300"}`}
                                >
                                  {t(`vault_sub_${sub.toLowerCase()}`)}
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-20">
                {visibleMods
                  .filter((mod: any) => {
                    if (mod.isVirtual) return true;
                    const folderExists = displayModList.some(
                      (v: any) =>
                        v.isVirtual &&
                        (String(v.dbId) === String(mod.familyId) ||
                          String(v.dbId) === String(mod.setId)),
                    );
                    return !folderExists;
                  })
                  .map((mod: any, index: number) => {
                    const mainKey = `${mod.hash || mod.name}-${index}`;
                    const activeSetMods =
                      playSets[activePlaySetIndex]?.mods || [];
                    const isEquipped = mod.isParent
                      ? (() => {
                          const anchor = mod.dbId || mod.familyId;
                          if (mod.isFlavorFolder) {
                            return (mod.flavors || []).some((f: any) =>
                              activeSetMods.includes(f.name),
                            );
                          }
                          if (anchor) {
                            return displayModList.some(
                              (m: any) =>
                                !m.isVirtual &&
                                m.name &&
                                (String(m.familyId) === String(anchor) ||
                                  String(m.dbId) === String(anchor) ||
                                  String(m.setId) === String(anchor)) &&
                                activeSetMods.includes(m.name),
                            );
                          }
                          return (mod.flavors || []).some((f: any) =>
                            activeSetMods.includes(f.name),
                          );
                        })()
                      : activeSetMods.includes(mod.name);
                    const getDeepCasualties = (targetMods: any[]) => {
                      let queue = [...targetMods];
                      let seen = new Set<string>();
                      let result: string[] = [];
                      if (!isEquipped) {
                        const mData = mod;
                        if (mData?.requirements) {
                          mData.requirements.forEach((reqId: any) => {
                            const isSatisfied = activeSetMods.some(
                              (n: string) => {
                                const match = modList.find(
                                  (m: any) => m.name === n,
                                );
                                return (
                                  match && String(match.dbId) === String(reqId)
                                );
                              },
                            );
                            if (!isSatisfied) {
                              const provider = modList.find(
                                (m: any) =>
                                  String(m.dbId) === String(reqId) &&
                                  !m.isVirtual,
                              );
                              if (provider?.flavorGroupId) {
                                const equippedRivals = modList.filter(
                                  (m: any) =>
                                    String(m.flavorGroupId) ===
                                      String(provider.flavorGroupId) &&
                                    activeSetMods.includes(m.name),
                                );
                                queue.push(...equippedRivals);
                              }
                            }
                          });
                        }
                      }
                      while (queue.length > 0) {
                        const current = queue.shift();
                        if (!current || seen.has(current.name)) continue;
                        seen.add(current.name);
                        if (current.name !== mod.name) {
                          result.push(current.displayName || current.name);
                        }
                        const dependents = displayModList.filter(
                          (m: any) =>
                            (m.requirements?.some(
                              (r: any) => String(r) === String(current.dbId),
                            ) ||
                              (String(m.familyId) ===
                                String(current.familyId || current.dbId) &&
                                m.relationshipType === "addon" &&
                                current.relationshipType !== "addon")) &&
                            activeSetMods.includes(m.name),
                        );
                        queue.push(...dependents);
                      }
                      return [...new Set(result)];
                    };
                    let casualties: string[] = [];
                    if (isEquipped) {
                      if (mod.isVirtual) {
                        const familyAnchor = mod.dbId || mod.familyId;
                        if (familyAnchor) {
                          const wouldBeRemoved = displayModList.filter(
                            (m: any) =>
                              !m.isVirtual &&
                              m.name &&
                              m.name !== mod.name &&
                              (String(m.familyId) === String(familyAnchor) ||
                                String(m.dbId) === String(familyAnchor) ||
                                String(m.setId) === String(familyAnchor)) &&
                              activeSetMods.includes(m.name),
                          );
                          if (wouldBeRemoved.length > 0) {
                            const fullStrings = [
                              ...wouldBeRemoved.map(
                                (s: any) => s.displayName || s.name,
                              ),
                              ...getDeepCasualties(wouldBeRemoved),
                            ];
                            casualties = [...new Set(fullStrings)];
                          }
                        }
                      } else {
                        casualties = getDeepCasualties([mod]);
                      }
                    } else {
                      if (mod.isVirtual) {
                        const flavorFiles = (mod.flavors || []).filter(
                          (f: any) => f.flavorGroupId != null,
                        );
                        if (flavorFiles.length > 0) {
                          const firstFlavor = flavorFiles[0];
                          const rivals = displayModList.filter(
                            (m: any) =>
                              String(m.flavorGroupId) ===
                                String(firstFlavor.flavorGroupId) &&
                              m.name !== firstFlavor.name &&
                              activeSetMods.includes(m.name),
                          );
                          casualties = getDeepCasualties(rivals);
                        }
                      } else if (mod.flavorGroupId) {
                        const rivals = displayModList.filter(
                          (m: any) =>
                            String(m.flavorGroupId) ===
                              String(mod.flavorGroupId) &&
                            m.name !== mod.name &&
                            activeSetMods.includes(m.name),
                        );
                        casualties = getDeepCasualties(rivals);
                      }
                    }
                    return (
                      <div key={mainKey} className="contents">
                        <ModCard
                          mod={mod}
                          ownedDLC={ownedDLC}
                          maskedDLC={maskedDLC}
                          isInActiveSet={isEquipped}
                          casualtyList={casualties.join(", ")}
                          onToggleSet={(e: any) => {
                            e.stopPropagation();
                            toggleInActiveSet(mod.name);
                          }}
                          onSelect={() => {
                            setMetaNameInput(mod.displayName || mod.name);
                            setMetaAuthorInput(mod.author || "");
                            setMetaDescInput(mod.description || "");
                            setMetaImageInput(
                              mod.image_url || mod.imageUrl || "",
                            );
                            setMetaAllowWriteInput(mod.allow_write || false);
                            setActiveDossier(mod);
                          }}
                          isParent={mod.isParent}
                          isExpanded={expandedFolder === mainKey}
                          onExpand={() =>
                            setExpandedFolder(
                              expandedFolder === mainKey ? null : mainKey,
                            )
                          }
                          isBulkMode={isBulkMode}
                          isSelected={selectedMods.includes(mod.name)}
                          onToggleSelect={() =>
                            setSelectedMods((prev: string[]) =>
                              prev.includes(mod.name)
                                ? prev.filter((n: string) => n !== mod.name)
                                : [...prev, mod.name],
                            )
                          }
                        />
                        {mod.isParent && expandedFolder === mainKey && (
                          <div className="col-span-full theme-bg-accent bg-opacity-5 border-2 border-dashed theme-border-accent rounded-[3rem] p-8 my-4">
                            <h3 className="text-xl font-black text-[var(--text)] uppercase mb-6">
                              {t("vault_folder_prefix")}{" "}
                              <span className="theme-text-accent">
                                {mod.displayName}
                              </span>
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {mod.flavors.map(
                                (flavor: any, subIdx: number) => {
                                  const isFlavorEquipped =
                                    activeSetMods.includes(flavor.name);
                                  const getDrawerDeepCasualties = (
                                    seeds: any[],
                                  ) => {
                                    let queue = [...seeds];
                                    let seen = new Set<string>();
                                    let result: any[] = [];
                                    while (queue.length > 0) {
                                      const current = queue.shift();
                                      if (!current || seen.has(current.name))
                                        continue;
                                      seen.add(current.name);
                                      result.push(current);
                                      if (current.dbId || current.familyId) {
                                        const dependents =
                                          displayModList.filter(
                                            (m: any) =>
                                              (m.requirements?.some(
                                                (r: any) =>
                                                  String(r) ===
                                                  String(current.dbId),
                                              ) ||
                                                (String(m.familyId) ===
                                                  String(
                                                    current.familyId ||
                                                      current.dbId,
                                                  ) &&
                                                  m.relationshipType ===
                                                    "addon" &&
                                                  current.relationshipType !==
                                                    "addon")) &&
                                              activeSetMods.includes(m.name),
                                          );
                                        queue.push(...dependents);
                                      }
                                    }
                                    return result;
                                  };
                                  let drawerCasualties: any[] = [];
                                  if (!isFlavorEquipped) {
                                    const rivals = mod.isFlavorFolder
                                      ? mod.flavors.filter(
                                          (f: any) =>
                                            f.name !== flavor.name &&
                                            activeSetMods.includes(f.name),
                                        )
                                      : [];
                                    drawerCasualties =
                                      getDrawerDeepCasualties(rivals);
                                  } else {
                                    drawerCasualties = getDrawerDeepCasualties([
                                      flavor,
                                    ]).filter(
                                      (c: any) => c.name !== flavor.name,
                                    );
                                  }
                                  const isConfirming =
                                    drawerConfirmHash === flavor.hash;
                                  return (
                                    <div
                                      key={`sub-${flavor.hash}-${subIdx}`}
                                      className={`p-3 border rounded-xl relative flex transition-all cursor-pointer min-h-[56px] ${isConfirming ? "bg-transparent border-transparent flex-col items-stretch p-0" : "bg-black/40 border-white/5 hover:theme-border-accent items-center justify-between"}`}
                                      onClick={() => {
                                        if (!isConfirming) {
                                          setMetaNameInput(
                                            flavor.displayName || flavor.name,
                                          );
                                          setMetaAuthorInput(
                                            flavor.author || mod.author || "",
                                          );
                                          setMetaVersionInput(
                                            flavor.version || "v.Local",
                                          );
                                          setActiveDossier(flavor);
                                        }
                                      }}
                                    >
                                      {isConfirming ? (
                                        <div
                                          className="w-full flex flex-col rounded-2xl border-2 theme-border-danger p-4 animate-in fade-in zoom-in-95 shadow-xl"
                                          style={{
                                            backgroundColor: "var(--bg)",
                                          }}
                                        >
                                          <div className="flex items-center gap-2 mb-3 shrink-0">
                                            <div className="flex flex-col">
                                              <span className="text-[10px] font-black theme-text-danger uppercase tracking-widest">
                                                {t("modcard_yeet_cascade")}
                                              </span>
                                              <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                                                {t(
                                                  "modcard_override_exclusive",
                                                )}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex-1 flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1 mb-4">
                                            <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">
                                              {t("modcard_artifacts_removed")}
                                            </p>
                                            {drawerCasualties.map((r: any) => (
                                              <div
                                                key={r.hash || r.name}
                                                className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold text-[var(--text)]/80 truncate flex items-center gap-2"
                                              >
                                                {(
                                                  r.displayName ||
                                                  r.name ||
                                                  ""
                                                ).replace(/_/g, " ")}
                                              </div>
                                            ))}
                                          </div>
                                          <div className="flex gap-2 pt-3 border-t border-white/10 shrink-0">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleInActiveSet(flavor.name);
                                                setDrawerConfirmHash(null);
                                              }}
                                              className="flex-1 py-2.5 theme-bg-danger text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_10px_rgba(var(--danger-rgb),0.4)]"
                                            >
                                              {t("vault_btn_confirm")}
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDrawerConfirmHash(null);
                                              }}
                                              className="flex-1 py-2.5 bg-white/5 text-[var(--text)]/60 font-black rounded-xl text-[9px] uppercase tracking-widest border border-white/10 hover:bg-white/10 transition-all"
                                            >
                                              {t("vault_btn_abort")}
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex flex-col overflow-hidden pr-2 text-left">
                                            <span className="text-[11px] text-[var(--text)] truncate font-bold uppercase group-hover/flavor:theme-text-accent transition-colors">
                                              {(
                                                flavor.displayName ||
                                                flavor.name.split("/").pop() ||
                                                ""
                                              )
                                                .replace(/_/g, " ")
                                                .replace(
                                                  /\.package$|\.ts4script$/i,
                                                  "",
                                                )}
                                            </span>
                                            {flavor.version &&
                                              flavor.version !== "v.Local" && (
                                                <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 tracking-tighter">
                                                  {flavor.version}
                                                </span>
                                              )}
                                          </div>
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {drawerCasualties.length > 0 && (
                                              <div className="relative group/tooltip flex items-center">
                                                <div className="absolute bottom-full right-0 mb-2 hidden group-hover/tooltip:flex flex-col bg-black/95 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl z-50 w-max max-w-48">
                                                  <span className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest mb-1.5 border-b border-white/10 pb-1">
                                                    {isFlavorEquipped
                                                      ? t("vault_yeet_cascade")
                                                      : t(
                                                          "vault_auto_removing",
                                                        )}
                                                  </span>
                                                  {drawerCasualties.map(
                                                    (r: any) => (
                                                      <span
                                                        key={r.hash || r.name}
                                                        className="text-[10px] text-[var(--text)] font-bold truncate leading-relaxed"
                                                      >
                                                        {(
                                                          r.displayName ||
                                                          r.name ||
                                                          ""
                                                        ).replace(/_/g, " ")}
                                                      </span>
                                                    ),
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (
                                                  drawerCasualties.length > 0
                                                ) {
                                                  setDrawerConfirmHash(
                                                    flavor.hash,
                                                  );
                                                } else {
                                                  toggleInActiveSet(
                                                    flavor.name,
                                                  );
                                                }
                                              }}
                                              className={`w-7 h-7 flex items-center justify-center font-black rounded-lg transition-all ${isFlavorEquipped ? "theme-bg-success text-[var(--bg)] shadow-lg" : "bg-white/10 text-[var(--text)]/40 hover:bg-white/20"}`}
                                            >
                                              {isFlavorEquipped
                                                ? t("ui_icon_check")
                                                : t("ui_icon_plus")}
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              {quarantineList.length > 0 && (
                <div
                  id="quarantine-zone"
                  className="mt-12 p-10 theme-panel-danger border rounded-[3rem] space-y-6 animate-in slide-in-from-bottom-8"
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <h3 className="theme-text-danger font-black tracking-tighter text-3xl uppercase leading-none flex items-center gap-3">
                      {t("vault_quarantine_title")}
                    </h3>
                    <p className="theme-text-danger opacity-80 font-bold text-[10px] uppercase tracking-widest pl-12">
                      {t("vault_quarantine_desc")}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                    {quarantineList.map((filename: string) => (
                      <div
                        key={filename}
                        className="theme-glass-inner p-5 rounded-2xl flex flex-col justify-between group hover:theme-border-danger transition-colors"
                      >
                        <span
                          className="text-xs font-mono text-[var(--subtext)] opacity-80 truncate mb-4"
                          title={filename}
                        >
                          {filename}
                        </span>
                        <div className="flex gap-2 mt-auto">
                          <button
                            onClick={() => restoreMod(filename)}
                            className="flex-1 px-4 py-2 bg-[var(--success)] !text-black border-none border rounded-xl"
                          >
                            {t("vault_btn_restore")}
                          </button>
                          <button
                            onClick={() => purgeMod(filename)}
                            className="flex-1 px-4 py-2 theme-panel-danger theme-btn-danger border rounded-xl"
                          >
                            {t("vault_btn_purge")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
    </>
  );
}
