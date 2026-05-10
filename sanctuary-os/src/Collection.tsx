import React from 'react';
import { ViewHeader, CustomDropdown } from './shared';
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
    openUrl, setLocalFolderName, setLocalFolderType, executeHotSwap, equipPlaySet, setMetaNameInput, 
    setMetaAuthorInput, setMetaVersionInput, setActiveDossier, setDrawerConfirmHash, 
    quarantineList, restoreMod, purgeMod, ownedDLC, maskedDLC, setMetaDescInput, 
    setMetaImageInput, setMetaAllowWriteInput, expandedFolder, setExpandedFolder, 
    drawerConfirmHash, modList, anarchyRules
  } = props;
  const { t } = useLexicon();
  
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 50;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [equipFilter, activeCategory, activeSubType, searchQuery, filterStatus, isBulkMode]);

  const finalVisibleMods = visibleMods.filter((mod: any) => {
    if (mod.isVirtual) return true;
    const folderExists = displayModList.some(
      (v: any) =>
        v.isVirtual &&
        (String(v.dbId) === String(mod.familyId) ||
          String(v.dbId) === String(mod.setId)),
    );
    return !folderExists;
  });

  const totalPages = Math.max(1, Math.ceil(finalVisibleMods.length / itemsPerPage));
  const paginatedMods = finalVisibleMods.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  
  return (
    <>
            <div className="flex flex-col gap-8 animate-in fade-in duration-700">
              <ViewHeader
                title={t("vault_title")}
                subtitle={t("vault_subtitle")}
              >
                <div className="flex flex-col gap-3 items-end">
                  
                  <div className="flex gap-4 items-center">
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
                      onClick={() => setIsDropzoneOpen(true)}
                      className="w-[220px] h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all theme-btn-standard shadow-md flex items-center justify-center gap-2 shrink-0"
                    >
                      <span className="text-lg"></span> {t("vault_btn_add_assets")}
                    </button>
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
                  </div>

                  <div className="flex gap-4 items-center">
                    <button
                      onClick={() => runRadarSweep(false)}
                      className="w-12 h-12 rounded-2xl theme-glass-inner flex items-center justify-center text-[var(--text)] hover:theme-bg-accent transition-all shadow-md shrink-0"
                    >
                      {t("ui_icon_refresh") || "⟳"}
                    </button>
                    {playSets.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="w-[180px]">
                          <CustomDropdown
                            value={props.activePlaySetIndex}
                            options={playSets.map((set: any, idx: number) => ({ id: idx, label: set.name }))}
                            onChange={(val: any) => props.setActivePlaySetIndex && props.setActivePlaySetIndex(Number(val))}
                          />
                        </div>
                        <button
                          onClick={() => equipPlaySet && equipPlaySet(playSets[props.activePlaySetIndex]?.name)}
                          className="h-12 px-6 rounded-2xl theme-bg-success text-[var(--bg)] text-[10px] font-black uppercase tracking-widest shadow-md hover:opacity-90 transition-all flex items-center gap-2"
                        >
                          {t("ui_icon_success")} Save
                        </button>
                      </div>
                    )}
                  </div>
                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-8">
                {paginatedMods
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
                              (r: any) => {
                                const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                                const reqName = typeof r === 'string' ? r : r.name;
                                const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                                const isReqNumeric = !isNaN(Number(reqName));
                                return (reqId && String(current.dbId) === String(reqId)) ||
                                       (reqId && current.hash === reqId) ||
                                       (!isReqNumeric && reqBaseName && current.displayName && (current.displayName.toUpperCase().includes(reqBaseName) || current.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))));
                              }
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
                    if (anarchyRules?.intercept === false) {
                      casualties = [];
                    }

                    const missingReqs: any[] = [];
                    const checkModDeps = (m: any) => {
                      m.missingReqs = [];
                      const pushMissing = (reqOrStr: any, fallbackUrl?: string) => {
                        const isObj = typeof reqOrStr === 'object';
                        const id = isObj ? (reqOrStr.name || reqOrStr.id) : reqOrStr;
                        const finalUrl = isObj ? (reqOrStr.url || reqOrStr.link) : fallbackUrl;
                        if (!missingReqs.some(r => r.id === id)) missingReqs.push({ id, url: finalUrl });
                        if (!m.missingReqs.some((r: any) => r.id === id)) m.missingReqs.push({ id, url: finalUrl });
                      };

                      const requiresMcCmd = m.twins?.some((t: any) => (t.name || "").toUpperCase().replace(/_/g, " ").includes("MC CMD CENTER") || String(t.id) === "1000") || 
                                            m.requirements?.some((r: any) => (r.name || "").toUpperCase().replace(/_/g, " ").includes("MC CMD CENTER") || String(r.id) === "1000");
                      if (requiresMcCmd || (m.displayName && m.displayName.toUpperCase().replace(/_/g, " ").includes("MC CMD CENTER")) || (m.name && m.name.toUpperCase().replace(/_/g, " ").includes("MC CMD CENTER"))) {
                         const hasPkg = modList.some((ml: any) => ml.name?.toLowerCase().includes("mc_cmd_center") && ml.name?.toLowerCase().endsWith(".package"));
                         const hasScript = modList.some((ml: any) => ml.name?.toLowerCase().includes("mc_cmd_center") && ml.name?.toLowerCase().endsWith(".ts4script"));
                         if (!hasPkg || !hasScript) {
                           pushMissing("MC CMD CENTER CORE");
                         }
                      }

                      if (m.requirements) {
                        m.requirements.forEach((req: any) => {
                          const reqId = typeof req === 'string' ? req : req.id || req.dbId;
                          const reqName = typeof req === 'string' ? req : req.name;
                          const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                          const isReqNumeric = !isNaN(Number(reqName));
                          const match = modList.find((ml: any) => 
                            !ml.isVirtual && (
                              (reqId && String(ml.dbId) === String(reqId)) || 
                              (reqId && ml.hash === reqId) ||
                              (!isReqNumeric && reqBaseName && ml.displayName && (ml.displayName.toUpperCase().includes(reqBaseName) || ml.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))))
                            )
                          );
                          
                          if (!match) pushMissing(req);
                        });
                      }
                      if (m.twins) {
                        m.twins.forEach((twin: any) => {
                          const twinId = typeof twin === 'string' ? twin : twin.id || twin.dbId;
                          const twinName = typeof twin === 'string' ? twin : twin.name;
                          const twinBaseName = twinName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                          const isTwinNumeric = !isNaN(Number(twinName));
                          const match = modList.find((ml: any) => 
                            !ml.isVirtual && 
                            ml.hash !== m.hash && 
                            (
                              (twinId && String(ml.dbId) === String(twinId)) || 
                              (twinId && ml.hash === twinId) ||
                              (!isTwinNumeric && twinBaseName && ml.displayName && (ml.displayName.toUpperCase().includes(twinBaseName) || ml.displayName.toUpperCase().replace(/_/g, " ").includes(twinBaseName.replace(/_/g, " "))))
                            )
                          );
                          
                          if (!match) pushMissing(twin);
                        });
                      }

                    };

                    checkModDeps(mod);
                    if (mod.isVirtual && mod.flavors) {
                      mod.flavors.forEach(checkModDeps);
                    }

                    const tier3List: any[] = [];
                    return (
                      <div key={mainKey} className="contents">
                        <ModCard
                          mod={mod}
                          ownedDLC={ownedDLC}
                          maskedDLC={maskedDLC}
                          isInActiveSet={isEquipped}
                          casualtyList={casualties}
                          anarchyRules={anarchyRules}
                          tier3List={tier3List}
                          missingDeps={missingReqs}
                          onToggleSet={(e: any, excludeBroken?: boolean) => {
                            e.stopPropagation();
                            toggleInActiveSet(mod.name, excludeBroken);
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
                                                (r: any) => {
                                                  const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                                                  const reqName = typeof r === 'string' ? r : r.name;
                                                  const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "").toUpperCase();
                                                  const isReqNumeric = !isNaN(Number(reqName));
                                                  return (reqId && String(current.dbId) === String(reqId)) ||
                                                         (reqId && current.hash === reqId) ||
                                                         (!isReqNumeric && reqBaseName && current.displayName && (current.displayName.toUpperCase().includes(reqBaseName) || current.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))));
                                                }
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
                                  if (anarchyRules?.intercept === false) {
                                    drawerCasualties = [];
                                  }
                                  const missingPacks = flavor.requiredDLC?.filter((p: string) => !ownedDLC.includes(p) || maskedDLC.includes(p)) || [];
                                  const hasMissingDeps = flavor.missingReqs && flavor.missingReqs.length > 0;
                                  const isFlavorGhosted = missingPacks.length > 0 || hasMissingDeps;
                                  
                                  if (flavor.displayName?.toUpperCase().includes("MC ") || flavor.name?.toUpperCase().includes("MC")) {
                                    console.log("DRAWER FLAVOR RENDER:", flavor.name || flavor.displayName, "ghosted:", isFlavorGhosted, "missingReqs:", flavor.missingReqs, "reqs:", flavor.requirements);
                                  }

                                  const isConfirming = drawerConfirmHash === flavor.hash;
                                  return (
                                    <div
                                      key={`sub-${flavor.hash}-${subIdx}`}
                                      className={`p-3 border rounded-xl relative flex transition-all cursor-pointer min-h-[56px] group/flavorshadow ${isConfirming ? "bg-transparent border-transparent flex-col items-stretch p-0" : isFlavorGhosted ? "bg-red-950/20 border-[var(--danger)]/30 hover:border-[var(--danger)]/50 opacity-50 grayscale" : "bg-black/40 border-white/5 hover:theme-border-accent"} ${isConfirming ? "" : "items-center justify-between"}`}
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
                                      {isFlavorGhosted && !isConfirming && (
                                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-[70] hidden group-hover/flavorshadow:flex bg-black/90 backdrop-blur-md border border-[var(--danger)] px-3 py-1.5 rounded-lg shadow-[0_0_15px_rgba(var(--danger-rgb),0.5)] items-center justify-center whitespace-nowrap text-[9px] font-black theme-text-danger max-w-[250px] pointer-events-none transition-all animate-in fade-in slide-in-from-bottom-2">
                                            <div className="truncate">
                                              {hasMissingDeps ? `MISSING ARTIFACT: ${flavor.missingReqs.map((d: any) => String(typeof d === 'string' ? d : (d.id || d.name || '')).split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "")).join(", ")}` : `MISSING DLC: ${missingPacks.join(", ")}`}
                                            </div>
                                          </div>
                                        )}
                                      {isConfirming ? (
                                        <div
                                          className="w-full flex flex-col rounded-2xl border-2 theme-border-danger p-4 animate-in fade-in zoom-in-95 shadow-xl"
                                          style={{
                                            backgroundColor: "var(--bg)",
                                          }}
                                        >
                                          {isFlavorGhosted && !isFlavorEquipped ? (
                                            <>
                                              <div className="flex items-center gap-2 mb-3 shrink-0">
                                                <div className="flex flex-col">
                                                  <span className="text-[10px] font-black theme-text-danger uppercase tracking-widest">
                                                    MISSING DEPENDENCIES
                                                  </span>
                                                  <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-tighter">
                                                    PROCEED WITH CAUTION
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="flex-1 flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1 mb-4">
                                                {hasMissingDeps ? (
                                                  <>
                                                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">Missing Artifacts:</p>
                                                    {flavor.missingReqs.map((req: any) => {
                                                      const reqIdStr = String(typeof req === 'string' ? req : (req.id || req.name || ''));
                                                      const reqUrl = typeof req === 'string' ? null : req.url;
                                                      const cleanName = reqIdStr.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, "") || reqIdStr;
                                                      const searchUrl = reqUrl || `https://www.google.com/search?q=Sims+4+${encodeURIComponent(cleanName)}`;
                                                      return (
                                                        <a 
                                                          key={reqIdStr} 
                                                          href="#" 
                                                          className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center justify-between gap-2 mb-1 hover:bg-white/10 transition-colors cursor-pointer" 
                                                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openUrl(searchUrl); }}
                                                        >
                                                          <span className="truncate">{cleanName}</span>
                                                          <span className="text-[10px] opacity-70">🔗</span>
                                                        </a>
                                                      );
                                                    })}
                                                  </>
                                                ) : (
                                                  <>
                                                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-60 uppercase mb-1 ml-1">Missing DLC Packs:</p>
                                                    {missingPacks.map((p: string) => (
                                                      <div key={p} className="theme-glass-inner px-3 py-2 rounded-xl text-[9px] font-bold theme-text-danger truncate flex items-center gap-2 mb-1">
                                                        {p}
                                                      </div>
                                                    ))}
                                                  </>
                                                )}
                                              </div>
                                            </>
                                          ) : (
                                            <>
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
                                            </>
                                          )}
                                          <div className="flex gap-2 pt-3 border-t border-white/10 shrink-0">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleInActiveSet(flavor.name);
                                                setDrawerConfirmHash(null);
                                              }}
                                              className="flex-1 py-2.5 theme-bg-danger text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_10px_rgba(var(--danger-rgb),0.4)]"
                                            >
                                              {t("modcard_btn_proceed")}
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDrawerConfirmHash(null);
                                              }}
                                              className="flex-1 py-2.5 theme-bg-success text-[var(--bg)] font-black rounded-xl text-[9px] uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_10px_rgba(var(--success-rgb),0.4)]"
                                            >
                                              {t("modcard_btn_safety")}
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex flex-col overflow-hidden pr-2 text-left gap-1">
                                            <div className="flex items-center gap-2">
                                              {flavor.relationshipType === 'beta' && <span className="theme-bg-danger text-[var(--bg)] px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">{t("badge_beta") || "BETA"}</span>}
                                              {(!flavor.relationshipType || flavor.relationshipType === 'core') && <span className="theme-bg-success text-[var(--bg)] px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">{t("badge_stable") || "STABLE"}</span>}
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
                                            </div>
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
                                                if (!isFlavorEquipped && isFlavorGhosted) {
                                                  setDrawerConfirmHash(flavor.hash);
                                                } else if (
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
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-4 mb-12">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
                  >
                    {t("nav_prev") || "PREV"}
                  </button>
                  <span className="text-[12px] font-black uppercase tracking-widest text-[var(--subtext)] px-4">
                    {currentPage} / {totalPages}
                  </span>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-6 py-3 theme-glass-inner rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 hover:bg-white/5 transition-all text-[var(--text)] border border-white/5"
                  >
                    {t("nav_next") || "NEXT"}
                  </button>
                </div>
              )}
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
