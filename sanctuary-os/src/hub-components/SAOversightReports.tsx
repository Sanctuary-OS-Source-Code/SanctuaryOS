import { SearchBar } from "../shared";
import React, { useState, useEffect, useMemo } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import { CustomDropdown, CustomDatePicker, EmptyState, standardSuccessButtonClass, standardDangerButtonClass, SidePanel, FilterTabs, FilterTabButton, FilterPopover } from "../shared";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";
import { UniversalCard } from "../components/universal/UniversalCard";

export default function SAOversightReports() {
  const { t } = useLexicon();
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [viewingGroup, setViewingGroup] = useState<any[] | null>(null);
  
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"LANDING" | "new" | "archive">("LANDING");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const [groupSearch, setGroupSearch] = useState("");
  const [groupFilterTab, setGroupFilterTab] = useState<"new" | "archive" | "all">("all");
  const [groupTimeRange, setGroupTimeRange] = useState("all");

  const fetchReports = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('malware_reports').select('*').order('created_at', { ascending: false });
    if (data) setReports(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        r.artifact_name?.toLowerCase().includes(searchLower) ||
        r.signature?.toLowerCase().includes(searchLower) ||
        r.citizen_id?.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      const rDate = new Date(r.detected_at || r.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      if (filterTab === "new" && rDate < thirtyDaysAgo) return false;
      if (filterTab === "archive" && rDate >= thirtyDaysAgo) return false;

      if (dateStart && rDate < new Date(dateStart)) return false;
      if (dateEnd) {
        const dEnd = new Date(dateEnd);
        dEnd.setHours(23, 59, 59, 999);
        if (rDate > dEnd) return false;
      }

      return true;
    });
  }, [reports, search, filterTab, dateStart, dateEnd]);

  const newReportsCount = useMemo(() => {
    return reports.filter(r => {
      const rDate = new Date(r.detected_at || r.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return rDate >= thirtyDaysAgo;
    }).length;
  }, [reports]);

  const archiveReportsCount = useMemo(() => {
    return reports.filter(r => {
      const rDate = new Date(r.detected_at || r.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return rDate < thirtyDaysAgo;
    }).length;
  }, [reports]);

  const timeOptions = [
    { id: "all", label: t("time_all") },
    { id: "24h", label: t("time_24h") },
    { id: "week", label: t("time_week") },
    { id: "month", label: t("time_month") },
    { id: "year", label: t("time_year") }
  ];

  const groupedReports = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    filteredReports.forEach(r => {
      const hash = r.detected_hash || "UNKNOWN";
      if (!groups[hash]) groups[hash] = [];
      groups[hash].push(r);
    });
    return Object.values(groups).map(group => {
      return group.sort((a, b) => new Date(b.detected_at || b.created_at).getTime() - new Date(a.detected_at || a.created_at).getTime());
    });
  }, [filteredReports]);

  const recentNew = useMemo(() => {
    const newGroups = groupedReports.filter(group => {
      const rDate = new Date(group[0].detected_at || group[0].created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return rDate >= thirtyDaysAgo;
    });
    return newGroups.slice(0, 5);
  }, [groupedReports]);

  const recentArchive = useMemo(() => {
    const archiveGroups = groupedReports.filter(group => {
      const rDate = new Date(group[0].detected_at || group[0].created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return rDate < thirtyDaysAgo;
    });
    return archiveGroups.slice(0, 5);
  }, [groupedReports]);

  const renderReportCard = (group: any[]) => {
    const report = group[0];
    const isMalware = report.status === 'blacklisted';
    const rDate = new Date(report.detected_at || report.created_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const isNew = rDate >= thirtyDaysAgo;
    const displayStatus = report.status === 'pending' ? (isNew ? t("ui_tab_new") : t("oversight_tab_archive")) : report.status;

    return (
      <UniversalCard
        key={report.id}
        layout="vertical-compact"
        icon="threat_intelligence"
        title={report.artifact_name || t("oversight_unknown_artifact")}
        badges={
          <div className="w-full flex flex-wrap justify-center gap-2 mt-2">
            {group.length > 1 && (
              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors bg-[color-mix(in_srgb,var(--text)_5%,transparent)] ${isMalware ? 'text-red-300 border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'theme-text-accent border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}>
                  {group.length} {t("oversight_hits_count")}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors bg-[color-mix(in_srgb,var(--text)_5%,transparent)] ${isMalware ? 'text-red-500 border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'theme-text-danger border-[color-mix(in_srgb,var(--danger)_30%,transparent)]'}`}>
                {displayStatus}
            </span>
          </div>
        }
        statusColor={isMalware ? 'border-[color-mix(in_srgb,var(--danger)_50%,transparent)]' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)]'}
        onClick={() => {
          if (group.length > 1) {
            setViewingGroup(group);
          } else {
            setViewingReport(report); 
          }
        }}
      >
        <div className="flex flex-col gap-1 mt-2 text-[10px] font-mono text-[var(--subtext)]">
          <span className="flex flex-wrap items-center justify-center gap-1.5 opacity-80 break-all text-center">
            <span className="material-symbols-outlined !text-[12px] opacity-70">fingerprint</span>
            {report.detected_hash ? report.detected_hash.substring(0,8) : t("oversight_na")}
          </span>
          <span className="flex flex-wrap items-center justify-center gap-1.5 text-red-400 opacity-90 break-words text-center">
            <span className="material-symbols-outlined !text-[12px] opacity-70">warning</span>
            {report.signature === "N/A" ? (t("oversight_na")) : (report.signature || t("oversight_unknown_threat"))}
          </span>
        </div>
      </UniversalCard>
    );
  };

  const renderLanding = () => (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
          <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] text-[var(--danger)] opacity-90 drop-shadow-lg">new_releases</span>
            </div>
            {t("recent_new_reports") || "Recent New Reports"}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
          {recentNew.length > 0 ? recentNew.map(renderReportCard) : (
            <EmptyState icon="check_circle" title={t("comp_no_alerts")} className="py-8" />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
          <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] text-[var(--accent)] opacity-90 drop-shadow-lg">archive</span>
            </div>
            {t("recent_archived_reports") || "Recent Archived Reports"}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
          {recentArchive.length > 0 ? recentArchive.map(renderReportCard) : (
            <EmptyState icon="history" title={t("no_history") || "No History"} className="py-8" />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("tab_malware_logs") as string || "Oversight Reports"}
        headerSubtitle={t("oversight_subtitle") as string || "Compliance, enforcement, audit control, and emergency authority"}
        headerIcon="threat_intelligence"
        headerIconColorClass="text-[var(--danger)]"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("oversight_search")}
        activeTab={filterTab}
        onTabChange={setFilterTab as any}
        tabs={[
          { id: 'LANDING', label: t("overview_tab") || "Overview", icon: 'dashboard', number: (newReportsCount + archiveReportsCount).toString(), colorClass: 'text-[var(--accent)]' },
          { id: 'new', label: t("ui_tab_new") as string || "New", icon: 'new_releases', number: newReportsCount.toString(), colorClass: 'text-[var(--danger)]' },
          { id: 'archive', label: t("oversight_tab_archive") as string || "Archive", icon: 'archive', number: archiveReportsCount.toString(), colorClass: 'text-[var(--accent)]' }
        ]}
        headerActions={
          <FilterPopover icon="tune" label="" className="shrink-0">
            <div className="p-4 w-64 flex flex-col gap-2 text-[10px] font-black uppercase text-[var(--subtext)]">
              <div className="text-center mb-2">{t("vault_tools_subtitle") || "Actions & Filters"}</div>
              <div className="pt-4 flex flex-col gap-2 border-t border-white/10 mt-2">
                <CustomDatePicker value={dateStart || null} onChange={val => setDateStart(val || "")} placeholder={t("auto_start")} />
                <span className="opacity-50 text-center">-</span>
                <CustomDatePicker value={dateEnd || null} onChange={val => setDateEnd(val || "")} placeholder={t("auto_end")} />
              </div>
            </div>
          </FilterPopover>
        }
      >
          {isLoading ? (
            <div className="w-full flex justify-center items-center py-20">
              <div className="w-8 h-8 border-4 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-t-[var(--accent)] rounded-full animate-spin"></div>
            </div>
          ) : filterTab === "LANDING" ? (
            renderLanding()
          ) : groupedReports.length === 0 ? (
            <EmptyState icon={t("icon_threat_intelligence")} title={t("sa_no_reports")} className="col-span-full py-16" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
              {groupedReports.map(renderReportCard)}
            </div>
          )}
      </ElevatedHubLayout>

      {viewingGroup && (
        <SidePanel
          title={t("oversight_group_sidepanel_title")}
          isOpen={true}
          widthClass="w-[700px]"
          onClose={() => setViewingGroup(null)}
          subtitle={t("oversight_group_sidepanel_subtitle")}
          icon={t("icon_threat_intelligence")}
        >
          <div className="flex flex-col gap-4 h-full">
             <div className="flex items-center gap-3 w-full border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 shrink-0 flex-wrap">
               <div className="relative flex-1 min-w-[200px]">
            <SearchBar
              value={groupSearch}
              onChange={setGroupSearch}
              placeholder={t("oversight_search")}
              className="h-12 w-full rounded-2xl"
            />
          </div>
               
               <FilterTabs className="h-10">
                 <FilterTabButton
                   id="all"
                   label={t("ql_all")}
                   activeTab={groupFilterTab}
                   setTab={setGroupFilterTab}
                 />
                 <FilterTabButton
                   id="new"
                   label={t("badge_new")}
                   activeTab={groupFilterTab}
                   setTab={setGroupFilterTab}
                 />
                 <FilterTabButton
                   id="archive"
                   label={t("auto_archive")}
                   activeTab={groupFilterTab}
                   setTab={setGroupFilterTab}
                 />
               </FilterTabs>

               <div className="w-max min-w-[144px] max-w-xs z-30 shrink-0">
                 <CustomDropdown 
                    value={groupTimeRange}
                    onChange={setGroupTimeRange}
                    options={timeOptions}
                    disableTint
                 />
               </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4 auto-rows-max overflow-y-auto custom-scrollbar flex-1 pr-2">
               {viewingGroup.filter((r) => {
                  const searchLower = groupSearch.toLowerCase();
                  if (groupSearch && !r.artifact_name?.toLowerCase().includes(searchLower)) return false;

                  const rDate = new Date(r.detected_at || r.created_at);
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                  const isNew = rDate >= thirtyDaysAgo;

                  if (groupFilterTab === "new" && !isNew) return false;
                  if (groupFilterTab === "archive" && isNew) return false;

                  if (groupTimeRange !== "all") {
                    const now = new Date();
                    if (groupTimeRange === "24h" && rDate < new Date(now.getTime() - 24 * 60 * 60 * 1000)) return false;
                    if (groupTimeRange === "week" && rDate < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) return false;
                    if (groupTimeRange === "month" && rDate < new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)) return false;
                    if (groupTimeRange === "year" && rDate < new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)) return false;
                  }
                  
                  return true;
               }).map((r, i) => {
                  const rDate = new Date(r.detected_at || r.created_at);
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                  const isNew = rDate >= thirtyDaysAgo;
                  const displayStatus = r.status === 'pending' ? (isNew ? t("ui_tab_new") : t("oversight_tab_archive")) : r.status;
                  const isMalware = r.status === 'blacklisted';

                  return (
                    <div 
                      key={r.id} 
                      onClick={() => setViewingReport(r)}
           className={`p-4 glass-panel rounded-2xl cursor-pointer transition-colors flex flex-col gap-1 border relative group/item ${isMalware ? 'border-red-900/30 hover:border-red-500' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]'}`}
                    >
                       <div className="flex justify-between items-start gap-2 relative z-10 mb-1">
                          <span className="text-sm font-black text-[var(--text)] tracking-widest">{rDate.toLocaleDateString()}</span>
                          <span className={`px-2 py-1 rounded-md text-[8px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors bg-[color-mix(in_srgb,var(--text)_5%,transparent)] ${isMalware ? 'text-red-500 border-[color-mix(in_srgb,var(--danger)_30%,transparent)]' : 'theme-text-danger border-[color-mix(in_srgb,var(--danger)_30%,transparent)]'}`}>
                              {displayStatus}
                          </span>
                       </div>
                       <span className="text-[10px] font-mono opacity-60 text-[var(--subtext)] relative z-10 font-bold">{rDate.toLocaleTimeString()}</span>
                       <span className="text-[9px] capitalize font-black tracking-widest opacity-40 text-[var(--subtext)] truncate mt-2 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] pt-2 relative z-10">{r.artifact_name || t("oversight_unknown_artifact")}</span>
                    </div>
                  );
               })}
             </div>
          </div>
        </SidePanel>
      )}

      {viewingReport && (() => {
        const rDate = new Date(viewingReport.detected_at || viewingReport.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isNew = rDate >= thirtyDaysAgo;
        const viewingDisplayStatus = viewingReport.status === 'pending' ? (isNew ? t("ui_tab_new") : t("oversight_tab_archive")) : viewingReport.status;

        return (
          <SidePanel
            title={t("oversight_manifest_panel")}
            icon={t("icon_threat_intelligence")}
            isOpen={true}
            widthClass="w-[625px]"
            onClose={() => setViewingReport(null)}
            subtitle={`${t("oversight_report_id")}: ${viewingReport.id}`}
          >
            <div className="flex flex-col gap-8 h-full">
              <div className="flex flex-col gap-6 relative">
                <h4 className="text-[10px] font-black text-[var(--text)] opacity-80 capitalize tracking-widest flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 mb-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                  {t("report_details")}
                </h4>
                
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] capitalize tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("label_modname")}</span>
                     <div className="w-full p-3.5 glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner flex items-center min-h-[48px]">
                       <span className="text-sm font-bold text-[var(--text)] break-all">{viewingReport.artifact_name || t("oversight_unknown_artifact")}</span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] capitalize tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("status")}</span>
                     <div className="w-full p-3.5 glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner flex items-center min-h-[48px]">
                       <span className={`text-sm font-black capitalize tracking-widest bg-clip-text text-transparent drop-shadow-md ${viewingReport.status === 'blacklisted' ? 'bg-gradient-to-r from-amber-400 to-yellow-500' : viewingReport.status === 'cleared' ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}>
                         {viewingDisplayStatus}
                       </span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] capitalize tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("oversight_lbl_signature")}</span>
                     <div className="w-full p-3.5 glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner flex items-center min-h-[48px]">
                       <span className={`text-sm font-black capitalize tracking-widest bg-clip-text text-transparent drop-shadow-md ${viewingReport.signature === "N/A" ? 'bg-gradient-to-r from-gray-400 to-gray-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}>
                         {viewingReport.signature === "N/A" ? (t("oversight_na")) : (viewingReport.signature || t("oversight_unknown_threat"))}
                       </span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] capitalize tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("dna_hash")}</span>
                     <div className="w-full p-3.5 glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner flex items-center min-h-[48px]">
                       <span className="text-sm font-bold text-[var(--text)] break-all opacity-90">{viewingReport.detected_hash || t("oversight_na")}</span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] capitalize tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("oversight_lbl_detected_at")}</span>
                     <div className="w-full p-3.5 glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner flex items-center min-h-[48px]">
                       <span className="text-sm font-bold text-[var(--text)]">{formatDate(viewingReport.detected_at || viewingReport.created_at)}</span>
                     </div>
                  </div>

                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] capitalize tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("oversight_lbl_orig_status")}</span>
                     <div className="w-full p-3.5 glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner flex items-center min-h-[48px]">
                       <span className={`text-sm font-black capitalize tracking-widest bg-clip-text text-transparent drop-shadow-md ${viewingReport.original_exists === true ? 'bg-gradient-to-r from-amber-400 to-yellow-500' : viewingReport.original_exists === false ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-gray-400 to-gray-500'}`}>
                         {viewingReport.original_exists === true ? t("oversight_status_present") : viewingReport.original_exists === false ? t("oversight_status_removed") : t("vlocal")}
                       </span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] capitalize tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("oversight_lbl_shredded_status")}</span>
                     <div className="w-full p-3.5 glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner flex items-center min-h-[48px]">
                       <span className={`text-sm font-black capitalize tracking-widest bg-clip-text text-transparent drop-shadow-md ${(viewingReport.original_shredded === true || viewingReport.quarantined_file_shredded === true) ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : viewingReport.original_shredded === false ? 'bg-gradient-to-r from-red-400 to-rose-500' : 'bg-gradient-to-r from-gray-400 to-gray-500'}`}>
                         {(viewingReport.original_shredded === true || viewingReport.quarantined_file_shredded === true) ? t("oversight_status_removed") : viewingReport.original_shredded === false ? t("oversight_status_not_shredded") : t("vlocal")}
                       </span>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </SidePanel>
        );
      })()}
    </>
  );
}



