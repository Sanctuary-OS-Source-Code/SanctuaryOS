import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "./LexiconContext";
import { DashboardStatTile, ViewHeader, isVersionMatch, SidePanel, getHighestVersion, handleOpenUrl, getExtensionRegex, HoverTooltip } from "./shared";
import { useStore } from "./store";
import MasonFeed from "./MasonFeed";

import BlueprintSwapSidePanel from "./side-panels/BlueprintSwapSidePanel";
import CommandIncompatiblePanel from "./side-panels/CommandIncompatiblePanel";
import CommandConflictsPanel from "./side-panels/CommandConflictsPanel";
import CommandRadarSweepPanel from "./side-panels/CommandRadarSweepPanel";
import { AuditLogViewer } from "./side-panels/SAAuditLogViewer";
import { SanctuaryAlertsSidePanel } from './side-panels/SanctuaryAlertsSidePanel';
import { UpdatesSidePanel } from './side-panels/CommandCenterSidePanels';
import MasonPostViewer from "./side-panels/MasonPostViewer";



export default function CommandCenter({
  status, isScanning, scanProgress, modsPath, isConfigured, toggleInActiveSet,
  modList, quarantineList, shelterContents, shelterActive, runRadarSweep, runSanitization, massIngestToCloud, triggerShelter, setView, setFilterStatus, setShowBrokenModal, setShowQuarantineModal, handleOpenMasonProfile, networkUpdates, setIsSupportDeskOpen, setIsConflictRadarOpen, setIsCitizenTicketsOpen
}: any) {
  const { t } = useLexicon();
  const { ownedDLC, maskedDLC, selectedVersion, playSets, activePlaySetIndex, session, userRole, setPlaySets, activeGameSchema } = useStore();
  const activePlaySet = playSets ? playSets[activePlaySetIndex] : null;
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [hasSymlinkPerms, setHasSymlinkPerms] = useState<boolean | null>(null);

  const [showIncompatiblePanel, setShowIncompatiblePanel] = useState(false);
  const [showConflictsPanel, setShowConflictsPanel] = useState(false);
  const [showRadarSweepPanel, setShowRadarSweepPanel] = useState(false);
  const [isAuditLogsOpen, setIsAuditLogsOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [urgentBroadcast, setUrgentBroadcast] = useState<any>(null);

  const [isBlueprintSwapOpen, setIsBlueprintSwapOpen] = useState(false);
  const [nexusCount, setNexusCount] = useState<number | "-">("-");
  const [ticketCount, setTicketCount] = useState<number | "-">("-");

  const checkPerms = () => {
    invoke<boolean>("check_symlink_permissions")
      .then(res => setHasSymlinkPerms(res))
      .catch(() => setHasSymlinkPerms(false));
  };

  useEffect(() => {
    checkPerms();
    import('./supabase').then(async ({ supabase }) => {
      if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

      const fetchUrgent = async () => {
        const { data } = await supabase.from('system_broadcasts').select('*').eq('is_active', true).eq('is_pinned', true).or('target_audience.ilike.%All%,target_audience.eq.Citizens,target_audience.ilike."Citizens,%",target_audience.ilike."%,Citizens,%",target_audience.ilike."%,Citizens"').order('created_at', { ascending: false }).limit(1);
        if (data && data.length > 0) {
          const dismissedId = sessionStorage.getItem('dismissedAlertId');
          if (dismissedId !== data[0].id) {
            setUrgentBroadcast(data[0]);
          }
        }
      };

      try {
        const [assetsRes, modsRes, bpRes] = await Promise.all([
          supabase.from('nexus_assets').select('id', { count: 'exact', head: true }),
          supabase.from('mods').select('id', { count: 'exact', head: true }),
          supabase.from('blueprints').select('id', { count: 'exact', head: true })
        ]);

        let total = 0;
        if (assetsRes.count !== null) total += assetsRes.count;
        if (modsRes.count !== null) total += modsRes.count;
        if (bpRes.count !== null) total += bpRes.count;

        setNexusCount(total);
        fetchUrgent();
      } catch (err) {
        console.error("Failed to fetch total nexus count", err);
      }

      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user?.id) {
          supabase.from('sanctuary_tickets').select('id', { count: 'exact', head: true }).eq('author_id', data.session.user.id).then(({ count }) => {
            if (count !== null) setTicketCount(count);
          });
        }
      });
    });
  }, []);

  useEffect(() => {
    if (hasSymlinkPerms === true || hasSymlinkPerms === null) return;
    const interval = setInterval(checkPerms, 3000);
    return () => clearInterval(interval);
  }, [hasSymlinkPerms]);

  const activeBlueprintMods = React.useMemo(() => {
    if (!activePlaySet) return [];
    const safeMods = Array.isArray(activePlaySet.mods) ? activePlaySet.mods : [];
    const safeList = Array.isArray(modList) ? modList : [];

    return safeMods.map((modName: string) => {
      const modNameLow = modName.toLowerCase().replace(/\\/g, '/');
      const exactMatch = safeList.find((m: any) => m.name && m.name.toLowerCase().replace(/\\/g, '/') === modNameLow);
      if (exactMatch) return { ...exactMatch, _originalSetName: modName };

      const mBase = modName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
      const baseMatch = safeList.find((m: any) => {
        const tb = m.name?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').toLowerCase();
        return mBase && tb && mBase === tb;
      });
      if (baseMatch) return { ...baseMatch, _originalSetName: modName };

      return { id: `missing-${modName}`, name: modName, isFallback: true, color: 'theme-border-danger', physical_path: null, hash: 'vlocal' };
    });
  }, [activePlaySet, modList]);

  const activeUpdates = React.useMemo(() => {
    if (!networkUpdates?.updated) return [];
    return networkUpdates.updated.filter((u: any) =>
      activeBlueprintMods.some((m: any) => {
        if (m.dbId && u.dbId && String(m.dbId) === String(u.dbId)) return true;
        if (m.hash && u.hash && m.hash !== 'vlocal' && m.hash === u.hash) return true;

        const mName = String(m.name || "").toLowerCase().replace(/\\/g, '/');
        const uName = String(u.name || "").toLowerCase().replace(/\\/g, '/');
        const oName = String(m._originalSetName || "").toLowerCase().replace(/\\/g, '/');

        if (mName && uName && (mName === uName || mName.includes(uName) || uName.includes(mName))) return true;
        if (oName && uName && (oName === uName || oName.includes(uName) || uName.includes(oName))) return true;

        return false;
      })
    ).filter((u: any, index: number, self: any[]) =>
      index === self.findIndex((t) => (
        (t.dbId && u.dbId && t.dbId === u.dbId) ||
        (t.hash && u.hash && t.hash === u.hash) ||
        (t.name === u.name)
      ))
    );
  }, [networkUpdates, activeBlueprintMods]);

  const setBlueprintLoadOrder = (updates: string | { name: string, prefix: string }[], prefix?: string) => {
    try {
      setPlaySets((prevSets: any) => {
        if (!prevSets) return prevSets;
        const currentSet = prevSets[activePlaySetIndex];
        if (!currentSet) return prevSets;
        const newMods = [...currentSet.mods];

        const updateList = Array.isArray(updates) ? updates : [{ name: updates, prefix: prefix || "" }];

        updateList.forEach(update => {
          if (!update || !update.name) return;
          const nameStr = String(update.name);
          const baseName = nameStr.split(/[/\\]/).pop() || nameStr;

          let found = false;
          for (let i = 0; i < newMods.length; i++) {
            const mLow = String(newMods[i]).toLowerCase();
            const bLow = baseName.toLowerCase();
            const tLow = nameStr.toLowerCase();
            if (mLow === bLow || mLow === tLow || mLow.endsWith(`/${bLow}`) || mLow.endsWith(`\\${bLow}`)) {
              newMods[i] = update.prefix ? `${update.prefix}/${baseName}` : baseName;
              found = true;
            }
          }
          if (!found) {
            newMods.push(update.prefix ? `${update.prefix}/${baseName}` : baseName);
          }
        });

        const newSets = [...prevSets];
        newSets[activePlaySetIndex] = { ...currentSet, mods: newMods };
        localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_playsets`, JSON.stringify(newSets));
        window.dispatchEvent(new Event("storage"));
        return newSets;
      });
    } catch (e) {
      console.error("setBlueprintLoadOrder error:", e);
    }
  };

  const activeBrokenCounts = activeBlueprintMods.reduce((acc: { broken: number, unstable: number }, m: any) => {
    if (!m || m.isFallback) return acc;
    let isBroken = typeof m.status === 'string' && m.status.toLowerCase() === 'broken';
    if (isBroken && m.compatible_versions && m.compatible_versions.length > 0 && selectedVersion) {
      if (selectedVersion !== getHighestVersion(m.compatible_versions)) {
        isBroken = false;
      }
    }
    const isUnstable = typeof m.status === 'string' && m.status.toLowerCase() === 'unstable';
    const isMismatch = m.isGhosted === true && m.ghostReason === "VERSION_MISMATCH" || (m.compatible_versions && m.compatible_versions.length > 0 && selectedVersion && !isVersionMatch(m.compatible_versions, selectedVersion));

    let hasMissingDLC = false;
    if (m.requiredDLC) {
      let rawDLC: string[] = [];
      if (typeof m.requiredDLC === 'string') {
        rawDLC = m.requiredDLC.split(',').map((s: string) => s.trim());
      } else if (Array.isArray(m.requiredDLC)) {
        rawDLC = [...m.requiredDLC];
      }
      const activeDLC = ownedDLC.filter((d: string) => !maskedDLC.includes(d));
      hasMissingDLC = rawDLC.some((req: string) => {
        const cleanReq = req.toUpperCase().trim();
        if (cleanReq === 'BASE') return false;
        return !activeDLC.some((owned: string) => owned.toUpperCase() === cleanReq);
      });
    }

    let hasMissingDeps = false;
    if (m.dependencies) {
      let rawDeps: string[] = [];
      if (typeof m.dependencies === 'string') {
        rawDeps = m.dependencies.split(',').map((s: string) => s.trim());
      } else if (Array.isArray(m.dependencies)) {
        rawDeps = [...m.dependencies];
      }
      if (rawDeps.length > 0) {
        const activeModNames = activeBlueprintMods.map((am: any) => (am._originalSetName || am.name)?.toLowerCase());
        hasMissingDeps = rawDeps.some((req: string) => !activeModNames.includes(req.toLowerCase()));
      }
    }

    if (isBroken || isMismatch || hasMissingDLC || hasMissingDeps) {
      acc.broken += 1;
    } else if (isUnstable) {
      acc.unstable += 1;
    }
    return acc;
  }, { broken: 0, unstable: 0 }) || { broken: 0, unstable: 0 };

  const activeConflictCount = React.useMemo(() => {
    const conflicts: any[] = [];
    activeBlueprintMods.forEach((mod: any) => {
      if (mod.conflicts && Array.isArray(mod.conflicts)) {
        mod.conflicts.forEach((c: any) => {
          const enemyActive = activeBlueprintMods.find((em: any) => {
            if (em.isFallback) return false;
            if (c.enemy_id && String(em.dbId) === String(c.enemy_id)) return true;
            if (c.enemy_name) {
              const targetClean = String(c.enemy_name).toUpperCase();
              const cleanN = String(em.name || '').toUpperCase();
              const cleanDisp = String(em.displayName || '').toUpperCase();
              if (cleanN.includes(targetClean) || cleanDisp.includes(targetClean)) return true;
            }
            return false;
          });

          if (enemyActive && mod.name && enemyActive.name && mod.name !== enemyActive.name) {
            const pairId = [mod.name, enemyActive.name].sort().join("::");
            if (!conflicts.find((ac: any) => ac.pairId === pairId)) {
              conflicts.push({ pairId, modA: mod, modB: enemyActive, conflict: c });
            }
          }
        });
      }
    });

    try {
      const stored = localStorage.getItem("sanctuary_local_conflicts");
      if (stored) {
        const localConflicts = JSON.parse(stored);
        localConflicts.forEach((lc: any) => {
          const modAMatch = activeBlueprintMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || '').toUpperCase();
            const cleanDisp = String(em.displayName || '').toUpperCase();
            const targetClean = String(lc.modA || lc.mod_a).toUpperCase();
            return cleanN.includes(targetClean) || cleanDisp.includes(targetClean) || targetClean.includes(cleanN);
          });
          const modBMatch = activeBlueprintMods.find((em: any) => {
            if (em.isFallback) return false;
            const cleanN = String(em.name || '').toUpperCase();
            const cleanDisp = String(em.displayName || '').toUpperCase();
            const targetClean = String(lc.modB || lc.mod_b).toUpperCase();
            return cleanN.includes(targetClean) || cleanDisp.includes(targetClean) || targetClean.includes(cleanN);
          });

          if (modAMatch && modBMatch && modAMatch.name !== modBMatch.name) {
            const pairId = [modAMatch.name, modBMatch.name].sort().join("::");
            if (!conflicts.find((ac: any) => ac.pairId === pairId)) {
              conflicts.push({ pairId, modA: modAMatch, modB: modBMatch, conflict: { severity_rank: lc.severity_rank, resolution_note: lc.resolution_note || "Local Scan Detects Tuning Overlap" } });
            }
          }
        });
      }
    } catch (e) { }

    const unresolvedConflicts = conflicts.filter((ac: any) => {
      if (ac.conflict.severity_rank !== 3) return true;
      const prefixA = (ac.modA._originalSetName || ac.modA.name)?.split(/[/\\]/).slice(0, -1).join('/') || "";
      const prefixB = (ac.modB._originalSetName || ac.modB.name)?.split(/[/\\]/).slice(0, -1).join('/') || "";
      const isWinnerA = prefixA.toLowerCase() === "sanctuary";
      const isWinnerB = prefixB.toLowerCase() === "sanctuary";
      return !isWinnerA && !isWinnerB;
    });

    const tier4Count = unresolvedConflicts.filter((c: any) => c.conflict.severity_rank === 4).length;
    const tier3Count = unresolvedConflicts.filter((c: any) => c.conflict.severity_rank !== 4).length;

    return { total: unresolvedConflicts.length, tier3: tier3Count, tier4: tier4Count };
  }, [activeBlueprintMods]);

  const radarUpdatesCount = activeUpdates.length || 0;
  const radarTier4Count = activeConflictCount.tier4 || 0;
  const radarTier3Count = activeConflictCount.tier3 || 0;
  const radarBrokenCount = activeBrokenCounts.broken || 0;
  const radarUnstableCount = activeBrokenCounts.unstable || 0;

  let radarState = "optimal";
  if (radarTier4Count > 0 || radarBrokenCount > 0) {
    radarState = "critical";
  } else if (radarTier3Count > 0 || radarUnstableCount > 0) {
    radarState = "warning";
  } else if (radarUpdatesCount > 0) {
    radarState = "update";
  }

  return (
    <div className="flex flex-col gap-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ViewHeader title={t("center_title")} subtitle={t("center_subtitle")} icon={t("icon_desktop_windows")} iconColorClass="text-[var(--accent)] border-[var(--accent)]/30" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
        <DashboardStatTile
          icon={<span className="material-symbols-outlined !text-4xl">{t("icon_radar")}</span>}
          number={
            (radarTier4Count + radarTier3Count + radarBrokenCount + radarUnstableCount) > 0
              ? (radarTier4Count + radarTier3Count + radarBrokenCount + radarUnstableCount)
              : (radarUpdatesCount > 0 ? radarUpdatesCount : 0)
          }
          label={
            radarState === 'critical' ? (t("crit_fail")) :
              radarState === 'warning' ? (t("action_rec")) :
                radarState === 'update' ? (t("updates_avail")) :
                  (t("sys_stable"))
          }
          colorClass={
            radarState === 'critical' ? "border-red-500/30 text-red-500 hover:border-red-500 bg-red-500/10 hover:bg-red-500/20" :
              radarState === 'warning' ? "border-amber-500/30 text-amber-500 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20" :
                radarState === 'update' ? "border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]" :
                  "border-emerald-500/30 text-emerald-500 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20"
          }
          onClick={() => setShowRadarSweepPanel(true)}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined !text-4xl">{t("icon_account_balance")}</span>}
          number={activeGameSchema?.features?.has_cc === false ? "-" : (modList?.length || 0)}
          label={t("vault_title")}
          colorClass="border-teal-500/30 text-teal-500 hover:border-teal-500 bg-teal-500/10 hover:bg-teal-500/20"
          onClick={() => { if (activeGameSchema?.features?.has_cc !== false) { if (setView) setView("vault"); if (setFilterStatus) setFilterStatus("ALL"); } }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined !text-4xl">{t("icon_hub")}</span>}
          number={nexusCount}
          label={t("market_title")}
          colorClass="border-cyan-500/30 text-cyan-500 hover:border-cyan-500 bg-cyan-500/10 hover:bg-cyan-500/20"
          onClick={() => { if (setView) setView("nexus"); }}
        />
        <DashboardStatTile
          icon={<span className="material-symbols-outlined !text-4xl">{t("icon_map")}</span>}
          number={activeGameSchema?.features?.has_cc === false ? "-" : (playSets?.length || 0)}
          label={t("stat_blueprints")}
          colorClass="border-blue-500/30 text-blue-500 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20"
          onClick={() => { if (activeGameSchema?.features?.has_cc !== false) setIsBlueprintSwapOpen(true); }}
        />
        <div className="relative group/ticket flex-1 flex">
          {!session && (
            <HoverTooltip
              variant="danger"
              title={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned") : t("alert_guest_mode_uploads")}
              subtitle={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
              className="group-hover/ticket:flex z-[1000] w-full"
            />
          )}
          <DashboardStatTile
            icon={<span className="material-symbols-outlined !text-4xl">{t("icon_local_activity")}</span>}
            number={ticketCount}
            label={t("sidebar_support")}
            colorClass="border-purple-500/30 text-purple-500 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20"
            onClick={() => { if (setIsCitizenTicketsOpen) setIsCitizenTicketsOpen(true); }}
            disabled={!session}
          />
        </div>
      </div>

      {urgentBroadcast && localStorage.getItem("sanctuary_notify_alert_banner") !== "false" && (
        <div onClick={() => setViewingPost({ ...urgentBroadcast, content: urgentBroadcast.message || urgentBroadcast.content, mason_id: 'system', views: 0, likes: 0, replies: 0 })} className="w-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded-[var(--radius)] p-6 flex flex-col md:flex-row items-center gap-6 shadow-[0_0_40px_rgba(239,68,68,0.1)] cursor-pointer hover:bg-[var(--danger)]/20 transition-all group overflow-hidden relative backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--danger)]/5 to-transparent z-0 pointer-events-none" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--danger)]/10 blur-[50px] rounded-full pointer-events-none" />
          <div className="w-16 h-16 rounded-2xl bg-[var(--danger)]/10 border border-[var(--danger)]/30 flex items-center justify-center shrink-0 z-10 group-hover:scale-110 transition-transform shadow-inner">
            <span className="material-symbols-outlined !text-4xl text-[var(--danger)] animate-pulse">{t("icon_warning_amber")}</span>
          </div>
          <div className="flex flex-col gap-2 flex-1 z-10">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-[var(--danger)]/20 border border-[var(--danger)]/40 text-[var(--danger)] text-[10px] font-black uppercase tracking-widest rounded-lg shadow-inner animate-pulse flex items-center gap-1"><span className="material-symbols-outlined !text-[12px]"></span>{t("urgent_alert")}</span>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60 text-[var(--danger)]">{new Date(urgentBroadcast.created_at).toLocaleDateString()}</span>
            </div>
            <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest text-[var(--danger)] group-hover:text-red-400 transition-colors drop-shadow-md">{urgentBroadcast.title}</h3>
          </div>
          <div className="flex items-center gap-2 z-10 ml-auto">
            <button onClick={(e) => { e.stopPropagation(); sessionStorage.setItem('dismissedAlertId', urgentBroadcast.id); setUrgentBroadcast(null); }} className="w-10 h-10 rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] flex items-center justify-center transition-colors shadow-inner backdrop-blur-md hover:scale-110 active:scale-95 group/close" >
              <span className="material-symbols-outlined !text-[20px] group-hover/close:rotate-90 transition-transform duration-300">close</span>
            </button>
          </div>
        </div>
      )}

      {hasSymlinkPerms === false && (
        <div className="w-full theme-glass-panel rounded-[var(--radius)] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden transition-all duration-500 animate-in fade-in zoom-in-95 backdrop-blur-md group"
          style={{
            borderColor: `color-mix(in srgb, var(--danger) 30%, transparent)`,
            borderWidth: '1px',
            backgroundColor: `color-mix(in srgb, var(--danger) 10%, transparent)`,
            boxShadow: `0 0 40px rgba(239, 68, 68, 0.1)`
          }}>
          <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: `linear-gradient(90deg, color-mix(in srgb, var(--danger) 5%, transparent), transparent)` }} />
          <div className="absolute top-0 right-0 w-32 h-32 blur-[50px] rounded-full pointer-events-none" style={{ backgroundColor: `color-mix(in srgb, var(--danger) 10%, transparent)` }} />
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 w-full z-10 pl-2">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform" style={{ backgroundColor: `color-mix(in srgb, var(--danger) 10%, transparent)`, borderColor: `color-mix(in srgb, var(--danger) 30%, transparent)`, color: 'var(--danger)', borderWidth: '1px' }}>
                <span className="material-symbols-outlined !text-[32px] animate-pulse">{t("icon_warning_amber")}</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-xl font-black uppercase text-[var(--danger)] tracking-widest leading-none drop-shadow-md">{t("perm_restricted")}</h3>
                <p className="text-xs font-bold text-[var(--subtext)] tracking-wide">{t("perm_desc")}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] mt-1">{t("perm_dev_mode_rec")} - {t("perm_dev_mode_nav")}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto items-end mt-4 md:mt-0">
              <div className="flex items-stretch gap-3 w-full h-[56px]">
                <button onClick={() => invoke("open_developer_settings")} className="flex-1 md:flex-none px-8 flex items-center justify-center bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-center backdrop-blur-[3px]">
                  {t("perm_btn_dev")}
                </button>
                <button onClick={checkPerms} className="px-6 flex items-center justify-center bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-xl text-xl transition-all backdrop-blur-[3px]">
                  <span className="material-symbols-outlined">{t("icon_refresh")}</span>
                </button>
              </div>
              <p className="text-[9px] text-[var(--subtext)] font-bold tracking-widest text-right mt-1">{t("perm_admin_rec")} - {t("perm_admin")}</p>
            </div>
          </div>
        </div>
      )}

      {radarState !== 'optimal' && (() => {
        const alertVar = radarState === 'critical' ? 'var(--danger)' : radarState === 'warning' ? 'var(--warning)' : 'var(--accent)';
        const alertVarRgb = radarState === 'critical' ? '239, 68, 68' : radarState === 'warning' ? '234, 179, 8' : '59, 130, 246';
        const alertIcon = radarState === 'critical' ? 'gpp_bad' : radarState === 'warning' ? 'gpp_maybe' : 'update';

        return (
          <div className="w-full theme-glass-panel rounded-[var(--radius)] p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden transition-all duration-500 animate-in fade-in zoom-in-95 backdrop-blur-md group"
            style={{
              borderColor: `color-mix(in srgb, ${alertVar} 30%, transparent)`,
              borderWidth: '1px',
              backgroundColor: `color-mix(in srgb, ${alertVar} 10%, transparent)`,
              boxShadow: `0 0 40px rgba(${alertVarRgb}, 0.1)`
            }}>
            <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${alertVar} 5%, transparent), transparent)` }} />
            <div className="absolute top-0 right-0 w-32 h-32 blur-[50px] rounded-full pointer-events-none" style={{ backgroundColor: `color-mix(in srgb, ${alertVar} 10%, transparent)` }} />

            <div className="flex items-center gap-6 z-10 pl-2">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform" style={{ backgroundColor: `color-mix(in srgb, ${alertVar} 10%, transparent)`, borderColor: `color-mix(in srgb, ${alertVar} 30%, transparent)`, color: alertVar, borderWidth: '1px' }}>
                <span className="material-symbols-outlined !text-[32px] animate-pulse">{t(`ui_icon_${alertIcon}`) || alertIcon}</span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-xl font-black uppercase tracking-widest drop-shadow-md" style={{ color: alertVar }}>
                  {radarState === 'critical' ? (t("critical_action_short")) :
                    radarState === 'warning' ? (t("action_rec")) :
                      (t("update_suggested"))}
                </h3>
                <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-[0.2em] opacity-80">
                  {radarState === 'critical' ? (t("action_fatal")) :
                    radarState === 'warning' ? (t("action_incompatibilities")) :
                      (t("attention_required"))}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 z-10 flex-wrap">
              <button onClick={() => { if (activeUpdates.length > 0) setShowUpdatesModal(true); }} disabled={!(activeUpdates.length > 0)} className={`px-6 py-3 rounded-xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all border whitespace-nowrap ${activeUpdates.length > 0 ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)]' : 'bg-white/5 border-white/10 text-[var(--subtext)] opacity-50 cursor-not-allowed'}`}>
                <span className="material-symbols-outlined !text-sm">{t("icon_update")}</span> {activeUpdates.length} {t("updates_modal_title")}
              </button>
              <button onClick={() => { if ((radarBrokenCount + radarUnstableCount) > 0) setShowIncompatiblePanel(true); }} disabled={(radarBrokenCount + radarUnstableCount) === 0} className={`px-6 py-3 rounded-xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all border whitespace-nowrap ${(radarBrokenCount + radarUnstableCount) > 0 ? (radarBrokenCount > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_30%,transparent)]') : 'bg-white/5 border-white/10 text-[var(--subtext)] opacity-50 cursor-not-allowed'}`}>
                <span className="material-symbols-outlined !text-sm">{radarBrokenCount > 0 ? "gpp_bad" : (radarUnstableCount > 0 ? "gpp_maybe" : "warning_amber")}</span> {radarBrokenCount > 0 && radarUnstableCount > 0 ? `${radarBrokenCount} ${t("status_broken")} / ${radarUnstableCount} ${t("label_unstable")}` : radarBrokenCount > 0 ? `${radarBrokenCount} ${t("status_broken")}` : radarUnstableCount > 0 ? `${radarUnstableCount} ${t("label_unstable")}` : `0 ${t("citizen_action_incompatible")}`}
              </button>
              <button onClick={() => { if (activeConflictCount.total > 0) setShowConflictsPanel(true); }} disabled={activeConflictCount.total === 0} className={`px-6 py-3 rounded-xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all border whitespace-nowrap ${activeConflictCount.total > 0 ? (activeConflictCount.tier4 > 0 ? 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_50%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_50%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--warning)_30%,transparent)]') : 'bg-white/5 border-white/10 text-[var(--subtext)] opacity-50 cursor-not-allowed'}`}>
                <span className="material-symbols-outlined !text-sm">{activeConflictCount.tier4 > 0 ? "crisis_alert" : (activeConflictCount.tier3 > 0 ? "tune" : "radar")}</span>
                {activeConflictCount.total > 0 ? (
                  activeConflictCount.tier4 > 0 && activeConflictCount.tier3 > 0 ?
                    `${activeConflictCount.tier4} ${t("stat_tier4")} / ${activeConflictCount.tier3} ${t("stat_tier3")}` :
                    activeConflictCount.tier4 > 0 ?
                      `${activeConflictCount.tier4} ${t("stat_tier4")}` :
                      `${activeConflictCount.tier3} ${t("stat_tier3")}`
                ) : (
                  `${activeConflictCount.total} ${t("tab_matrix")}`
                )}
              </button>
            </div>
          </div>
        );
      })()}

      <div className="flex flex-col lg:flex-row gap-8 w-full">
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <div className="flex items-center gap-3 mb-6 mt-2">
            <div className="w-12 h-12 rounded-xl theme-glass-inner flex items-center justify-center border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] shrink-0">
              <span className="material-symbols-outlined !text-2xl text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]">{t("icon_satellite_alt")}</span>
            </div>
            <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] truncate">{t("feed_title")}</h2>
          </div>

          <div className="w-full">
            <MasonFeed onOpenMasonProfile={handleOpenMasonProfile} noCardWrapper={true} gridCols="grid-cols-1 lg:grid-cols-2" />
          </div>
        </div>
        <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-6">
          <div className="flex items-center gap-3 mb-6 mt-2">
            <div className="w-12 h-12 rounded-xl theme-glass-inner flex items-center justify-center border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)] shrink-0">
              <span className="material-symbols-outlined !text-2xl text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]">{t("icon_bolt")}</span>
            </div>
            <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] shrink-0">{t("quick_actions")}</h2>
          </div>

          <div className="flex flex-col gap-4">
            {urgentBroadcast && (
              <button onClick={() => setIsAlertsOpen(true)} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[var(--radius)] hover:bg-white/5 transition-all text-left group relative overflow-hidden h-24">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
                <div className="flex items-center gap-5 h-full">
                  <div className="w-12 h-12 rounded-xl theme-glass-inner border flex items-center justify-center shrink-0 transition-colors border-[var(--danger)]/30 group-hover:bg-[var(--danger)]/10 text-[var(--danger)] shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                      priority_high
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <h3 className="text-[11px] font-black uppercase tracking-widest transition-colors truncate text-[var(--danger)] group-hover:text-red-400">{t("title_sanctuary_alerts") || "Sanctuary Alerts"}</h3>
                    <span className="text-[8px] uppercase font-bold tracking-widest transition-colors flex items-center gap-2 mt-1 text-[var(--danger)]/80 group-hover:text-red-300"> {t("urgent_alert_active") || "Urgent Alert Active"}
                    </span>
                  </div>
                </div>
              </button>
            )}

            {activeGameSchema?.features?.has_cc !== false && (
              <button onClick={() => runRadarSweep(false)} className="w-full p-6 theme-glass-panel border border-white/5 rounded-[var(--radius)] hover:bg-white/5 transition-all text-left group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-xl theme-glass-inner border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                      {t("icon_radar")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">{(t("btn_radar")).replace(/^[^\w]*/, '').trim()}</span>
                    <span className="text-[9px] uppercase font-bold text-emerald-500/80 tracking-widest group-hover:text-emerald-400 transition-colors flex items-center gap-2 mt-1">{t("btn_radar_desc")}
                    </span>
                  </div>
                </div>
              </button>
            )}

            {activeGameSchema?.features?.has_cc !== false && (
              <button onClick={() => triggerShelter(!shelterActive)} className="w-full p-6 theme-glass-panel border border-white/5 rounded-[var(--radius)] hover:bg-white/5 transition-all text-left group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-xl theme-glass-inner border border-cyan-500/20 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                      {shelterActive ? (t("icon_lock")) : (t("icon_lock_open"))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">{shelterActive ? ((t("btn_reclaim")).replace(/^[^\w]*/, '').trim()) : ((t("btn_lockdown")).replace(/^[^\w]*/, '').trim())}</span>
                    <span className="text-[9px] uppercase font-bold text-cyan-500/80 tracking-widest group-hover:text-cyan-400 transition-colors flex items-center gap-2 mt-1">{shelterActive ? (t("btn_bunker_unlock_desc")) : (t("btn_bunker_lock_desc"))}
                    </span>
                  </div>
                </div>
              </button>
            )}

            <div className="relative group/supportdesk w-full">
              {!session && (
                <HoverTooltip
                  variant="danger"
                  title={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned") : t("alert_guest_mode_uploads")}
                  subtitle={localStorage.getItem("sanctuary_blacklisted") === "true" ? t("alert_comm_banned_desc") : t("alert_guest_mode_desc")}
                  className="group-hover/supportdesk:flex z-[1000]"
                />
              )}
              <button onClick={() => { if (setIsSupportDeskOpen && session) setIsSupportDeskOpen(true); }} className={`w-full p-6 theme-glass-panel border border-white/5 rounded-[var(--radius)] transition-all text-left group relative overflow-hidden ${session ? 'hover:bg-white/5 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-xl theme-glass-inner border border-rose-500/20 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]">
                      {t("icon_local_activity")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">{t("support_title")}</span>
                    <span className="text-[9px] uppercase font-bold text-purple-500/80 tracking-widest group-hover:text-purple-400 transition-colors flex items-center gap-2 mt-1">{t("btn_submit_ticket_desc")}
                    </span>
                  </div>
                </div>
              </button>
            </div>

            <button onClick={() => setIsAuditLogsOpen(true)} className="w-full p-6 theme-glass-panel border border-white/5 rounded-[var(--radius)] hover:bg-white/5 transition-all text-left group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-xl theme-glass-inner border border-blue-500/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">
                    history
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-black uppercase tracking-widest text-[var(--text)]">{t("audit_title")}</span>
                  <span className="text-[9px] uppercase font-bold text-blue-500/80 tracking-widest group-hover:text-blue-400 transition-colors flex items-center gap-2 mt-1">{t("audit_logs_desc")}
                  </span>
                </div>
              </div>
            </button>

            {!urgentBroadcast && (
              <button onClick={() => setIsAlertsOpen(true)} className="w-full p-6 theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[var(--radius)] hover:bg-white/5 transition-all text-left group relative overflow-hidden h-24">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 group-hover:-translate-x-full duration-1000 transition-all ease-in-out" />
                <div className="flex items-center gap-5 h-full">
                  <div className="w-12 h-12 rounded-xl theme-glass-inner border flex items-center justify-center shrink-0 transition-colors border-white/10 group-hover:border-amber-500/30">
                    <span className="material-symbols-outlined !text-3xl opacity-70 group-hover:scale-110 group-hover:opacity-100 transition-all duration-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
                      warning_off
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <h3 className="text-[11px] font-black uppercase tracking-widest transition-colors truncate text-[var(--text)] group-hover:text-amber-500">{t("title_sanctuary_alerts") || "Sanctuary Alerts"}</h3>
                    <span className="text-[8px] uppercase font-bold tracking-widest transition-colors flex items-center gap-2 mt-1 text-amber-500/80 group-hover:text-amber-400">
                      {t("alert_empty") || "SYSTEM BROADCASTS"}
                    </span>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      <UpdatesSidePanel
        isOpen={showUpdatesModal}
        onClose={() => setShowUpdatesModal(false)}
        activeUpdates={activeUpdates}
        handleOpenUrl={handleOpenUrl}
      />

      {isBlueprintSwapOpen && (
        <BlueprintSwapSidePanel
          isOpen={isBlueprintSwapOpen}
          onClose={() => setIsBlueprintSwapOpen(false)}
        />
      )}

      {showIncompatiblePanel && (
        <CommandIncompatiblePanel
          isOpen={showIncompatiblePanel}
          onClose={() => setShowIncompatiblePanel(false)}
          activeMods={activeBlueprintMods}
          allow_write={!activePlaySet?.read_only}
          toggleInActiveSet={toggleInActiveSet}
        />
      )}

      {showConflictsPanel && (
        <CommandConflictsPanel
          isOpen={showConflictsPanel}
          onClose={() => setShowConflictsPanel(false)}
          activeMods={activeBlueprintMods}
          allow_write={!activePlaySet?.read_only}
          toggleInActiveSet={toggleInActiveSet}
          setBlueprintLoadOrder={setBlueprintLoadOrder}
          vaultPath={modsPath}
          onRefreshMods={runRadarSweep}
        />
      )}

      {showRadarSweepPanel && (
        <CommandRadarSweepPanel
          isOpen={showRadarSweepPanel}
          onClose={() => setShowRadarSweepPanel(false)}
          status={status}
          runRadarSweep={runRadarSweep}
          isScanning={isScanning}
          networkUpdates={{ updated: activeUpdates }}
          tier3Count={activeConflictCount.tier3}
          tier4Count={activeConflictCount.tier4}
          brokenCount={radarBrokenCount}
          unstableCount={radarUnstableCount}
          onOpenUpdates={() => setShowUpdatesModal(true)}
          onOpenConflicts={() => setShowConflictsPanel(true)}
          onOpenIncompatible={() => setShowIncompatiblePanel(true)}
          onOpenHotSwap={() => setIsBlueprintSwapOpen(true)}
        />
      )}

      <AuditLogViewer
        isSidePanel={true}
        isOpen={isAuditLogsOpen}
        onClose={() => setIsAuditLogsOpen(false)}
        hideEditIdentity={true}
      />

      <SanctuaryAlertsSidePanel
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        audience="Citizens"
      />

      {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId={session?.user?.id || null} />}
    </div>
  );
}
