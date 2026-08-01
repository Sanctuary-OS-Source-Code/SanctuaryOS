import { useState, useMemo, useEffect } from "react";
import { formatDisplayName, ViewHeader, CustomDropdown, mapDlcCode, isVersionMatch, SidePanel, standardButtonClass, standardAccentGlassButtonClass, standardDangerButtonClass, getHighestVersion, getExtensionRegex, HoverTooltip } from "./shared";
import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { tauriBridge } from "./lib/tauri-bridge";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";


export default function BlueprintArchitect({ isOpen, onClose, playSet, modList, toggleInActiveSet, allow_write, vaultPath, onRefreshMods, renamePlaySet }: any) {
  const { t } = useLexicon();
  const ownedDLC = useStore((state) => state.ownedDLC);
  const maskedDLC = useStore((state) => state.maskedDLC);
  const selectedVersion = useStore((state) => state.selectedVersion);
  const playSets = useStore((state) => state.playSets);
  const activePlaySetIndex = useStore((state) => state.activePlaySetIndex);
  const setPlaySets = useStore((state) => state.setPlaySets);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const ignoredGlobal = useStore((state) => state.ignoredGlobal);
  const [ignoredConflicts, setIgnoredConflicts] = useState<Set<string>>(new Set());
  const [ignoredBroken, setIgnoredBroken] = useState<Set<string>>(new Set());

  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");

  const extRegex = useMemo(() => getExtensionRegex(activeGameSchema), [activeGameSchema]);
  const activeMods = useMemo(() => {
    const safeMods = Array.isArray(playSet?.mods) ? playSet.mods : [];
    const safeList = Array.isArray(modList) ? modList : [];

    const exactMatchMap = new Map();
    const baseMatchMap = new Map();

    for (const m of safeList) {
      if (!m.name) continue;
      const exactKey = m.name.toLowerCase().replace(/\\/g, '/');
      exactMatchMap.set(exactKey, m);

      const baseKey = m.name.split(/[\\/]/).pop()?.replace(extRegex, '').toLowerCase();
      if (baseKey && !baseMatchMap.has(baseKey)) {
        baseMatchMap.set(baseKey, m);
      }
    }

    return safeMods.map((rawMod: any) => {
      const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
      const cleanModName = modName.replace(/^(sanctuary[/\\])+/i, '');
      const modNameLow = cleanModName.toLowerCase().replace(/\\/g, '/');

      const exactMatch = exactMatchMap.get(modNameLow);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };

      const mBase = modName.split(/[\\/]/).pop()?.replace(extRegex, '').toLowerCase();
      const baseMatch = mBase ? baseMatchMap.get(mBase) : undefined;

      if (baseMatch) return { ...baseMatch, _originalSetName: modName };

      return { name: modName, isFallback: true, _originalSetName: modName };
    });
  }, [playSet?.mods, modList, extRegex]);

  const renderSubtitle = () => {
    if (isEditingName) {
      return (
        <span className="flex items-center gap-2">
          {t("bp_subtitle")}
          <input
            autoFocus
            type="text"
            className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded px-3 py-1 outline-none text-[var(--text)] font-black uppercase text-[10px] w-64"
            value={newNameInput}
            onChange={(e) => setNewNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (renamePlaySet) renamePlaySet(playSet.name, newNameInput);
                setIsEditingName(false);
              } else if (e.key === 'Escape') {
                setIsEditingName(false);
              }
            }}
            onBlur={() => {
              if (renamePlaySet && newNameInput.trim() !== "" && newNameInput !== playSet.name) {
                renamePlaySet(playSet.name, newNameInput);
              }
              setIsEditingName(false);
            }}
          />
        </span>
      );
    }
    return (
      <span
        className="flex items-center gap-2 group cursor-pointer hover:text-[var(--text)] transition-colors"
        onClick={() => { setIsEditingName(true); setNewNameInput(playSet.name); }}
      >
        {t("bp_subtitle")} {playSet.name} ({activeMods.length} {t("items")})
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[14px] ml-1">{t("icon_edit")}</span>
      </span>
    );
  };

  const activeConflicts = useMemo(() => {
    const conflicts: any[] = [];
    try {
      const stored = localStorage.getItem("sanctuary_local_conflicts");
      if (stored) {
        const localConflicts = JSON.parse(stored);
        localConflicts.forEach((lc: any) => {
          if (ignoredGlobal.includes(lc.mod_pair)) return;

          const modAMatch = activeMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || '').toUpperCase();
            const cleanDisp = String(em.displayName || '').toUpperCase();
            const targetClean = String(lc.modA || lc.mod_a || '').toUpperCase();
            return cleanN.includes(targetClean) || cleanDisp.includes(targetClean) || targetClean.includes(cleanN);
          });
          const modBMatch = activeMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || '').toUpperCase();
            const cleanDisp = String(em.displayName || '').toUpperCase();
            const targetClean = String(lc.modB || lc.mod_b || '').toUpperCase();
            return cleanN.includes(targetClean) || cleanDisp.includes(targetClean) || targetClean.includes(cleanN);
          });

          if (modAMatch && modBMatch) {
            const isWinnerA = modAMatch._originalSetName?.toLowerCase().startsWith("sanctuary") || modAMatch.name?.toLowerCase().startsWith("sanctuary");
            const isWinnerB = modBMatch._originalSetName?.toLowerCase().startsWith("sanctuary") || modBMatch.name?.toLowerCase().startsWith("sanctuary");
            if (isWinnerA || isWinnerB) return;

            conflicts.push({
              pairId: lc.mod_pair,
              modA: modAMatch,
              modB: modBMatch,
              conflict: {
                severity_rank: lc.severity_rank,
                resolution_note: lc.resolution_note || "Local Scan Detects Tuning Overlap",
              },
            });
          }
        });
      }
    } catch (e) { }

    return conflicts;
  }, [activeMods, ignoredGlobal]);

  const brokenMods = useMemo(() => {
    return activeMods.map((mod: any) => {
      if (mod.isFallback) return null;

      let reason = null;
      let alertType = 'red';

      let isBroken = typeof mod.status === 'string' && mod.status.toLowerCase() === 'broken';
      if (isBroken && mod.compatible_versions && mod.compatible_versions.length > 0 && selectedVersion) {
        if (selectedVersion !== getHighestVersion(mod.compatible_versions)) {
          isBroken = false;
        }
      }

      if (isBroken || mod.compliance_tier === 3 || mod.compliance_tier === 4) {
        reason = t("bp_status_broken_noncompliant");
        alertType = 'red';
      } else if (mod.compatible_versions && selectedVersion && !isVersionMatch(mod.compatible_versions, selectedVersion)) {
        reason = t("bp_status_version_mismatch");
        alertType = 'red';
      } else {
        if (mod.requiredDLC) {
          let rawDLC: string[] = [];
          if (typeof mod.requiredDLC === 'string') {
            rawDLC = mod.requiredDLC.split(',').map((s: string) => s.trim());
          } else if (Array.isArray(mod.requiredDLC)) {
            rawDLC = [...mod.requiredDLC];
          }
          const activeDLC = ownedDLC.filter((d: string) => !maskedDLC.includes(d));
          const missing = rawDLC.filter((req: string) => {
            const cleanReq = req.toUpperCase().trim();
            if (cleanReq === 'BASE') return false;
            return !activeDLC.some((owned: string) => owned.toUpperCase() === cleanReq);
          });
          if (missing.length > 0) {
            const missingNames = missing.map((m: string) => mapDlcCode(m)).join(", ");
            reason = `${t("bp_status_missing_dlc")}${missingNames}`;
            alertType = 'red';
          }
        }

        if (!reason && mod.dependencies) {
          let rawDeps: string[] = [];
          if (typeof mod.dependencies === 'string') {
            rawDeps = mod.dependencies.split(',').map((s: string) => s.trim());
          } else if (Array.isArray(mod.dependencies)) {
            rawDeps = [...mod.dependencies];
          }
          if (rawDeps.length > 0) {
            const activeModNames = activeMods.map((m: any) => (m._originalSetName || m.name)?.toLowerCase());
            const missing = rawDeps.filter((req: string) => !activeModNames.includes(req.toLowerCase()));
            if (missing.length > 0) {
              reason = `${t("missing_deps")}: ${missing.join(", ")}`;
              alertType = 'red';
            }
          }
        }

        if (!reason && typeof mod.status === 'string' && mod.status.toLowerCase() === 'unstable') {
          reason = t("bp_status_unstable");
          alertType = 'amber';
        }
      }

      if (reason) {
        return { ...mod, _alert_reason: reason, _alert_type: alertType };
      }
      return null;
    }).filter(Boolean).sort((a: any, b: any) => {
      if (a._alert_type === 'red' && b._alert_type === 'amber') return -1;
      if (a._alert_type === 'amber' && b._alert_type === 'red') return 1;
      return 0;
    });
  }, [activeMods, selectedVersion, ownedDLC, maskedDLC, t]);

  const redMods = useMemo(() => brokenMods.filter((m: any) => m._alert_type === 'red'), [brokenMods]);
  const amberMods = useMemo(() => brokenMods.filter((m: any) => m._alert_type === 'amber'), [brokenMods]);

  const { applyConflictOverride } = usePlaySetLogic();

  const getPriorityDrop = (modData: any) => {
    if (!modData || modData.isFallback || !allow_write) return null;
    let currentPriority = "";
    if (modData.path) {
      const firstPart = modData.path.split(/[/\\]/)[0];
      if (["!Sanctuary", "!Sanctuary2", "!Sanctuary3"].includes(firstPart)) {
        currentPriority = firstPart;
      }
    }
    return (
      <div className="w-full mt-3">
        <CustomDropdown disableTint={true}
          value={currentPriority}
          onChange={async (newPrio: string) => {
            try {
              await tauriBridge.moveModToPriorityFolder(vaultPath, modData.name, newPrio);
              if (onRefreshMods) onRefreshMods();
            } catch (e) {
              console.error("Failed to move mod priority", e);
            }
          }}
          options={[
            { id: "", label: t("bp_priority_default") },
            { id: "!Sanctuary", label: t("bp_priority_sanctuary") },
            { id: "!Sanctuary2", label: t("bp_priority_sanctuary2") },
            { id: "!Sanctuary3", label: t("bp_priority_sanctuary3") }
          ]}
        />
      </div>
    );
  };

  if (!playSet) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("bp_title")}
      subtitle={renderSubtitle()}
      icon={t("icon_warning_amber")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[950px]"
      noScroll={true}
      noPadding={true}
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
          <button onClick={onClose} className={standardButtonClass}>
            <span className="material-symbols-outlined !text-[18px]">{t("icon_close")}</span>
            {t("nav_cancel")}
          </button>
          <button onClick={onClose} className={standardAccentGlassButtonClass}>
            <span className="material-symbols-outlined !text-[18px]">{allow_write ? "done_all" : "logout"}</span>
            {allow_write ? t("bp_btn_finalize") : t("bp_btn_exit_preview")}
          </button>
        </div>
      }
    >
      <div className="flex-1 min-h-0 flex gap-8 p-8 pb-12 w-full">
        <div className="flex-1 flex flex-col relative rounded-[var(--radius)] overflow-hidden transition-all duration-500 theme-glass-panel shadow-2xl min-h-0">
          <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-amber-500 via-transparent to-transparent opacity-5 pointer-events-none" />

          <div className="relative z-10 flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {(() => {
              const tier4Count = activeConflicts.filter(c => c.conflict.severity_rank == 4).length;
              const tier3Count = activeConflicts.length - tier4Count;
              return (
                <div className="px-8 py-8 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined !text-[18px] text-amber-500">{t("icon_tune")}</span>
                    <h3 className="text-[14px] font-black text-[var(--text)] uppercase tracking-[0.25em] translate-y-[1px]">
                      {t("bp_load_order_conflicts")}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest pl-[26px]">
                    <span>{activeConflicts.length} {t("items")}</span>
                    {(tier4Count > 0 || tier3Count > 0) && <span className="opacity-50">•</span>}
                    {tier4Count > 0 && <span className="text-red-400">{tier4Count} {t("bp_pill_fatal")}</span>}
                    {tier3Count > 0 && <span className="text-amber-400">{tier3Count} {t("bp_pill_overlaps")}</span>}
                    {activeConflicts.length === 0 && <span className="text-[var(--success)]">• {t("bp_no_conflicts_detected")}</span>}
                  </div>
                </div>
              );
            })()}

            <div className="p-8 flex flex-col gap-6 pb-24">
              {activeConflicts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4">
                  <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">{t("icon_security")}</span>
                  <p className="text-[10px] font-black tracking-widest uppercase text-center">{t("bp_no_conflicts_detected")}</p>
                </div>
              ) : (
                activeConflicts.map((ac) => {
                  const isIgnored = ignoredConflicts.has(ac.pairId);
                  const isTier4 = ac.conflict.severity_rank == 4;

                  const isWinnerA = (ac.modA._originalSetName || ac.modA.name)?.toLowerCase().startsWith("sanctuary/") || (ac.modA._originalSetName || ac.modA.name)?.toLowerCase().startsWith("sanctuary\\");
                  const isWinnerB = (ac.modB._originalSetName || ac.modB.name)?.toLowerCase().startsWith("sanctuary/") || (ac.modB._originalSetName || ac.modB.name)?.toLowerCase().startsWith("sanctuary\\");

                  const borderClass = isTier4 ? "border-red-500/30" : "border-amber-500/30";
                  const bgClass = isTier4 ? "bg-red-500/5 hover:bg-red-500/10" : "bg-amber-500/5 hover:bg-amber-500/10";
                  const shadowClass = isTier4 ? "hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]" : "hover:shadow-[0_0_30px_rgba(245,158,11,0.2)]";
                  const textClass = isTier4 ? "text-red-500" : "text-amber-500";
                  const iconName = isTier4 ? (t("icon_crisis_alert")) : (t("icon_tune"));
                  return (
                    <div
                      key={ac.pairId}
                      className={`w-full rounded-[var(--radius)] border transition-all duration-500 relative group/alert shrink-0 ${isIgnored
                        ? 'opacity-50 grayscale border-white/5 bg-black/20'
                        : `${borderClass} ${bgClass} shadow-lg ${shadowClass}`
                        }`}
                    >

                      <div className="relative p-5 z-10 flex flex-col gap-1 w-full">
                        <div className="flex justify-between items-center w-full mb-1">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner ${isIgnored ? 'border-white/10 bg-black/50' : `${isTier4 ? 'border-red-500/50 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]'}`
                              }`}>
                              <span className={`material-symbols-outlined !text-[20px] ${isIgnored ? 'text-[var(--text)] opacity-30' : textClass}`}>{iconName}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className={`text-[11px] font-black uppercase tracking-widest ${textClass}`}>
                                {isTier4 ? t("fatal_conflict") : t("tier3_conflict")}
                              </span>
                              <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-0.5">
                                {ac.conflict.resolution_note || "Local Scan Detects Tuning Overlap"}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              const newSet = new Set(ignoredConflicts);
                              if (isIgnored) newSet.delete(ac.pairId);
                              else newSet.add(ac.pairId);
                              setIgnoredConflicts(newSet);
                            }}
                            className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] transition-all active:scale-95 flex items-center justify-center shrink-0 ml-4 group relative"
                          >
                            <span className="material-symbols-outlined !text-[16px]">{isIgnored ? "visibility" : "visibility_off"}</span>
                            <HoverTooltip title={isIgnored ? t("bp_restore_alert") : t("btn_ignore")} variant="default" className="!left-auto !right-0 !translate-x-0" />
                          </button>
                        </div>

                        <div className={`flex flex-col gap-2 w-full mt-2 ${isIgnored ? 'opacity-30' : ''}`}>
                          <div className={`w-full flex items-center p-3 rounded-xl border transition-all relative group/card hover:border-white/20 ${isWinnerA && !isTier4 ? 'border-[var(--success)]/50 bg-[var(--success)]/10 shadow-[0_0_15px_rgba(var(--success-rgb),0.1)]' : 'bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />

                            <div className="flex flex-col gap-1 relative z-10 flex-1 min-w-0 pr-4 group/title">
                              <span className={`text-[12px] font-semibold truncate ${isWinnerA && !isTier4 ? 'text-[var(--success)]' : 'text-[var(--text)]'}`}>
                                {formatDisplayName(ac.modA.name)}
                              </span>
                              <HoverTooltip title={formatDisplayName(ac.modA.name)} variant="default" className="!hidden group-hover/title:!flex z-[100]" />
                              <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20 w-fit">
                                {ac.modA.version || "v.Local"}
                              </span>
                            </div>

                            <div className="relative z-10 flex items-center shrink-0">
                              {ac.conflict.severity_rank == 4 ? (
                                allow_write && (
                                  <button
                                    onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)}
                                    className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 transition-all active:scale-95 flex items-center justify-center group relative"
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                                    <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" className="!left-auto !right-0 !translate-x-0" />
                                  </button>
                                )
                              ) : ac.conflict.severity_rank == 3 ? (
                                isWinnerA ? (
                                  <div className="h-8 w-8 rounded-lg bg-[var(--success)]/20 border border-[var(--success)]/50 text-[var(--success)] flex items-center justify-center shadow-[0_0_10px_rgba(var(--success-rgb),0.3)]" title={t("bp_winning_artifact")}>
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_star")}</span>
                                  </div>
                                ) : isWinnerB ? (
                                  <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-[var(--subtext)] opacity-60 flex items-center justify-center" title={t("bp_overridden_by_winner")}>
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_block")}</span>
                                  </div>
                                ) : (
                                  allow_write && (
                                    <button
                                      onClick={() => applyConflictOverride(ac.modA._originalSetName || ac.modA.name, ac.pairId, playSet.name)}
                                      className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[var(--success)] transition-all active:scale-95 flex items-center justify-center group relative"
                                    >
                                      <span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle")}</span>
                                      <HoverTooltip title={t("bp_select_winning_artifact")} variant="default" className="!left-auto !right-0 !translate-x-0" />
                                    </button>
                                  )
                                )
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-32">{getPriorityDrop(ac.modA)}</div>
                                  {allow_write && (
                                    <button
                                      onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)}
                                      className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 transition-all active:scale-95 flex items-center justify-center group relative"
                                    >
                                      <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                                      <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" className="!left-auto !right-0 !translate-x-0" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className={`w-full flex items-center p-3 rounded-xl border transition-all relative group/card hover:border-white/20 ${isWinnerB && !isTier4 ? 'border-[var(--success)]/50 bg-[var(--success)]/10 shadow-[0_0_15px_rgba(var(--success-rgb),0.1)]' : 'bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}`}>
                            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />

                            <div className="flex flex-col gap-1 relative z-10 flex-1 min-w-0 pr-4 group/title">
                              <span className={`text-[12px] font-semibold truncate ${isWinnerB && !isTier4 ? 'text-[var(--success)]' : 'text-[var(--text)]'}`}>
                                {formatDisplayName(ac.modB.name)}
                              </span>
                              <HoverTooltip title={formatDisplayName(ac.modB.name)} variant="default" className="!hidden group-hover/title:!flex z-[100]" />
                              <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20 w-fit">
                                {ac.modB.version || "v.Local"}
                              </span>
                            </div>

                            <div className="relative z-10 flex items-center shrink-0">
                              {ac.conflict.severity_rank == 4 ? (
                                allow_write && (
                                  <button
                                    onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)}
                                    className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 transition-all active:scale-95 flex items-center justify-center group relative"
                                  >
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                                    <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" className="!left-auto !right-0 !translate-x-0" />
                                  </button>
                                )
                              ) : ac.conflict.severity_rank == 3 ? (
                                isWinnerB ? (
                                  <div className="h-8 w-8 rounded-lg bg-[var(--success)]/20 border border-[var(--success)]/50 text-[var(--success)] flex items-center justify-center shadow-[0_0_10px_rgba(var(--success-rgb),0.3)]" title={t("bp_winning_artifact")}>
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_star")}</span>
                                  </div>
                                ) : isWinnerA ? (
                                  <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-[var(--subtext)] opacity-60 flex items-center justify-center" title={t("bp_overridden_by_winner")}>
                                    <span className="material-symbols-outlined !text-[16px]">{t("icon_block")}</span>
                                  </div>
                                ) : (
                                  allow_write && (
                                    <button
                                      onClick={() => applyConflictOverride(ac.modB._originalSetName || ac.modB.name, ac.pairId, playSet.name)}
                                      className="h-8 w-8 rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] hover:border-[var(--success)] transition-all active:scale-95 flex items-center justify-center group relative"
                                    >
                                      <span className="material-symbols-outlined !text-[16px]">{t("icon_check_circle")}</span>
                                      <HoverTooltip title={t("bp_select_winning_artifact")} variant="default" />
                                    </button>
                                  )
                                )
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-32">{getPriorityDrop(ac.modB)}</div>
                                  {allow_write && (
                                    <button
                                      onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)}
                                      className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 hover:border-red-500 hover:bg-red-500/20 text-red-400 transition-all active:scale-95 flex items-center justify-center group relative"
                                    >
                                      <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                                      <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col relative rounded-[var(--radius)] overflow-hidden transition-all duration-500 theme-glass-panel shadow-2xl min-h-0">
          <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-amber-500 via-transparent to-transparent opacity-5 pointer-events-none" />

          <div className="relative z-10 flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="px-8 py-8 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex flex-col gap-1.5 relative">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[18px] text-red-500">{t("icon_security")}</span>
                <h3 className="text-[14px] font-black text-[var(--text)] uppercase tracking-[0.25em] translate-y-[1px]">
                  {t("bp_compatibility_scanner")}
                </h3>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest pl-[26px]">
                <span>{brokenMods.length} {t("items")}</span>
                {(redMods.length > 0 || amberMods.length > 0) && <span className="opacity-50">•</span>}
                {redMods.length > 0 && <span className="text-red-400">{redMods.length} {t("bp_pill_corrupted")}</span>}
                {amberMods.length > 0 && <span className="text-amber-400">{amberMods.length} {t("bp_pill_unstable")}</span>}
                {brokenMods.length === 0 && <span className="text-[var(--success)]">• {t("auto_0")} {t("items")}</span>}
              </div>
            </div>

              {allow_write && brokenMods.length > 0 && (
                <div className="flex gap-2 w-full p-8 pb-0">
                  {redMods.length > 0 && (
                    <button onClick={() => {
                      redMods.forEach((m: any) => toggleInActiveSet(m._originalSetName || m.name, true, true));
                    }} className={`flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[10px] font-black uppercase tracking-widest relative z-10 flex items-center justify-center gap-2 transition-all active:scale-95`}>
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_delete_sweep")}</span>
                      {(t("bp_purge_corrupted")).replace("{0}", String(redMods.length))}
                    </button>
                  )}
                  {amberMods.length > 0 && (
                    <button onClick={() => {
                      amberMods.forEach((m: any) => toggleInActiveSet(m._originalSetName || m.name, true, true));
                    }} className={`flex-1 py-3 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-[10px] font-black uppercase tracking-widest relative z-10 flex items-center justify-center gap-2 transition-all active:scale-95`}>
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_delete_sweep")}</span>
                      {(t("bp_purge_unstable")).replace("{0}", String(amberMods.length))}
                    </button>
                  )}
                </div>
              )}
            <div className="p-8 flex flex-col gap-4 pb-24">
              {brokenMods.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-50 space-y-4">
                  <span className="material-symbols-outlined !text-6xl theme-text-success drop-shadow-sm">{t("icon_check_circle")}</span>
                  <p className="text-[10px] font-black tracking-widest uppercase text-center">{t("bp_no_broken_mods_detected")}</p>
                </div>
              ) : (
                <>


                  {brokenMods.map((mod: any) => {
                    const isIgnored = ignoredBroken.has(mod.name);
                    const isAmber = mod._alert_type === 'amber';
                    return (
                      <div
                        key={mod.name}
                        className={`relative shrink-0 group/alert w-full rounded-[var(--radius)] transition-all duration-500 border flex items-center ${isIgnored
                          ? 'opacity-50 grayscale border-white/5 bg-black/20'
                          : isAmber
                            ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
                            : 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]'
                          }`}
                      >
                        <div className="relative p-4 z-10 flex items-center gap-3 w-full">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner ${isIgnored ? 'border-white/10 bg-black/50' : isAmber ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'border-[color-mix(in_srgb,var(--danger)_50%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_20%,transparent)]'
                            }`}>
                            <span className={`material-symbols-outlined !text-[20px] ${isIgnored ? 'text-[var(--text)] opacity-30' : isAmber ? 'text-amber-400' : 'theme-text-danger'}`}>{isAmber ? "gpp_maybe" : "gpp_bad"}</span>
                          </div>

                          <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-4 group/title relative">
                            <span className="text-[12px] font-semibold text-[var(--text)] truncate">
                              {formatDisplayName(mod.name)}
                            </span>
                            <HoverTooltip title={formatDisplayName(mod.name)} variant="default" className="!hidden group-hover/title:!flex z-[100]" />
                            <div className="flex items-center gap-2 mt-0.5 overflow-hidden">
                              <span className="text-[9px] font-mono text-cyan-400 tracking-widest opacity-80 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20 shrink-0">
                                {mod.version || "v.Local"}
                              </span>
                              <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate">
                                {mod._alert_reason}
                              </span>
                            </div>
                          </div>

                          <div className="relative z-10 flex items-center shrink-0 gap-2">
                            <button
                              onClick={() => {
                                const newSet = new Set(ignoredBroken);
                                if (isIgnored) newSet.delete(mod.name);
                                else newSet.add(mod.name);
                                setIgnoredBroken(newSet);
                              }}
                              className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] transition-all active:scale-95 flex items-center justify-center group relative"
                            >
                              <span className="material-symbols-outlined !text-[16px]">{isIgnored ? "visibility" : "visibility_off"}</span>
                              <HoverTooltip title={isIgnored ? t("bp_restore_alert") : t("btn_ignore")} variant="default" className="!left-auto !right-0 !translate-x-0" />
                            </button>

                            {allow_write && !isIgnored && (
                              <button
                                onClick={() => toggleInActiveSet(mod._originalSetName || mod.name, true, true)}
                                className={`w-8 h-8 rounded-lg border transition-all active:scale-95 flex items-center justify-center group relative ${isAmber ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/30 hover:border-amber-500/60 hover:text-amber-200' : 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_60%,transparent)] hover:text-[var(--danger)]'}`}
                              >
                                <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                                <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" className="!left-auto !right-0 !translate-x-0" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

