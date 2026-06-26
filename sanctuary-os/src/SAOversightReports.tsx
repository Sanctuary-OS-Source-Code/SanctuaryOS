import React, { useState, useEffect, useMemo } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";
import { standardSuccessButtonClass, standardDangerButtonClass, SidePanel, CustomDatePicker } from "./shared";

export default function SAOversightReports() {
  const { t } = useLexicon();
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingReport, setViewingReport] = useState<any>(null);
  
  // Filters
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"new" | "archive">("new");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

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

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full flex-wrap">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("ui_icon_threat_intelligence") || "threat_intelligence"}</span>
          </div>
          <span className="truncate">{t("sa_oversight_dashboard") || "OVERSIGHT REPORTS"}</span>
        </h2>

        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("ui_icon_search") || "search"}</span>
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder={t("sa_oversight_search") || "Search Payload or Signature..."} 
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>

          <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 border border-white/5 h-12 shrink-0 z-40">
            <button 
              onClick={() => setFilterTab("new")}
              className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${filterTab === 'new' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
            >
              {t("sa_oversight_tab_new") || "NEW (30 DAYS)"}
            </button>
            <button 
              onClick={() => setFilterTab("archive")}
              className={`px-4 py-0 h-full rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${filterTab === 'archive' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
            >
              {t("sa_oversight_tab_archive") || "ARCHIVE"}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[var(--subtext)] z-30 shrink-0">
             <div className="w-32">
               <CustomDatePicker value={dateStart || null} onChange={val => setDateStart(val || "")} placeholder="START" />
             </div>
             <span className="opacity-50">-</span>
             <div className="w-32">
               <CustomDatePicker value={dateEnd || null} onChange={val => setDateEnd(val || "")} placeholder="END" />
             </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          {isLoading ? (
            <div className="theme-glass-panel p-8 rounded-3xl text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest animate-pulse">{t("sa_comp_scanning") || "Scanning Global Registry..."}</div>
          ) : filteredReports.length === 0 ? (
            <div className="theme-glass-panel p-8 rounded-3xl text-center text-sm font-bold text-[var(--subtext)] uppercase tracking-widest">{t("sa_no_reports") || "No active reports found."}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredReports.map(report => {
                const isMalware = report.status === 'blacklisted';
                const rDate = new Date(report.detected_at || report.created_at);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const isNew = rDate >= thirtyDaysAgo;
                const displayStatus = report.status === 'pending' ? (isNew ? t("sa_oversight_tab_new") || "NEW" : t("sa_oversight_tab_archive") || "ARCHIVED") : report.status;

                return (
                  <div 
                    key={report.id} 
                    onClick={() => { setViewingReport(report); }}
                    className={`cursor-pointer theme-glass-panel rounded-[1.5rem] flex flex-col group border transition-all duration-500 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[160px] ${isMalware ? 'border-red-900/50 hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]' : 'border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_15%,transparent)]'}`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${isMalware ? 'from-red-500/10' : 'from-[var(--accent)]/5'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                    
                    <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 ${isMalware ? 'bg-red-500/50 group-hover:bg-red-500 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'theme-bg-accent/50 group-hover:theme-bg-accent group-hover:shadow-[0_0_20px_var(--accent)]'}`} />
                    
                    <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                      <div className="flex justify-between items-start gap-4">
                        <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] ${isMalware ? 'group-hover:border-red-500/30' : 'group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}`}>
                            <span className={`material-symbols-outlined !text-[24px] opacity-50 group-hover:opacity-100 transition-colors duration-500 ${isMalware ? 'text-red-500' : 'text-[var(--text)] group-hover:theme-text-accent'}`}>
                                threat_intelligence
                            </span>
                        </div>
                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors bg-white/5 ${isMalware ? 'text-red-500 border-red-500/30' : 'theme-text-success border-[var(--success)]/30'}`}>
                            {displayStatus}
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1 mt-auto pt-2">
                          <span className={`text-lg font-black text-[var(--text)] uppercase tracking-tighter truncate leading-tight transition-colors ${isMalware ? 'group-hover:text-red-400' : 'group-hover:theme-text-accent'}`}>
                            {report.artifact_name || t("sa_oversight_unknown_artifact") || "UNKNOWN ARTIFACT"}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)] opacity-60 flex gap-1.5 items-center">
                              <span className="material-symbols-outlined !text-[12px] opacity-70">fingerprint</span>
                              {report.detected_hash ? report.detected_hash.substring(0,8) : t("sa_oversight_na") || "N/A"}
                          </span>
                          <span className="text-[10px] font-mono text-red-400 opacity-80 flex gap-1.5 items-center">
                              <span className="material-symbols-outlined !text-[12px] opacity-70">warning</span>
                              {report.signature || t("sa_oversight_unknown_threat") || "Unknown Threat"}
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

      {viewingReport && (() => {
        const rDate = new Date(viewingReport.detected_at || viewingReport.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isNew = rDate >= thirtyDaysAgo;
        const viewingDisplayStatus = viewingReport.status === 'pending' ? (isNew ? t("sa_oversight_tab_new") || "NEW" : t("sa_oversight_tab_archive") || "ARCHIVED") : viewingReport.status;

        return (
          <SidePanel
            title={t("sa_oversight_dashboard") || "OVERSIGHT REPORT"}
            isOpen={true}
            onClose={() => setViewingReport(null)}
            subtitle={`${t("sa_oversight_report_id") || "Report ID"}: ${viewingReport.id}`}
          >
            <div className="flex flex-col gap-8 h-full">
              <div className="flex flex-col gap-6 relative">
                <h4 className="text-[10px] font-black text-[var(--text)] opacity-80 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                  <span className="material-symbols-outlined !text-[14px]">info</span>
                  {t("sa_oversight_lbl_report_details") || "REPORT DETAILS"}
                </h4>
                
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)]">{t("sa_oversight_lbl_artifact_name") || "Artifact Name"}</span>
                     <span className="text-sm font-bold text-[var(--text)] break-all">{viewingReport.artifact_name || t("sa_oversight_unknown_artifact") || "UNKNOWN ARTIFACT"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)]">{t("sa_oversight_lbl_status") || "Status"}</span>
                     <span className={`text-sm font-bold uppercase ${viewingReport.status === 'blacklisted' ? 'text-red-400' : viewingReport.status === 'cleared' ? 'text-emerald-400' : 'text-amber-400'}`}>{viewingDisplayStatus}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)]">{t("sa_oversight_lbl_signature") || "Signature Match"}</span>
                     <span className="text-sm font-bold text-red-400 break-all">{viewingReport.signature || t("sa_oversight_unknown_threat") || "Unknown Threat"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)]">{t("sa_oversight_lbl_dna_hash") || "DNA Hash"}</span>
                     <span className="text-sm font-bold text-[var(--text)] break-all">{viewingReport.detected_hash || t("sa_oversight_na") || "N/A"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)]">{t("sa_oversight_lbl_detected_at") || "Detected At"}</span>
                     <span className="text-sm font-bold text-[var(--text)]">{formatDate(viewingReport.detected_at || viewingReport.created_at)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)]">{t("sa_oversight_lbl_payload") || "Payload"}</span>
                     <span className="text-sm font-bold text-[var(--text)] truncate" title={viewingReport.original_path}>{viewingReport.original_path || t("sa_oversight_na") || "N/A"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)]">{t("sa_oversight_lbl_orig_status") || "Original File Status"}</span>
                     <span className={`text-sm font-bold uppercase ${viewingReport.original_exists === true ? 'text-amber-400' : viewingReport.original_exists === false ? 'text-emerald-400' : 'text-gray-400'}`}>
                       {viewingReport.original_exists === true ? t("sa_oversight_status_present") || "PRESENT ON DISK" : viewingReport.original_exists === false ? t("sa_oversight_status_removed") || "SECURELY SHREDDED" : t("sa_oversight_status_unknown") || "UNKNOWN"}
                     </span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <span className="text-[9px] uppercase tracking-widest font-black opacity-50 text-[var(--subtext)]">{t("sa_oversight_lbl_shredded_status") || "Shredded Status"}</span>
                     <span className={`text-sm font-bold uppercase ${(viewingReport.original_shredded === true || viewingReport.quarantined_file_shredded === true) ? 'text-emerald-400' : viewingReport.original_shredded === false ? 'text-red-400' : 'text-gray-400'}`}>
                       {(viewingReport.original_shredded === true || viewingReport.quarantined_file_shredded === true) ? t("sa_oversight_status_shredded") || "SECURELY SHREDDED" : viewingReport.original_shredded === false ? t("sa_oversight_status_not_shredded") || "NOT SHREDDED" : t("sa_oversight_status_unknown") || "UNKNOWN"}
                     </span>
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
