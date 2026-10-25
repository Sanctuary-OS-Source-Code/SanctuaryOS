import React, { useState, useEffect, useMemo } from "react";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";
import { CustomDropdown, CustomDatePicker, EmptyState, SidePanel, ActionPill, DashboardStatTile, SidePanelHeroCard, StatBox, SidePanelTitleInput, UniversalGroup } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import { ElevatedHubLayout } from "../components/layouts/ElevatedHubLayout";

export default function SAOversightReports() {
  const { t } = useLexicon();
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [viewingGroup, setViewingGroup] = useState<any[] | null>(null);
  
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"overview" | "pending" | "resolved" | "dismissed">("overview");
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
    if (!dateString) return t("oversight_na", "N/A");
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
      
      if (filterTab === "pending" && r.status !== 'pending') return false;
      if (filterTab === "resolved" && r.status !== 'blacklisted') return false;
      if (filterTab === "dismissed" && r.status !== 'cleared') return false;

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
    { id: "all", label: t("time_all", "All Time") },
    { id: "24h", label: t("time_24h", "Last 24 Hours") },
    { id: "week", label: t("time_week", "Last Week") },
    { id: "month", label: t("time_month", "Last Month") },
    { id: "year", label: t("time_year", "Last Year") }
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
    const displayStatus = report.status === 'pending' ? (isNew ? t("ui_tab_new", "New") : t("oversight_tab_archive", "Archive")) : report.status;

    return (
      <UniversalCard
        key={report.id}
        layout="vertical-compact"
        icon="threat_intelligence"
        title={report.artifact_name || t("oversight_unknown_artifact", "Unknown Artifact")}
        badges={
          <div className="w-full flex flex-wrap items-center gap-2">
            {group.length > 1 && (
              <div className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5 shrink-0">
                <span className={`material-symbols-outlined !text-[12px] ${isMalware ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>
                  {t("icon_account_tree", "account_tree")}
                </span>
                <span>{group.length} {t("oversight_hits_count", "Hits")}</span>
              </div>
            )}
            <div className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--danger)] flex items-center gap-1.5 shrink-0">
              <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                {isMalware ? t("icon_coronavirus", "coronavirus") : t("icon_warning", "warning")}
              </span>
              <span>{displayStatus}</span>
            </div>
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
            {report.detected_hash ? report.detected_hash.substring(0,8) : t("oversight_na", "N/A")}
          </span>
          <span className="flex flex-wrap items-center justify-center gap-1.5 text-[var(--danger)] opacity-90 break-words text-center">
            <span className="material-symbols-outlined !text-[12px] opacity-70">warning</span>
            {report.signature === "N/A" ? t("oversight_na", "N/A") : (report.signature || t("oversight_unknown_threat", "Unknown Threat"))}
          </span>
        </div>
      </UniversalCard>
    );
  };

  const renderLanding = () => (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
          <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] text-[var(--danger)] opacity-90 drop-shadow-lg">new_releases</span>
            </div>
            {t("recent_new_reports", "Recent New Reports")}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
          {recentNew.length > 0 ? recentNew.map(renderReportCard) : (
            <EmptyState icon="check_circle" title={t("comp_no_alerts", "No Alerts")} className="py-8" />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
          <h3 className="text-sm font-black text-[var(--text)] capitalize tracking-[0.2em] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[24px] text-[var(--accent)] opacity-90 drop-shadow-lg">archive</span>
            </div>
            {t("recent_archived_reports", "Recent Archived Reports")}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
          {recentArchive.length > 0 ? recentArchive.map(renderReportCard) : (
            <EmptyState icon="history" title={t("no_history", "No History")} className="py-8" />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ElevatedHubLayout
        headerTitle={t("tab_oversight", "Nexus Reports")}
        headerSubtitle={t("oversight_reports_desc", "Security scans and anomaly tracking.")}
        headerIcon="threat_intelligence"
        headerIconColorClass="theme-text-danger"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("oversight_search", "Search reports...") as string}
        hideSearch={filterTab === 'overview'}
        activeTab={filterTab}
        onTabChange={(tabId: string) => setFilterTab(tabId as any)}
        tabs={[
            { id: "overview", label: t("landing_overview", "Overview"), icon: "dashboard" },
            { id: "pending", label: t("pending", "Pending"), icon: "schedule", number: reports.filter(r => r.status === 'pending').length.toString() },
            { id: "resolved", label: t("resolved", "Resolved"), icon: "verified_user", number: reports.filter(r => r.status === 'blacklisted').length.toString() },
            { id: "dismissed", label: t("dismissed", "Dismissed"), icon: "cancel", number: reports.filter(r => r.status === 'cleared').length.toString() }
        ]}
        primaryPopover={filterTab !== 'overview' ? {
            icon: "tune",
            label: t("filters", "Filters"),
            content: (
                <div className="flex flex-col w-[300px] p-4 text-left">
                    <div className="flex flex-col gap-4 w-full">
                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1 flex items-center gap-2">
                            {t("sort_date", "Date Range")}
                        </div>
                        <div className="flex flex-col gap-2">
                            <CustomDatePicker flat={true} value={dateStart || null} onChange={val => setDateStart(val || "")} placeholder={t("auto_start", "Start Date")} />
                            <CustomDatePicker flat={true} value={dateEnd || null} onChange={val => setDateEnd(val || "")} placeholder={t("auto_end", "End Date")} />
                        </div>
                    </div>
                </div>
            )
        } : undefined}
      >
        {isLoading ? (
          <div className="w-full flex justify-center items-center py-20">
            <div className="w-8 h-8 border-4 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-t-[var(--accent)] rounded-full animate-spin"></div>
          </div>
        ) : filterTab === "overview" ? (
          renderLanding()
        ) : groupedReports.length === 0 ? (
          <EmptyState icon={t("icon_threat_intelligence", "threat_intelligence")} title={t("sa_no_reports", "No Reports Found")} className="col-span-full py-16" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {groupedReports.map(renderReportCard)}
          </div>
        )}
      </ElevatedHubLayout>

      {viewingGroup && (
        <SidePanel
          title={t("oversight_group_sidepanel_title", "Grouped Threat Reports")}
          isOpen={true}
          widthClass="w-[90vw] md:w-[680px]"
          onClose={() => setViewingGroup(null)}
          subtitle={t("oversight_group_sidepanel_subtitle", "Multiple telemetry detections for this signature hash.")}
          icon={t("icon_threat_intelligence", "threat_intelligence")}
          iconColorClass="text-[var(--danger)]"
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_threat_intelligence", "threat_intelligence")}
              overline={t("tab_oversight", "Nexus Reports")}
              title={viewingGroup[0]?.artifact_name || t("oversight_group_sidepanel_title", "Grouped Threat Reports")}
              description={t("oversight_group_sidepanel_subtitle", "Multiple telemetry detections for this signature hash.")}
              badge={`${viewingGroup.length} ${t("oversight_hits_count", "Hits")}`}
              badgeIcon="account_tree"
              variant="danger"
            />

            <div className="grid grid-cols-3 gap-3">
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                isActive={groupFilterTab === "all"}
                icon="list"
                label={t("ql_all", "All")}
                number={viewingGroup.length.toString()}
                onClick={() => setGroupFilterTab("all")}
              />
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                isActive={groupFilterTab === "new"}
                icon="new_releases"
                label={t("badge_new", "New")}
                onClick={() => setGroupFilterTab("new")}
              />
              <DashboardStatTile
                variant="filter"
                className="!w-full"
                isActive={groupFilterTab === "archive"}
                icon="archive"
                label={t("auto_archive", "Archive")}
                onClick={() => setGroupFilterTab("archive")}
              />
            </div>

            <ActionPill
              className="!max-w-none !w-full"
              searchQuery={groupSearch}
              setSearchQuery={setGroupSearch}
              searchPlaceholder={t("oversight_search", "Search reports...")}
              rightContent={
                <CustomDropdown 
                  flat={true}
                  variant="pill"
                  value={groupTimeRange}
                  onChange={setGroupTimeRange}
                  options={timeOptions}
                  disableTint
                />
              }
            />

            <UniversalGroup
              title={t("oversight_group_sidepanel_title", "Detection Instances")}
              icon="threat_intelligence"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                }).map((r) => {
                  const rDate = new Date(r.detected_at || r.created_at);
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                  const isNew = rDate >= thirtyDaysAgo;
                  const displayStatus = r.status === 'pending' ? (isNew ? t("ui_tab_new", "New") : t("oversight_tab_archive", "Archive")) : r.status;
                  const isMalware = r.status === 'blacklisted';

                  return (
                    <div 
                      key={r.id} 
                      onClick={() => setViewingReport(r)}
                      className={`p-4 glass-surface rounded-xl cursor-pointer transition-colors flex flex-col gap-1 border relative group/item ${isMalware ? 'border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:border-[var(--danger)]' : 'border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)]'}`}
                    >
                      <div className="flex justify-between items-start gap-2 relative z-10 mb-1">
                        <span className="text-sm font-black text-[var(--text)] tracking-widest">{rDate.toLocaleDateString()}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black tracking-widest uppercase border bg-transparent shrink-0 ${isMalware ? 'text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)]' : 'text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_40%,transparent)]'}`}>
                          {displayStatus}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono opacity-60 text-[var(--subtext)] relative z-10 font-bold">{rDate.toLocaleTimeString()}</span>
                      <span className="text-[9px] capitalize font-black tracking-widest opacity-60 text-[var(--subtext)] truncate mt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-2 relative z-10">{r.artifact_name || t("oversight_unknown_artifact", "Unknown Artifact")}</span>
                    </div>
                  );
                })}
              </div>
            </UniversalGroup>
          </div>
        </SidePanel>
      )}

      {viewingReport && (() => {
        const rDate = new Date(viewingReport.detected_at || viewingReport.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isNew = rDate >= thirtyDaysAgo;
        const viewingDisplayStatus = viewingReport.status === 'pending' ? (isNew ? t("ui_tab_new", "New") : t("oversight_tab_archive", "Archive")) : viewingReport.status;

        return (
          <SidePanel
            title={t("oversight_manifest_panel", "Threat Manifest")}
            icon={t("icon_threat_intelligence", "threat_intelligence")}
            iconColorClass="text-[var(--danger)]"
            isOpen={true}
            widthClass="w-[90vw] md:w-[680px]"
            onClose={() => setViewingReport(null)}
            subtitle={`${t("oversight_report_id", "Report ID")}: ${viewingReport.id}`}
          >
            <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
              <SidePanelHeroCard
                icon={t("icon_threat_intelligence", "threat_intelligence")}
                overline={t("oversight_manifest_panel", "Threat Manifest")}
                title={viewingReport.artifact_name || t("oversight_unknown_artifact", "Unknown Artifact")}
                description={viewingReport.signature === "N/A" ? t("oversight_na", "N/A") : (viewingReport.signature || t("oversight_unknown_threat", "Unknown Threat"))}
                badge={viewingDisplayStatus}
                badgeIcon={viewingReport.status === 'blacklisted' ? 'coronavirus' : 'warning'}
                variant={viewingReport.status === 'cleared' ? 'success' : 'danger'}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <StatBox
                    label={t("status", "Status")}
                    value={viewingDisplayStatus}
                    icon="gavel"
                    iconColorClass={viewingReport.status === 'cleared' ? "text-[var(--success)]" : "text-[var(--danger)]"}
                  />
                  <StatBox
                    label={t("oversight_lbl_detected_at", "Detected At")}
                    value={formatDate(viewingReport.detected_at || viewingReport.created_at)}
                    icon="schedule"
                    iconColorClass="text-[var(--accent)]"
                  />
                </div>
              </SidePanelHeroCard>

              <SidePanelTitleInput
                value={viewingReport.artifact_name || t("oversight_unknown_artifact", "Unknown Artifact")}
                readOnly
                label={t("label_modname", "Artifact Name")}
                subtitle={`${t("oversight_report_id", "Report ID")}: ${viewingReport.id}`}
              />

              <UniversalGroup title={t("report_details", "Report Details")} icon={t("icon_info", "info")}>
                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("oversight_lbl_signature", "Heuristic Signature")}</span>
                  <div className="w-full px-4 py-3 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center">
                    <span className={`text-sm font-black tracking-wide ${viewingReport.signature === "N/A" ? 'text-[var(--subtext)]' : 'text-[var(--danger)]'}`}>
                      {viewingReport.signature === "N/A" ? t("oversight_na", "N/A") : (viewingReport.signature || t("oversight_unknown_threat", "Unknown Threat"))}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("dna_hash", "DNA Hash")}</span>
                  <div className="w-full px-4 py-3 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center">
                    <span className="text-xs font-mono font-bold text-[var(--text)] break-all">{viewingReport.detected_hash || t("oversight_na", "N/A")}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5 w-full">
                    <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("oversight_lbl_orig_status", "Original File Status")}</span>
                    <div className="w-full px-4 py-3 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center">
                      <span className={`text-xs font-black uppercase tracking-wider ${viewingReport.original_exists === true ? 'text-[var(--warning)]' : viewingReport.original_exists === false ? 'text-[var(--success)]' : 'text-[var(--subtext)]'}`}>
                        {viewingReport.original_exists === true ? t("oversight_status_present", "Present") : viewingReport.original_exists === false ? t("oversight_status_removed", "Removed") : t("vlocal", "Unknown")}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 w-full">
                    <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">{t("oversight_lbl_shredded_status", "Quarantine Shred Status")}</span>
                    <div className="w-full px-4 py-3 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center">
                      <span className={`text-xs font-black uppercase tracking-wider ${(viewingReport.original_shredded === true || viewingReport.quarantined_file_shredded === true) ? 'text-[var(--success)]' : viewingReport.original_shredded === false ? 'text-[var(--danger)]' : 'text-[var(--subtext)]'}`}>
                        {(viewingReport.original_shredded === true || viewingReport.quarantined_file_shredded === true) ? t("oversight_status_removed", "Shredded") : viewingReport.original_shredded === false ? t("oversight_status_not_shredded", "Not Shredded") : t("vlocal", "Unknown")}
                      </span>
                    </div>
                  </div>
                </div>
              </UniversalGroup>
            </div>
          </SidePanel>
        );
      })()}
    </>
  );
}
