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
  fetchAllPaginated, CustomTierDropdown, ScreenUtilityBar
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
      const { data: rawLogs, error: logError } = await buildQuery(getActiveGameClient());
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
  }, [dateRange.start, dateRange.end]);

  const ALL_KNOWN_TABLES = ["audit_logs", "keeper_system_broadcasts", "keeper_tickets", "logical_conflicts", "mod_rules", "mod_vault", "play_sets", "profiles", "sanctuary_games", "sanctuary_support_categories", "sanctuary_tickets", "dlc_registry", "mod_rules_history", "logical_conflicts_history"];
  const uniqueTargets = ["ALL", ...Array.from(new Set([...ALL_KNOWN_TABLES, ...logs.map(log => log.target_table).filter(Boolean)]))];
  const filterOptions = uniqueTargets.sort().map(target => ({
    id: target,
    label: target === "ALL" ? "ALL LOGS" : target.replace(/_/g, ' ').toUpperCase()
  }));

  const ALL_KNOWN_GAMES = ["Core OS", ...partnerGames.map(db => db.name)];
  const uniqueGames = ["ALL", ...Array.from(new Set([...ALL_KNOWN_GAMES, ...logs.map(log => log.game_name).filter(Boolean)]))];
  const filterGameOptions = uniqueGames.map(game => ({
    id: game,
    label: game === "ALL" ? "ALL WORKSPACES" : game.toUpperCase()
  }));

  const filteredLogs = logs.filter(log => {
    const matchesAction = filterAction === "ALL" || log.target_table === filterAction;
    const matchesGame = filterGame === "ALL" || log.game_name === filterGame;
    const term = search.toLowerCase();
    const matchesSearch = !search ||
      log.action?.toLowerCase().includes(term) ||
      log.target_name?.toLowerCase().includes(term) ||
      log.actor?.username?.toLowerCase().includes(term) ||
      log.reason?.toLowerCase().includes(term);

    return matchesAction && matchesGame && matchesSearch;
  });

  const content = (
    <div className="flex flex-col w-full relative h-full">
      <ScreenUtilityBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("audit_search")}
        isSidePanel={isSidePanel}
      >
        {isKeepers && (
          <div className={`${isSidePanel ? 'flex-1' : 'w-max min-w-[160px]'} z-50 shrink-0`}>
            <CustomDropdown disableTint={true}
              value={filterGame}
              onChange={(v: string[]) => setFilterGame(v[0])}
              options={filterGameOptions}
              placeholder="WORKSPACES"
              searchable={true}
            />
          </div>
        )}
        <div className={`${isSidePanel ? 'flex-1' : 'w-max min-w-[160px]'} z-40 shrink-0`}>
          <CustomDropdown disableTint={true}
            value={filterAction}
            onChange={(v: string[]) => setFilterAction(v[0])}
            options={filterOptions}
            placeholder={t("auto_filter_logs")}
            searchable={true}
          />
        </div>
        <div className="flex items-center gap-2 text-[var(--subtext)] z-30 shrink-0">
          <CustomDatePicker
            value={dateRange.start || null}
            onChange={(date) => setDateRange(prev => ({ ...prev, start: date }))}
            placeholder="Start"
          />
          <span className="opacity-50">to</span>
          <CustomDatePicker
            value={dateRange.end || null}
            onChange={(date) => setDateRange(prev => ({ ...prev, end: date }))}
            placeholder="End"
          />
        </div>
      </ScreenUtilityBar>

      <div className={`p-6 w-full flex flex-col gap-6 animate-in fade-in`}>

        {loading ? (
          <div className={`grid grid-cols-1 ${isSidePanel ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'} gap-6 w-full`}>
            {[...Array(isSidePanel ? 6 : 12)].map((_, i) => (
              <div key={i} className="flex flex-col justify-start p-6 rounded-[var(--radius)] glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative overflow-hidden min-h-[160px]">
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
                <div className="flex justify-start items-end w-full relative z-10 mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <div className="h-6 w-24 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded animate-pulse" />
                  <div className="h-6 w-16 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${isSidePanel ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'} gap-6 w-full`}>
            {filteredLogs.map(log => (
              <div key={log.id} onClick={() => setSelectedLog(log)} className="flex flex-col justify-start p-6 rounded-[var(--radius)] glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-md transition-all duration-500 relative overflow-hidden min-h-[160px] cursor-pointer hover:-translate-y-1.5">
                <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_50%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="flex justify-start items-start w-full relative z-10 mb-4">
                  <div className="flex items-start gap-4 w-full">
                    <div className="w-12 h-12 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
                      <span className="material-symbols-outlined !text-[24px] theme-text-accent drop-shadow-md">{t("icon_history")}</span>
                    </div>
                    <div className="flex flex-col pt-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 w-full">
                        <span className="text-[9px] font-bold capitalize tracking-[0.2em] text-[var(--subtext)] opacity-60 truncate">{log.target_table.replace(/_/g, ' ')}</span>
                        {log.game_name && (
                          <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] text-[8px] font-black capitalize tracking-widest shrink-0 shadow-inner ml-auto">
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

                <div className="flex justify-start items-end w-full relative z-10 mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  <div className="flex flex-col min-w-0 flex-1 pr-2">
                    <span className="text-[8px] font-black capitalize tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("audit_actor")}</span>
                    <span className="text-[10px] font-bold text-[var(--text)] opacity-90 mt-1 flex items-center gap-1 truncate">
                      <span className="material-symbols-outlined !text-[12px] theme-text-accent shrink-0">{t("icon_person")}</span>
                      <span className="truncate">{log.actor?.username || log.actor_id?.substring(0, 8) || 'SYSTEM'}</span>
                    </span>
                  </div>

                  <div className="flex flex-col items-end shrink-0 pl-2 border-l border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <span className="text-[8px] font-black capitalize tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("sort_date")}</span>
                    <span className="text-[10px] font-bold text-[var(--text)] opacity-90 mt-1">
                      {new Date(log.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {filteredLogs.length === 0 && <EmptyState icon={t("icon_history")} title={t("audit_no_logs")} className="col-span-full py-16" />}
          </div>
        )}
      </div>

      <SidePanel
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={t("audit_details_title")}
        subtitle={`${t("audit_log_id")}: ${selectedLog?.id?.substring(0, 8).toUpperCase()}`}
        icon="history"
      >
        {selectedLog && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-8 pb-32">
              {selectedLog.game_name && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)]">{t("env_title")}</h3>
                  <div className="glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] text-[var(--accent)] text-sm font-black tracking-widest capitalize shadow-inner">
                    {selectedLog.game_name}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_target_table")}</h3>
                <div className="glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-sm font-bold text-[var(--text)]">
                  {selectedLog.target_table}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_target_key")}</h3>
                <div className="glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-sm font-bold text-[var(--text)] break-all">
                  {selectedLog.target_name || selectedLog.target_id || 'UNKNOWN'}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_action")}</h3>
                <div className="glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-md text-sm font-bold text-[var(--text)] break-all whitespace-pre-wrap">
                  {selectedLog.action}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_reason")}</h3>
                <div className="glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-md text-sm font-bold text-[var(--text)] whitespace-pre-wrap">
                  {selectedLog.reason}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_timestamp")}</h3>
                <div className="glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-sm font-bold text-[var(--text)]">
                  {new Date(selectedLog.created_at).toLocaleString()}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black capitalize tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_actor")}</h3>
                <div className="glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-sm font-bold text-[var(--text)] flex items-center justify-start">
                  <span>
                    {selectedLog.actor ? `${selectedLog.actor.username} ${selectedLog.actor.is_banned ? '(BANNED)' : ''}` : selectedLog.actor_id}
                  </span>
                  {selectedLog.actor && !hideEditIdentity && (
                    <button
                      onClick={() => setSelectedProfile(selectedLog.actor)}
                      className={`h-10 !py-0 px-6 ${standardButtonClass}`}
                    >
                      <span className="material-symbols-outlined !text-[16px]">{t("icon_person")}</span>
                      {t("edit_identity")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </SidePanel>

      <SharedIdentityEditor profile={selectedProfile} onClose={() => setSelectedProfile(null)} onUpdated={fetchLogs} isSkinny={true} />
    </div>
  );

  if (isSidePanel) {
    if (!isOpen) return null;
    return (
      <SidePanel
        isOpen={isOpen}
        onClose={onClose || (() => { })}
        title={t("audit_title")}
        subtitle={t("audit_desc")}
        icon="history"
        widthClass="w-[700px]"
        panelZ="z-[100]"
        backdropZ="z-[99]"
      >
        <div className="h-[80vh] relative -mx-6 -mt-6">
          {content}
        </div>
      </SidePanel>
    );
  }

  return content;
}

