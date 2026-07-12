import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown } from "../shared";
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
  hideEditIdentity = false
}: {
  isSidePanel?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  hideEditIdentity?: boolean;
} = {}) {
  const { t } = useLexicon();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const fetchLogs = async () => {
    if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") {
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase.from('audit_logs').select('*');

    if (isSidePanel) {
      query = query.neq('target_table', 'profiles').neq('target_table', 'sanctuary_tickets');
    }

    if (dateStart) {
      query = query.gte('created_at', new Date(dateStart).toISOString());
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }

    const { data: rawLogs, error: logError } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (logError || !rawLogs) {
      console.error("Audit Logs Error", logError);
      setLoading(false);
      return;
    }

    const actorIds = [...new Set(rawLogs.map(log => log.actor_id).filter(id => id))];

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

    const mergedLogs = rawLogs.map(log => ({
      ...log,
      actor: profileMap[log.actor_id] || null
    }));

    setLogs(mergedLogs);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [dateStart, dateEnd]);

  const uniqueTargets = ["ALL", ...Array.from(new Set(logs.map(log => log.target_table).filter(Boolean)))];
  const filterOptions = uniqueTargets.map(target => ({
    id: target,
    label: target === "ALL" ? "ALL LOGS" : target.replace(/_/g, ' ').toUpperCase()
  }));

  const filteredLogs = logs.filter(log => {
    const matchesAction = filterAction === "ALL" || log.target_table === filterAction;
    const term = search.toLowerCase();
    const matchesSearch = !search ||
      log.action?.toLowerCase().includes(term) ||
      log.target_name?.toLowerCase().includes(term) ||
      log.actor?.username?.toLowerCase().includes(term) ||
      log.reason?.toLowerCase().includes(term);

    return matchesAction && matchesSearch;
  });

  const content = (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex flex-col md:flex-row items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5">
        {!isSidePanel && (
          <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest whitespace-nowrap flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] opacity-70 theme-text-accent drop-shadow-lg">{t("icon_history")}</span>
            </div>
            <span className="truncate">{t("audit_title")}</span>
          </h2>
        )}

        <div className={`flex gap-4 flex-1 w-full ${isSidePanel ? 'flex-col' : 'justify-end items-center flex-wrap'}`}>
          <div className={`relative ${isSidePanel ? 'w-full' : 'flex-1 max-w-[300px] min-w-[200px]'}`}>
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
            <input
              type="text"
              placeholder={t("audit_search")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40 font-inter"
            />
          </div>
          <div className={`flex items-center gap-4 ${isSidePanel ? 'w-full' : ''}`}>
            <div className={`${isSidePanel ? 'flex-1' : 'w-48'} z-40 shrink-0`}>
              <CustomDropdown disableTint={true}
                value={filterAction}
                onChange={(v: string[]) => setFilterAction(v[0])}
                options={filterOptions}
                placeholder={t("auto_filter_logs")}
                searchable={true}
              />
            </div>
            <div className={`flex items-center gap-2 text-[var(--subtext)] z-30 ${isSidePanel ? 'flex-1' : ''}`}>
              <div className={`${isSidePanel ? 'flex-1' : 'w-36'}`}>
                <CustomDatePicker value={dateStart || null} onChange={val => setDateStart(val || "")} placeholder={t("auto_start")} />
              </div>
              <span className="opacity-50">-</span>
              <div className={`${isSidePanel ? 'flex-1' : 'w-36'}`}>
                <CustomDatePicker value={dateEnd || null} onChange={val => setDateEnd(val || "")} placeholder={t("auto_end")} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 w-full flex flex-col gap-6 animate-in fade-in">

        {loading ? (
          <div className="p-12 text-center text-[var(--subtext)] opacity-50 font-black uppercase tracking-widest animate-pulse">{t("audit_fetching")}</div>
        ) : (
          <div className={`grid grid-cols-1 ${isSidePanel ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'} gap-6 w-full`}>
            {filteredLogs.map(log => (
              <div key={log.id} onClick={() => setSelectedLog(log)} className="flex flex-col justify-between p-6 rounded-[var(--radius)] theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)] transition-all duration-500 relative overflow-hidden min-h-[160px] cursor-pointer hover:-translate-y-1.5">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="flex justify-between items-start w-full relative z-10 mb-4">
                  <div className="flex items-start gap-4 w-full">
                    <div className="w-12 h-12 rounded-2xl theme-glass-inner border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.3)] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
                      <span className="material-symbols-outlined !text-[24px] theme-text-accent drop-shadow-md">{t("icon_history")}</span>
                    </div>
                    <div className="flex flex-col pt-1 min-w-0 flex-1">
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-60 mb-1 truncate">{log.target_table.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-black uppercase tracking-widest text-[var(--text)] group-hover:theme-text-accent transition-colors line-clamp-2 drop-shadow-sm leading-tight">{log.action}</span>
                      {log.reason && (
                        <span className="text-[9px] font-bold text-[var(--subtext)] truncate w-full opacity-50 mt-1">{log.reason}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-end w-full relative z-10 mt-auto pt-4 border-t border-white/5">
                  <div className="flex flex-col min-w-0 flex-1 pr-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("audit_actor")}</span>
                    <span className="text-[10px] font-bold text-[var(--text)] opacity-90 mt-1 flex items-center gap-1 truncate">
                      <span className="material-symbols-outlined !text-[12px] theme-text-accent shrink-0">{t("icon_person")}</span>
                      <span className="truncate">{log.actor?.username || log.actor_id.substring(0, 8)}</span>
                    </span>
                  </div>

                  <div className="flex flex-col items-end shrink-0 pl-2 border-l border-white/5">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[var(--subtext)] opacity-50">{t("sort_date")}</span>
                    <span className="text-[10px] font-bold text-[var(--text)] opacity-90 mt-1">
                      {new Date(log.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {filteredLogs.length === 0 && <EmptyState icon={t("icon_history") || "history"} title={t("audit_no_logs")} className="col-span-full py-16" />}
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
              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_target_table")}</h3>
                <div className="theme-glass-panel rounded-xl p-4 border border-white/5 text-sm font-bold text-[var(--text)]">
                  {selectedLog.target_table}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_target_key")}</h3>
                <div className="theme-glass-panel rounded-xl p-4 border border-white/5 text-sm font-bold text-[var(--text)] break-all">
                  {selectedLog.target_name || selectedLog.target_id || 'UNKNOWN'}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_action")}</h3>
                <div className="theme-glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)] text-sm font-bold text-[var(--text)] break-all whitespace-pre-wrap">
                  {selectedLog.action}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_reason")}</h3>
                <div className="theme-glass-panel rounded-xl p-4 border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--danger)_10%,transparent)] text-sm font-bold text-[var(--text)] whitespace-pre-wrap">
                  {selectedLog.reason}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_timestamp")}</h3>
                <div className="theme-glass-panel rounded-xl p-4 border border-white/5 text-sm font-bold text-[var(--text)]">
                  {new Date(selectedLog.created_at).toLocaleString()}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 text-[var(--subtext)]">{t("audit_actor")}</h3>
                <div className="theme-glass-panel rounded-xl p-4 border border-white/5 text-sm font-bold text-[var(--text)] flex items-center justify-between">
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

