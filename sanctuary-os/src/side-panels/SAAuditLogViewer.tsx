import { ElevatedHubLayout, SidePanelHeroCard, SidePanelTitleInput } from '../components/layouts/ElevatedHubLayout';
import React, { useState, useEffect } from "react";
import { supabase, getActiveGameClient, supabaseAuth } from "../supabase";
import { createClient } from "@supabase/supabase-js";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown, ActionPill, ActionButton, UniversalGroup, StatBox
} from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import MasonPostViewer from "./MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";

import { SharedIdentityEditor } from "../IdentityMatrix";


export function AuditLogViewer({
  isSidePanel = false,
  isOpen = false,
  onClose,
  hideEditIdentity = false,
  isKeepers = false
}: {
  isSidePanel?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  hideEditIdentity?: boolean;
  isKeepers?: boolean;
} = {}) {
  const { t } = useLexicon();
  const [logs, setLogs] = useState<any[]>([]);
  const [partnerGames, setPartnerGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");
  const [filterGame, setFilterGame] = useState("ALL");
  const [dateRange, setDateRange] = useState<{ start: string | null, end: string | null }>({ start: null, end: null });

  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const fetchLogs = async () => {
    if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") {
      setLoading(false);
      return;
    }
    setLoading(true);
    let allLogs: any[] = [];

    const buildQuery = (client: any) => {
      let q = client.from('audit_logs').select('*');
      if (isSidePanel) q = q.neq('target_table', 'profiles').neq('target_table', 'sanctuary_tickets');

      if (filterAction === "MALWARE") {
        q = q.eq('target_table', 'mods').ilike('action', '%malware%');
      } else if (filterAction !== "ALL") {
        q = q.eq('target_table', filterAction);
      }

      if (filterGame !== "ALL") {
        q = q.eq('game_name', filterGame);
      }

      if (dateRange.start) q = q.gte('created_at', new Date(dateRange.start).toISOString());
      if (dateRange.end) {
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999);
        q = q.lte('created_at', end.toISOString());
      }
      return q.order('created_at', { ascending: false }).limit(isKeepers ? 30 : 100);
    };

    if (isKeepers) {
      const enrichAndSet = async (newLogs: any[]) => {
        const actorIds = [...new Set(newLogs.map(log => log.actor_id).filter(id => id))];
        let profileMap: Record<string, any> = {};
        if (actorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, role, is_banned, blacklist_reason')
            .in('id', actorIds);
          if (profiles) {
            profileMap = profiles.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
          }
        }
        const enriched = newLogs.map(log => ({
          ...log,
          actor: profileMap[log.actor_id] || null
        }));

        setLogs(enriched);
      };

      const { data: coreLogs } = await buildQuery(supabaseAuth);
      if (coreLogs) {
        // game_name is already populated by double-write on partner dbs. 
        // For existing Core OS actions, game_name is null, so fallback to 'Core OS'
        await enrichAndSet(coreLogs.map((l: any) => ({ ...l, game_name: l.game_name || 'Core OS' })));
      }
      setLoading(false);

      const { data: games } = await supabaseAuth.from('sanctuary_games').select('name').eq('is_active', true);
      if (games) {
        setPartnerGames(games);
      }
    } else {
      const state = useStore.getState();
      const activeWsId = state.activeWorkspaceId;
      const workspaces = state.workspaces || [];
      const activeWs = workspaces.find((w: any) => w.id === activeWsId || w.schema_id === activeWsId || w.game_id === activeWsId);

      // If we are on a game workspace, require the workspace details
      if (activeWsId !== 'default_workspace' && (!activeWs || !activeWs.supabase_url || !activeWs.supabase_anon_key)) {
        setLogs([]);
        setLoading(false);
        return;
      }

      const targetClient = activeWsId === 'default_workspace' ? supabaseAuth : getActiveGameClient();
      if (!targetClient) {
        setLogs([]);
        setLoading(false);
        return;
      }
      const { data: rawLogs, error: logError } = await buildQuery(targetClient);
      if (logError || !rawLogs) {
        console.error("Audit Logs Error", logError);
        setLoading(false);
        return;
      }

      const actorIds = [...new Set(rawLogs.map((log: any) => log.actor_id).filter((id: any) => id))];
      let profileMap: Record<string, any> = {};
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, role, is_banned, blacklist_reason')
          .in('id', actorIds);
        if (profiles) profileMap = profiles.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
      }
      const enriched = rawLogs.map((log: any) => ({ ...log, actor: profileMap[log.actor_id] || null }));
      setLogs(enriched);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [dateRange.start, dateRange.end, filterAction, filterGame]);

  const ALL_KNOWN_TABLES = isSidePanel
    ? ["mods", "blueprints", "logical_conflicts", "mod_rules", "play_sets", "nexus_assets"]
    : ["audit_logs", "keeper_system_broadcasts", "keeper_tickets", "logical_conflicts", "mod_rules", "mod_vault", "play_sets", "profiles", "sanctuary_games", "sanctuary_support_categories", "sanctuary_tickets", "dlc_registry", "mod_rules_history", "logical_conflicts_history", "mods", "blueprints", "nexus_assets"];

  const uniqueTargets = ["ALL", "MALWARE", ...Array.from(new Set([...ALL_KNOWN_TABLES, ...logs.map(log => log.target_table).filter(Boolean)]))];
  const filterOptions = uniqueTargets.map(target => ({
    id: target,
    label: target === "ALL" ? (t("all_logs", "All Logs")?.toUpperCase() || "ALL LOGS") : (target === "MALWARE" ? (t("filter_malware_edits", "Malware Edits")?.toUpperCase() || "MALWARE EDITS") : target.replace(/_/g, ' ').toUpperCase())
  }));

  const ALL_KNOWN_GAMES = ["Core OS", ...partnerGames.map(db => db.name)];
  const uniqueGames = ["ALL", ...Array.from(new Set([...ALL_KNOWN_GAMES, ...logs.map(log => log.game_name).filter(Boolean)]))];
  const filterGameOptions = uniqueGames.map(game => ({
    id: game,
    label: game === "ALL" ? "ALL WORKSPACES" : game.toUpperCase()
  }));

  const filteredLogs = logs.filter(log => {
    const term = search.toLowerCase();
    const matchesSearch = !search ||
      log.action?.toLowerCase().includes(term) ||
      log.target_name?.toLowerCase().includes(term) ||
      log.actor?.username?.toLowerCase().includes(term) ||
      log.reason?.toLowerCase().includes(term);

    return matchesSearch;
  });

  const content = (
    <ElevatedHubLayout
      hideHeader={isSidePanel}
      headerTitle={t("audit_logs", "Audit Logs")}
      headerSubtitle={t("audit_logs_desc", "System and user activity logs")}
      headerIcon="history"
      headerIconColorClass="theme-text-accent"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t("audit_search", "Search logs...") as string}
      hideSearch={filterAction === 'overview'}
      activeTab={filterAction === 'overview' ? 'overview' : 'all'}
      onTabChange={(tabId: string) => setFilterAction(tabId === 'overview' ? 'overview' : 'ALL')}
      tabs={isSidePanel ? [] : [
        { id: "overview", label: t("landing_overview", "Overview"), icon: "dashboard" },
        { id: "all", label: t("all_logs", "All Logs"), icon: "list", number: logs.length.toString() }
      ]}
      primaryPopover={
        filterAction !== 'overview' ? {
          icon: "tune",
          label: t("filters", "Filters"),
          content: (
            <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("auto_filter_logs", "Action Type")}</span>
                <CustomDropdown
                  flat={true}
                  disableTint={true}
                  variant="pill"
                  value={filterAction === 'overview' ? 'ALL' : filterAction}
                  onChange={(v: string[]) => setFilterAction(v[0])}
                  options={filterOptions}
                  placeholder={t("auto_filter_logs", "Action Type") as string}
                  searchable={true}
                />
              </div>
            </div>
          )
        } : undefined
      }
    >
      {filterAction === 'overview' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
              <span className="material-symbols-outlined text-[var(--accent)]">schedule</span>
              <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase">{t("recent_activity", "Recent Activity")}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
              {logs.slice(0, 10).map(log => (
                <div key={"oa_" + log.id} onClick={() => setSelectedLog(log)} className="glass-panel rounded-2xl flex flex-col group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] min-h-[160px] p-5 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-2 w-full">
                    <span className="text-[9px] font-bold capitalize tracking-[0.2em] text-[var(--subtext)] opacity-60 truncate">{log.target_table?.replace(/_/g, ' ') || 'Unknown'}</span>
                    {log.game_name && <span className="px-1.5 py-0.5 rounded bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[8px] font-black capitalize tracking-widest shrink-0 ml-auto">{log.game_name}</span>}
                  </div>
                  <span className="text-xs font-black capitalize tracking-widest text-[var(--text)] mb-2 truncate">{log.action}</span>
                  <span className="text-[10px] font-bold text-[var(--subtext)] line-clamp-2">{log.reason || log.actor?.username || ''}</span>
                </div>
              ))}
              {logs.length === 0 && !loading && (
                <EmptyState icon="history" title={t("no_logs", "No Activity Logs")} className="col-span-full py-8" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
              <span className="material-symbols-outlined text-purple-400">monitoring</span>
              <h3 className="text-sm font-black text-[var(--text)] tracking-widest uppercase">{t("system_stats", "System Stats")}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
              <div className="glass-panel rounded-2xl flex flex-col items-center justify-center p-6 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] min-h-[160px]">
                <span className="material-symbols-outlined !text-[32px] theme-text-accent mb-2">list_alt</span>
                <span className="text-3xl font-black text-[var(--text)] tracking-widest">{logs.length}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60 mt-2">{t("total_records", "Total Records")}</span>
              </div>
              <div className="glass-panel rounded-2xl flex flex-col items-center justify-center p-6 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] min-h-[160px]">
                <span className="material-symbols-outlined !text-[32px] text-purple-400 mb-2">shield</span>
                <span className="text-3xl font-black text-[var(--text)] tracking-widest">{filterOptions.length - 2}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtext)] opacity-60 mt-2">{t("monitored_systems", "Monitored Systems")}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 w-full animate-in fade-in pb-16">
          {loading ? (
            <div className={`grid grid-cols-1 ${isSidePanel ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'} gap-6 w-full`}>
              {[...Array(isSidePanel ? 6 : 12)].map((_, i) => (
                <div key={i} className="flex flex-col justify-start p-6 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative min-h-[160px]">
                  <div className="flex justify-start items-start w-full relative z-10 mb-4">
                    <div className="flex items-start gap-4 w-full">
                      <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] animate-pulse shrink-0" />
                      <div className="flex flex-col pt-1 min-w-0 flex-1 gap-2">
                        <div className="h-2 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded animate-pulse w-24" />
                        <div className="h-3 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded animate-pulse w-full mt-1" />
                        <div className="h-2 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded animate-pulse w-3/4 mt-1" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <div className="h-6 w-24 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded animate-pulse" />
                    <div className="h-6 w-16 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={`grid grid-cols-1 ${isSidePanel ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'} gap-6 w-full`}>
              {filteredLogs.map(log => (
                <div key={log.id} onClick={() => setSelectedLog(log)} className="flex flex-col justify-start p-6 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:shadow-[inset_0_2px_0_0_color-mix(in_srgb,var(--accent)_50%,transparent)] !transition-none relative min-h-[160px] cursor-pointer overflow-hidden">

                  <div className="flex justify-start items-start w-full relative z-10 mb-4">
                    <div className="flex items-start gap-4 w-full">
                      <div className="w-12 h-12 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center shrink-0 group-hover:-translate-y-1 transition-transform duration-500">
                        <span className="material-symbols-outlined !text-[24px] theme-text-accent drop-shadow-md">{t("icon_history", "history")}</span>
                      </div>
                      <div className="flex flex-col pt-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 w-full">
                          <span className="text-[9px] font-bold capitalize tracking-[0.2em] text-[var(--subtext)] opacity-60 truncate">{log.target_table?.replace(/_/g, ' ') || 'Unknown'}</span>
                          {log.game_name && (
                            <span className="px-1.5 py-0.5 rounded bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[8px] font-black capitalize tracking-widest shrink-0 ml-auto">
                              {log.game_name}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-black capitalize tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors line-clamp-2 drop-shadow-sm leading-tight">{log.action}</span>
                        {log.reason && (
                          <span className="text-[9px] font-bold text-[var(--subtext)] truncate w-full opacity-50 mt-1">{log.reason}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <div className="flex flex-col min-w-0 flex-1 pr-2">
                      <span className="text-[8px] font-black capitalize tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("audit_actor", "Actor")}</span>
                      <span className="text-[10px] font-bold text-[var(--text)] opacity-90 mt-1 flex items-center gap-1 truncate">
                        <span className="material-symbols-outlined !text-[12px] theme-text-accent shrink-0">{t("icon_person", "person")}</span>
                        <span className="truncate">{log.actor?.username || log.actor_id?.substring(0, 8) || 'SYSTEM'}</span>
                      </span>
                    </div>

                    <div className="flex flex-col items-end shrink-0 pl-2 border-l border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                      <span className="text-[8px] font-black capitalize tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("sort_date", "Date")}</span>
                      <span className="text-[10px] font-bold text-[var(--text)] opacity-90 mt-1">
                        {new Date(log.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {filteredLogs.length === 0 && <EmptyState icon={t("icon_history", "history")} title={t("audit_no_logs", "No Audit Logs")} className="col-span-full py-16" />}
            </div>
          )}
        </div>
      )}

      <SidePanel
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={t("audit_details_title", "Audit Log Details")}
        subtitle={`${t("audit_log_id", "Log ID")}: ${selectedLog?.id?.substring(0, 8).toUpperCase() || "--"}`}
        icon={t("icon_history", "history")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
      >
        {selectedLog && (
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_history", "history")}
              overline={t("audit_logs", "Audit Logs")}
              title={selectedLog.action || t("audit_action", "Action")}
              description={selectedLog.reason || t("audit_logs_desc", "System and user activity logs")}
              badge={selectedLog.game_name || selectedLog.target_table}
              variant="accent"
            >
              <div className="grid grid-cols-2 gap-3 w-full">
                <StatBox
                  label={t("audit_target_table", "Target Table")}
                  value={selectedLog.target_table || "UNKNOWN"}
                  colorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("audit_timestamp", "Timestamp")}
                  value={new Date(selectedLog.created_at).toLocaleDateString()}
                />
              </div>
            </SidePanelHeroCard>

            <SidePanelTitleInput
              value={selectedLog.target_name || selectedLog.target_id || "UNKNOWN"}
              readOnly
              subtitle={`${t("audit_target_key", "Target Identifier")} • ${selectedLog.target_table || "Unknown"}`}
            />

            <UniversalGroup title={t("audit_details_title", "Audit Telemetry")} icon={t("icon_info", "info")}>
              <div className="flex flex-col gap-3 w-full">
                {selectedLog.game_name && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-60 text-[var(--subtext)] ml-2">{t("env_title", "Workspace Environment")}</span>
                    <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] text-xs font-black tracking-widest capitalize">
                      {selectedLog.game_name}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-60 text-[var(--subtext)] ml-2">{t("audit_action", "Action Executed")}</span>
                  <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-bold text-[var(--text)] break-all whitespace-pre-wrap">
                    {selectedLog.action}
                  </div>
                </div>

                {selectedLog.reason && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-60 text-[var(--subtext)] ml-2">{t("audit_reason", "Audit Reason")}</span>
                    <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-xs font-bold text-[var(--text)] whitespace-pre-wrap">
                      {selectedLog.reason}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-60 text-[var(--subtext)] ml-2">{t("audit_timestamp", "Exact Timestamp")}</span>
                  <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-mono font-bold text-[var(--text)]">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup title={t("audit_actor", "Actor Identity")} icon={t("icon_person", "person")}>
              <div className="glass-surface rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-bold text-[var(--text)] flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                    {t("icon_person", "person")}
                  </span>
                  <span className="truncate">
                    {selectedLog.actor ? `${selectedLog.actor.username} ${selectedLog.actor.is_banned ? '(BANNED)' : ''}` : (selectedLog.actor_id || 'SYSTEM')}
                  </span>
                </div>
                {selectedLog.actor && !hideEditIdentity && (
                  <ActionButton
                    variant="glass"
                    icon={t("icon_person", "person")}
                    onClick={() => setSelectedProfile(selectedLog.actor)}
                    className="!px-4 !py-2 shrink-0"
                  >
                    {t("edit_identity", "Edit Identity")}
                  </ActionButton>
                )}
              </div>
            </UniversalGroup>
          </div>
        )}
      </SidePanel>

      <SharedIdentityEditor profile={selectedProfile} onClose={() => setSelectedProfile(null)} onUpdated={fetchLogs} isSkinny={true} />
    </ElevatedHubLayout>
  );

  if (isSidePanel) {
    return (
      <SidePanel
        isOpen={isOpen}
        onClose={onClose || (() => { })}
        title={t("audit_title", "Audit Logs")}
        subtitle={t("audit_desc", "System Activity & Security Ledger")}
        icon={t("icon_history", "history")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[760px]"
        noPadding={true}
      >
        <div className="h-full relative pb-10">
          {content}
        </div>
      </SidePanel>
    );
  }

  return content;
}
