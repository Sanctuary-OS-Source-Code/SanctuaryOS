import { useState, useMemo, useEffect } from "react";
import { formatDisplayName, ViewHeader, CustomDropdown, mapDlcCode, isVersionMatch, SidePanel, standardButtonClass, standardAccentGlassButtonClass, standardDangerButtonClass, getHighestVersion, getExtensionRegex, HoverTooltip, ActionButton } from "./shared";
import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { tauriBridge } from "./lib/tauri-bridge";
import { usePlaySetLogic } from "./hooks/usePlaySetLogic";
import { UniversalCard } from "./components/universal/UniversalCard";
import { IncompatibleModCard } from "./side-panels/CommandIncompatiblePanel";

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
            className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded px-3 py-1 outline-none text-[var(--text)] font-black capitalize text-[10px] w-64"
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
      widthClass="w-[1100px] max-w-[95vw]"
      noScroll={true}
      noPadding={true}
      footer={
        <div className="flex justify-center items-center gap-4 w-full">
          <ActionButton onClick={onClose} label={t("nav_cancel")} icon={t("icon_close")}>


          </ActionButton>
          <ActionButton onClick={onClose} label={allow_write ? t("bp_btn_finalize") : t("bp_btn_exit_preview")} icon={allow_write ? "done_all" : "logout"}>


          </ActionButton>
        </div>
      }
    >
      <div className="flex-1 min-h-0 flex gap-8 px-6 py-2 pb-12 w-full">
        <div className="flex-[5] flex flex-col min-h-0 min-w-0">
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-4">
            {(() => {
              const tier4Count = activeConflicts.filter(c => c.conflict.severity_rank == 4).length;
              const tier3Count = activeConflicts.length - tier4Count;
              return (
                <div className="px-1 py-2 shrink-0 flex flex-col gap-4 relative mb-4">
                  <div className="flex items-center justify-start w-full relative z-10">
                    <h3 className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-[0.2em] opacity-80">{t("bp_load_order_conflicts")}</h3>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-widest">
                      <span>{activeConflicts.length} {t("items")}</span>
                      {(tier4Count > 0 || tier3Count > 0) && <span className="opacity-50">•</span>}
                      {tier4Count > 0 && <span className="text-red-400">{tier4Count} {t("bp_pill_fatal")}</span>}
                      {tier3Count > 0 && <span className="text-amber-400">{tier3Count} {t("bp_pill_overlaps")}</span>}
                      {activeConflicts.length === 0 && <span className="text-[var(--success)]">• {t("bp_no_conflicts_detected")}</span>}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className={activeConflicts.length === 0 ? "flex flex-col flex-1" : "flex flex-col gap-6 pb-24"}>
              {activeConflicts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-12 relative group">
                  <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--success)_5%,transparent)] to-transparent rounded-[var(--radius)] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  <div className="relative w-24 h-24 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] shadow-[0_0_30px_rgba(var(--success-rgb),0.2)] group-hover:shadow-[0_0_50px_rgba(var(--success-rgb),0.3)] transition-all duration-700">
                    <div className="absolute inset-0 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] animate-[ping_3s_ease-in-out_infinite] opacity-20" />
                    <span className="material-symbols-outlined text-[var(--success)] drop-shadow-[0_0_10px_rgba(var(--success-rgb),0.5)] group-hover:scale-110 transition-transform duration-500">{t("icon_security")}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[14px] font-black tracking-[0.2em] capitalize text-[var(--text)] text-center group-hover:text-[var(--success)] transition-colors">{t("bp_no_conflicts_detected")}</p>
                  </div>
                </div>
              ) : (
                activeConflicts.map((ac) => {
                  const isIgnored = ignoredConflicts.has(ac.pairId);
                  const isTier4 = ac.conflict.severity_rank == 4;

                  const prefixA = (ac.modA._originalSetName || ac.modA.name)?.split(/[/\\]/).slice(0, -1).join("/") || "";
                  const prefixB = (ac.modB._originalSetName || ac.modB.name)?.split(/[/\\]/).slice(0, -1).join("/") || "";
                  const isWinnerA = prefixA.toLowerCase() === "sanctuary";
                  const isWinnerB = prefixB.toLowerCase() === "sanctuary";

                  const textClass = isTier4 ? "text-red-500" : "text-amber-500";
                  const iconName = isTier4 ? t("icon_crisis_alert") : t("icon_tune");

                  return (
                    <UniversalCard
                      key={ac.pairId}
                      layout="vertical"
                      isGhosted={isIgnored}
                      statusColor={isIgnored ? "border-[color-mix(in_srgb,var(--text)_5%,transparent)]" : isTier4 ? "theme-border-danger" : "border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"}
                      className={`w-full ${isIgnored ? "bg-[color-mix(in_srgb,var(--text)_2%,transparent)]" : isTier4 ? "bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]" : "bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]"}`}
                      title={
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined !text-[16px] ${isIgnored ? "text-[var(--text)] opacity-30" : textClass}`}>
                            {iconName}
                          </span>
                          <span className={`text-[10px] font-black capitalize tracking-widest ${isIgnored ? "text-[var(--text)] opacity-30" : textClass}`}>
                            {isTier4 ? t("fatal_conflict") : t("tier3_conflict")}
                          </span>
                        </div>
                      }
                      subtitle={ac.conflict.resolution_note || "Local Scan Detects Tuning Overlap"}
                      actions={
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const newSet = new Set(ignoredConflicts);
                            if (isIgnored) newSet.delete(ac.pairId);
                            else newSet.add(ac.pairId);
                            setIgnoredConflicts(newSet);
                          }}
                          className="w-7 h-7 rounded-[max(0px,calc(var(--radius)-4px))] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] transition-all active:scale-95 flex items-center justify-center shrink-0 group relative"
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {isIgnored ? "visibility" : "visibility_off"}
                          </span>
                          <HoverTooltip title={isIgnored ? t("bp_restore_alert") : t("btn_ignore")} variant="default" />
                        </button>
                      }
                    >
                      <div className={`flex flex-col gap-2 w-full ${isIgnored ? "opacity-30 pointer-events-none" : ""}`}>
                        {/* Mod A */}
                        <div className={`flex items-center gap-3 p-3 rounded-xl border ${isWinnerA && !isTier4 ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]" : "bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)]"}`}>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className={`text-[10px] font-black truncate capitalize ${isWinnerA && !isTier4 ? "text-[var(--success)]" : "text-[var(--text)]"}`}>{formatDisplayName(ac.modA.name)}</span>
                            <span className="text-[8px] font-mono text-cyan-400 tracking-widest opacity-80 mt-0.5">{ac.modA.version || "v.Local"}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {ac.conflict.severity_rank == 4 ? (
                              allow_write && (
                                <button onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)} className="w-7 h-7 rounded border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-500 transition-all flex items-center justify-center group relative">
                                  <span className="material-symbols-outlined !text-[14px]">{t("icon_delete")}</span>
                                  <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" />
                                </button>
                              )
                            ) : ac.conflict.severity_rank == 3 ? (
                              isWinnerA ? (
                                <div className="w-7 h-7 rounded bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] flex items-center justify-center shadow-[0_0_10px_rgba(var(--success-rgb),0.3)] group relative">
                                  <span className="material-symbols-outlined !text-[14px]">{t("icon_star")}</span>
                                  <HoverTooltip title={t("bp_winning_artifact")} variant="default" />
                                </div>
                              ) : isWinnerB ? (
                                <div className="w-7 h-7 rounded bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] opacity-60 flex items-center justify-center group relative">
                                  <span className="material-symbols-outlined !text-[14px]">{t("icon_block")}</span>
                                  <HoverTooltip title={t("bp_overridden_by_winner")} variant="default" />
                                </div>
                              ) : (
                                allow_write && playSet?.name && (
                                  <button onClick={() => applyConflictOverride(ac.modA._originalSetName || ac.modA.name, ac.pairId, playSet.name)} className="w-7 h-7 rounded border border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] transition-all flex items-center justify-center group relative">
                                    <span className="material-symbols-outlined !text-[14px]">{t("icon_check_circle")}</span>
                                    <HoverTooltip title={t("bp_select_winning_artifact")} variant="default" />
                                  </button>
                                )
                              )
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-28">{getPriorityDrop(ac.modA)}</div>
                                {allow_write && (
                                  <button onClick={() => toggleInActiveSet(ac.modA._originalSetName || ac.modA.name, true, true)} className="w-7 h-7 rounded border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-500 transition-all flex items-center justify-center group relative">
                                    <span className="material-symbols-outlined !text-[14px]">{t("icon_delete")}</span>
                                    <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Mod B */}
                        <div className={`flex items-center gap-3 p-3 rounded-xl border ${isWinnerB && !isTier4 ? "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]" : "bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border-[color-mix(in_srgb,var(--text)_5%,transparent)]"}`}>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className={`text-[10px] font-black truncate capitalize ${isWinnerB && !isTier4 ? "text-[var(--success)]" : "text-[var(--text)]"}`}>{formatDisplayName(ac.modB.name)}</span>
                            <span className="text-[8px] font-mono text-cyan-400 tracking-widest opacity-80 mt-0.5">{ac.modB.version || "v.Local"}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {ac.conflict.severity_rank == 4 ? (
                              allow_write && (
                                <button onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)} className="w-7 h-7 rounded border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-500 transition-all flex items-center justify-center group relative">
                                  <span className="material-symbols-outlined !text-[14px]">{t("icon_delete")}</span>
                                  <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" />
                                </button>
                              )
                            ) : ac.conflict.severity_rank == 3 ? (
                              isWinnerB ? (
                                <div className="w-7 h-7 rounded bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] flex items-center justify-center shadow-[0_0_10px_rgba(var(--success-rgb),0.3)] group relative">
                                  <span className="material-symbols-outlined !text-[14px]">{t("icon_star")}</span>
                                  <HoverTooltip title={t("bp_winning_artifact")} variant="default" />
                                </div>
                              ) : isWinnerA ? (
                                <div className="w-7 h-7 rounded bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--subtext)] opacity-60 flex items-center justify-center group relative">
                                  <span className="material-symbols-outlined !text-[14px]">{t("icon_block")}</span>
                                  <HoverTooltip title={t("bp_overridden_by_winner")} variant="default" />
                                </div>
                              ) : (
                                allow_write && playSet?.name && (
                                  <button onClick={() => applyConflictOverride(ac.modB._originalSetName || ac.modB.name, ac.pairId, playSet.name)} className="w-7 h-7 rounded border border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] transition-all flex items-center justify-center group relative">
                                    <span className="material-symbols-outlined !text-[14px]">{t("icon_check_circle")}</span>
                                    <HoverTooltip title={t("bp_select_winning_artifact")} variant="default" />
                                  </button>
                                )
                              )
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-28">{getPriorityDrop(ac.modB)}</div>
                                {allow_write && (
                                  <button onClick={() => toggleInActiveSet(ac.modB._originalSetName || ac.modB.name, true, true)} className="w-7 h-7 rounded border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-red-500 transition-all flex items-center justify-center group relative">
                                    <span className="material-symbols-outlined !text-[14px]">{t("icon_delete")}</span>
                                    <HoverTooltip title={t("bp_yeet_artifact")} variant="danger" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </UniversalCard>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex-[5] flex flex-col min-h-0 min-w-0">
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-4">
            <div className="px-1 py-2 shrink-0 flex flex-col gap-4 relative mb-4">
              <div className="flex items-center justify-start w-full relative z-10">
                <h3 className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-[0.2em] opacity-80">{t("bp_compatibility_scanner")}</h3>
                <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--subtext)] opacity-60 capitalize tracking-widest">
                  <span>{brokenMods.length} {t("items")}</span>
                  {(redMods.length > 0 || amberMods.length > 0) && <span className="opacity-50">•</span>}
                  {redMods.length > 0 && <span className="text-red-400">{redMods.length} {t("bp_pill_corrupted")}</span>}
                  {amberMods.length > 0 && <span className="text-amber-400">{amberMods.length} {t("bp_pill_unstable")}</span>}
                  {brokenMods.length === 0 && <span className="text-[var(--success)]">• {t("auto_0")} {t("items")}</span>}
                </div>
              </div>
            </div>

            {allow_write && brokenMods.length > 0 && (
              <div className="flex gap-2 w-full pb-4">
                {redMods.length > 0 && (
                  <button onClick={() => {
                    redMods.forEach((m: any) => toggleInActiveSet(m._originalSetName || m.name, true, true));
                  }} className={`flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[10px] font-black capitalize tracking-widest relative z-10 flex items-center justify-center gap-2 transition-all active:scale-95`}>
                    <span className="material-symbols-outlined !text-[16px]">{t("icon_delete_sweep")}</span>
                    {(t("bp_purge_corrupted")).replace("{0}", String(redMods.length))}
                  </button>
                )}
                {amberMods.length > 0 && (
                  <button onClick={() => {
                    amberMods.forEach((m: any) => toggleInActiveSet(m._originalSetName || m.name, true, true));
                  }} className={`flex-1 py-3 rounded-xl bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-amber-500 hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[10px] font-black capitalize tracking-widest relative z-10 flex items-center justify-center gap-2 transition-all active:scale-95`}>
                    <span className="material-symbols-outlined !text-[16px]">{t("icon_delete_sweep")}</span>
                    {(t("bp_purge_unstable")).replace("{0}", String(amberMods.length))}
                  </button>
                )}
              </div>
            )}
            <div className={brokenMods.length === 0 ? "flex flex-col flex-1" : "grid grid-cols-2 gap-4 pb-24"}>
              {brokenMods.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-12 relative group">
                  <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--success)_5%,transparent)] to-transparent rounded-[var(--radius)] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  <div className="relative w-24 h-24 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)] shadow-[0_0_30px_rgba(var(--success-rgb),0.2)] group-hover:shadow-[0_0_50px_rgba(var(--success-rgb),0.3)] transition-all duration-700">
                    <div className="absolute inset-0 rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] animate-[ping_3s_ease-in-out_infinite] opacity-20" />
                    <span className="material-symbols-outlined text-[var(--success)] drop-shadow-[0_0_10px_rgba(var(--success-rgb),0.5)] group-hover:scale-110 transition-transform duration-500">{t("icon_check_circle")}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[14px] font-black tracking-[0.2em] capitalize text-[var(--text)] text-center group-hover:text-[var(--success)] transition-colors">{t("bp_no_broken_mods_detected")}</p>
                  </div>
                </div>
              ) : (
                brokenMods.map((mod: any) => (
                  <IncompatibleModCard
                    key={mod.name}
                    mod={mod}
                    isIgnored={ignoredBroken.has(mod.name)}
                    isAmber={mod._alert_type === 'amber'}
                    setIgnoredBroken={setIgnoredBroken}
                    ignoredBroken={ignoredBroken}
                    toggleInActiveSet={toggleInActiveSet}
                    allow_write={allow_write}
                    t={t}
                    activeGameSchema={activeGameSchema}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

