import React, { useState, useEffect, useMemo } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { standardSuccessButtonClass, standardDangerButtonClass, SidePanel, CustomDatePicker, CustomDropdown } from "./shared";

export default function SAOversightReports() {
  const { t } = useLexicon();
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [viewingGroup, setViewingGroup] = useState<any[] | null>(null);
  
  // Filters
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"new" | "archive">("new");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  // Group Filters
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
      // Search
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        r.artifact_name?.toLowerCase().includes(searchLower) ||
        r.signature?.toLowerCase().includes(searchLower) ||
        r.citizen_id?.toLowerCase().includes(searchLower) ||
        r.original_path?.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // Tab (New vs Archive)
      const rDate = new Date(r.detected_at || r.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      if (filterTab === "new" && rDate < thirtyDaysAgo) return false;
      if (filterTab === "archive" && rDate >= thirtyDaysAgo) return false;

      // Date Range
      if (dateStart && rDate < new Date(dateStart)) return false;
      if (dateEnd) {
        const dEnd = new Date(dateEnd);
        dEnd.setHours(23, 59, 59, 999);
        if (rDate > dEnd) return false;
      }

      return true;
    });
  }, [reports, search, filterTab, dateStart, dateEnd]);

  const timeOptions = [
    { id: "all", label: t("sa_time_all") },
    { id: "24h", label: t("sa_time_24h") },
    { id: "week", label: t("sa_time_week") },
    { id: "month", label: t("sa_time_month") },
    { id: "year", label: t("sa_time_year") }
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

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full flex-wrap">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_threat_intelligence")}</span>
          </div>
          <span className="truncate">{t("sa_oversight_dashboard")}</span>
        </h2>

          <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search")}</span>
              <input 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                placeholder={t("sa_oversight_search")} 
                className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
              />
            </div>
            
            <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 border border-white/5 h-12 shrink-0 z-40">
              <button 
                onClick={() => setFilterTab("new")}
                className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${filterTab === 'new' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
              >
                {t("sa_oversight_tab_new")}
              </button>
              <button 
                onClick={() => setFilterTab("archive")}
                className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${filterTab === 'archive' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
              >
                {t("sa_oversight_tab_archive")}
              </button>
            </div>

          <div className="flex items-center gap-2 text-[var(--subtext)] z-30 shrink-0">
             <div className="w-32">
               <CustomDatePicker value={dateStart || null} onChange={val => setDateStart(val || "")} placeholder={t("auto_start")} />
             </div>
             <span className="opacity-50">-</span>
             <div className="w-32">
               <CustomDatePicker value={dateEnd || null} onChange={val => setDateEnd(val || "")} placeholder={t("auto_end")} />
             </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          {isLoading ? (
            <div className="theme-glass-panel p-8 rounded-3xl text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">{t("sa_comp_scanning")}</div>
          ) : groupedReports.length === 0 ? (
            <div className="theme-glass-panel p-8 rounded-3xl text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest">{t("sa_no_reports")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {groupedReports.map(group => {
                const report = group[0];
                const isMalware = report.status === 'blacklisted';
                const rDate = new Date(report.detected_at || report.created_at);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const isNew = rDate >= thirtyDaysAgo;
                const displayStatus = report.status === 'pending' ? (isNew ? t("sa_oversight_tab_new") : t("sa_oversight_tab_archive")) : report.status;

                return (
                  <div 
                    key={report.id} 
                    onClick={() => { 
                      if (group.length > 1) {
                        setViewingGroup(group);
                      } else {
                        setViewingReport(report); 
                      }
                    }}
                    className={`cursor-pointer theme-glass-panel rounded-[1.5rem] flex flex-col group/card border transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] ${isMalware ? 'border-red-900/50 hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)]'}`}
                  >
                    <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                      <div className="flex justify-between items-start gap-4">
                        <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] ${isMalware ? 'group-hover/card:border-red-500/30' : 'group-hover/card:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}>
                            <span className={`material-symbols-outlined !text-[24px] opacity-50 group-hover/card:opacity-100 transition-colors duration-500 ${isMalware ? 'text-red-500' : 'text-[var(--text)] group-hover/card:theme-text-accent'}`}>
                                {t("auto_threat_intelligence")}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          {group.length > 1 && (
                            <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-white/5 ${isMalware ? 'text-red-300 border-red-500/30' : 'theme-text-accent border-[var(--accent)]/30'}`}>
                                {group.length} {t("sa_oversight_hits_count")}
                            </span>
                          )}
                          <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-white/5 ${isMalware ? 'text-red-500 border-red-500/30' : 'theme-text-danger border-[var(--danger)]/30'}`}>
                              {displayStatus}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1 mt-auto pt-2">
                          <span className={`text-lg font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight transition-colors ${isMalware ? 'group-hover/card:text-red-400' : 'group-hover/card:theme-text-accent'}`}>
                            {report.artifact_name || t("sa_oversight_unknown_artifact") || "UNKNOWN ARTIFACT"}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 flex gap-1.5 items-center">
                              <span className="material-symbols-outlined !text-[12px] opacity-70">{t("auto_fingerprint")}</span>
                              {report.detected_hash ? report.detected_hash.substring(0,8) : t("sa_oversight_na")}
                          </span>
                          <span className="text-[10px] font-mono text-red-400 opacity-80 flex gap-1.5 items-center">
                              <span className="material-symbols-outlined !text-[12px] opacity-70">{t("auto_warning")}</span>
                              {report.signature === "N/A" ? (t("sa_oversight_na")) : (report.signature || t("sa_oversight_unknown_threat") || "Unknown Threat")}
                          </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {viewingGroup && (
        <SidePanel
          title={t("sa_oversight_group_sidepanel_title")}
          isOpen={true}
          widthClass="w-[700px]"
          onClose={() => setViewingGroup(null)}
          subtitle={t("sa_oversight_group_sidepanel_subtitle")}
          icon={t("ui_icon_threat_intelligence")}
        >
          <div className="flex flex-col gap-4 h-full">
             <div className="flex items-center gap-3 w-full border-b border-white/5 pb-4 shrink-0 flex-wrap">
               <div className="relative flex-1 min-w-[200px]">
                 <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search")}</span>
                 <input 
                   value={groupSearch} 
                   onChange={e => setGroupSearch(e.target.value)} 
                   placeholder={t("sa_oversight_search")} 
                   className="w-full theme-glass-panel rounded-xl pl-9 pr-4 h-10 text-xs font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
                 />
               </div>
               
               <div className="flex items-center gap-1 theme-glass-panel rounded-lg p-1 border border-white/5 h-10 shrink-0">
                 <button 
                   onClick={() => setGroupFilterTab("all")}
                   className={`px-3 py-0 h-full rounded-md text-[9px] font-black uppercase tracking-widest transition-all flex items-center ${groupFilterTab === 'all' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
                 >
                   {t("auto_all")}
                 </button>
                 <button 
                   onClick={() => setGroupFilterTab("new")}
                   className={`px-3 py-0 h-full rounded-md text-[9px] font-black uppercase tracking-widest transition-all flex items-center ${groupFilterTab === 'new' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
                 >
                   {t("auto_new")}
                 </button>
                 <button 
                   onClick={() => setGroupFilterTab("archive")}
                   className={`px-3 py-0 h-full rounded-md text-[9px] font-black uppercase tracking-widest transition-all flex items-center ${groupFilterTab === 'archive' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
                 >
                   {t("auto_archive")}
                 </button>
               </div>

               <div className="w-36 z-30 shrink-0">
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
                  if (groupSearch && !r.original_path?.toLowerCase().includes(searchLower)) return false;

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
                  const displayStatus = r.status === 'pending' ? (isNew ? t("sa_oversight_tab_new") : t("sa_oversight_tab_archive")) : r.status;
                  const isMalware = r.status === 'blacklisted';

                  return (
                    <div 
                      key={r.id} 
                      onClick={() => setViewingReport(r)}
                      className={`p-4 theme-glass-panel rounded-2xl cursor-pointer transition-colors flex flex-col gap-1 border overflow-hidden relative group/item ${isMalware ? 'border-red-900/30 hover:border-red-500' : 'border-white/5 hover:border-[var(--accent)]/50'}`}
                    >
                       <div className="flex justify-between items-start gap-2 relative z-10 mb-1">
                          <span className="text-sm font-black text-[var(--text)] tracking-widest">{rDate.toLocaleDateString()}</span>
                          <span className={`px-2 py-1 rounded-md text-[8px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-white/5 ${isMalware ? 'text-red-500 border-red-500/30' : 'theme-text-danger border-[var(--danger)]/30'}`}>
                              {displayStatus}
                          </span>
                       </div>
                       <span className="text-[10px] font-mono opacity-60 text-[var(--subtext)] relative z-10 font-bold">{rDate.toLocaleTimeString()}</span>
                       <span className="text-[9px] uppercase font-black tracking-widest opacity-40 text-[var(--subtext)] truncate mt-2 border-t border-white/5 pt-2 relative z-10">{r.original_path || t("sa_oversight_unknown_artifact") || "UNKNOWN"}</span>
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
        const viewingDisplayStatus = viewingReport.status === 'pending' ? (isNew ? t("sa_oversight_tab_new") : t("sa_oversight_tab_archive")) : viewingReport.status;

        return (
          <SidePanel
            title={t("sa_oversight_manifest_panel")}
            icon={t("ui_icon_threat_intelligence")}
            isOpen={true}
            widthClass="w-[625px]"
            onClose={() => setViewingReport(null)}
            subtitle={`${t("sa_oversight_report_id")}: ${viewingReport.id}`}
          >
            <div className="flex flex-col gap-8 h-full">
              <div className="flex flex-col gap-6 relative">
                <h4 className="text-[10px] font-black text-[var(--text)] opacity-80 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("auto_info")}</span>
                  {t("sa_oversight_lbl_report_details")}
                </h4>
                
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("sa_oversight_lbl_artifact_name")}</span>
                     <div className="w-full p-3.5 theme-glass-panel rounded-xl border border-white/5 shadow-inner flex items-center min-h-[48px]">
                       <span className="text-sm font-bold text-[var(--text)] break-all">{viewingReport.artifact_name || t("sa_oversight_unknown_artifact") || "UNKNOWN ARTIFACT"}</span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("sa_oversight_lbl_status")}</span>
                     <div className="w-full p-3.5 theme-glass-panel rounded-xl border border-white/5 shadow-inner flex items-center min-h-[48px]">
                       <span className={`text-sm font-black uppercase tracking-widest bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(255,255,255,0.1)] ${viewingReport.status === 'blacklisted' ? 'bg-gradient-to-r from-amber-400 to-yellow-500' : viewingReport.status === 'cleared' ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}>
                         {viewingDisplayStatus}
                       </span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("sa_oversight_lbl_signature")}</span>
                     <div className="w-full p-3.5 theme-glass-panel rounded-xl border border-white/5 shadow-inner flex items-center min-h-[48px]">
                       <span className={`text-sm font-black uppercase tracking-widest bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(255,255,255,0.1)] ${viewingReport.signature === "N/A" ? 'bg-gradient-to-r from-gray-400 to-gray-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`}>
                         {viewingReport.signature === "N/A" ? (t("sa_oversight_na")) : (viewingReport.signature || t("sa_oversight_unknown_threat") || "Unknown Threat")}
                       </span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("sa_oversight_lbl_dna_hash")}</span>
                     <div className="w-full p-3.5 theme-glass-panel rounded-xl border border-white/5 shadow-inner flex items-center min-h-[48px]">
                       <span className="text-sm font-bold text-[var(--text)] break-all opacity-90">{viewingReport.detected_hash || t("sa_oversight_na") || "NO SIGNATURE MATCH"}</span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("sa_oversight_lbl_detected_at")}</span>
                     <div className="w-full p-3.5 theme-glass-panel rounded-xl border border-white/5 shadow-inner flex items-center min-h-[48px]">
                       <span className="text-sm font-bold text-[var(--text)]">{formatDate(viewingReport.detected_at || viewingReport.created_at)}</span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("sa_oversight_lbl_payload")}</span>
                     <div className="w-full p-3.5 theme-glass-panel rounded-xl border border-white/5 shadow-inner flex items-center min-h-[48px]">
                       <span className="text-sm font-bold text-[var(--text)] truncate max-w-full">{viewingReport.original_path || t("sa_oversight_na") || "NO SIGNATURE MATCH"}</span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("sa_oversight_lbl_orig_status")}</span>
                     <div className="w-full p-3.5 theme-glass-panel rounded-xl border border-white/5 shadow-inner flex items-center min-h-[48px]">
                       <span className={`text-sm font-black uppercase tracking-widest bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(255,255,255,0.1)] ${viewingReport.original_exists === true ? 'bg-gradient-to-r from-amber-400 to-yellow-500' : viewingReport.original_exists === false ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-gray-400 to-gray-500'}`}>
                         {viewingReport.original_exists === true ? t("sa_oversight_status_present") : viewingReport.original_exists === false ? t("sa_oversight_status_removed") : t("sa_oversight_status_unknown")}
                       </span>
                     </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)] ml-1">{t("sa_oversight_lbl_shredded_status")}</span>
                     <div className="w-full p-3.5 theme-glass-panel rounded-xl border border-white/5 shadow-inner flex items-center min-h-[48px]">
                       <span className={`text-sm font-black uppercase tracking-widest bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(255,255,255,0.1)] ${(viewingReport.original_shredded === true || viewingReport.quarantined_file_shredded === true) ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : viewingReport.original_shredded === false ? 'bg-gradient-to-r from-red-400 to-rose-500' : 'bg-gradient-to-r from-gray-400 to-gray-500'}`}>
                         {(viewingReport.original_shredded === true || viewingReport.quarantined_file_shredded === true) ? t("sa_oversight_status_shredded") : viewingReport.original_shredded === false ? t("sa_oversight_status_not_shredded") : t("sa_oversight_status_unknown")}
                       </span>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </SidePanel>
        );
      })()}
    </div>
  );
}
