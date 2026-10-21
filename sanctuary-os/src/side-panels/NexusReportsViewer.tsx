import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput } from '../components/layouts/ElevatedHubLayout';
import { UniversalCard } from '../components/universal/UniversalCard';
import React, { useState, useEffect } from "react";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
export type UnifiedReport = { [key: string]: any };
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel, CustomDropdown, EmptyState,
  PanelHeaderGroup, PanelHeaderButton
} from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";
import { logArchitectAction } from "../lib/audit";


export function NexusReportsViewer({ onOpenDossier, setStatus }: any) {
  const { t } = useLexicon();
  const [reports, setReports] = useState<UnifiedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<UnifiedReport | null>(null);
  const [activeCodeSnippet, setActiveCodeSnippet] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<{ id: string, type: string } | null>(null);
  const [resolutionReason, setResolutionReason] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [selectedAction, setSelectedAction] = useState<"dismiss" | "remove" | "ban" | "">("");
  const [banDuration, setBanDuration] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState<"pending" | "resolved" | "dismissed" | "overview" | "ALL">("overview");
  const [activeType, setActiveType] = useState<string>("ALL");

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);

    const { data: nexusData } = await supabase
      .from('nexus_reports')
      .select('*, nexus_assets(*)');

    const { data: blueprintData } = await supabase
      .from('blueprint_reports')
      .select('*, blueprints(*)');

    const { data: commData } = await supabase
      .from('content_flags')
      .select('*');

    const unified: UnifiedReport[] = [];

    if (nexusData) {
      nexusData.forEach((r: any) => {
        unified.push({
          id: r.id,
          source: "nexus",
          status: r.status === 'pending' ? 'pending' : (r.status === 'dismissed' ? 'dismissed' : 'resolved'),
          title: r.nexus_assets?.name || (t("unknown_asset") || "Unknown Asset"),
          description: r.reason || (t("no_reason") || "No reason provided"),
          created_at: r.created_at,
          reporter_name: r.reporter_name || (t("anonymous") || "Anonymous"),
          target_id: r.asset_id,
          metadata: {
            original_status: r.status,
            author: r.nexus_assets?.author,
            json_data: r.nexus_assets?.json_data,
            asset_full: r.nexus_assets
          }
        });
      });
    }

    if (blueprintData) {
      blueprintData.forEach((r: any) => {
        unified.push({
          id: r.id,
          source: "blueprint",
          status: r.status === 'pending' ? 'pending' : (r.status === 'dismissed' ? 'dismissed' : 'resolved'),
          title: r.blueprints?.name || (t("unknown_blueprint") || "Unknown Blueprint"),
          description: r.reason || (t("no_reason") || "No reason provided"),
          created_at: r.created_at,
          reporter_name: r.reporter_name || (t("anonymous") || "Anonymous"),
          target_id: r.blueprint_id,
          metadata: {
            original_status: r.status,
            author: r.blueprints?.author_id
          }
        });
      });
    }

    if (commData) {
      commData.forEach((r: any) => {
        unified.push({
          id: r.id,
          source: "comm-link",
          status: r.status === 'pending' ? 'pending' : (r.status === 'dismissed' ? 'dismissed' : 'resolved'),
          title: `COMM-LINK: ${(r.content_type || '').toUpperCase()}`,
          description: r.reason || (t("no_reason") || "No reason provided"),
          created_at: r.created_at,
          reporter_name: r.reporter_id || (t("anonymous") || "Anonymous"),
          target_id: r.content_id,
          metadata: {
            original_status: r.status,
            content_type: r.content_type
          }
        });
      });
    }

    setReports(unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setLoading(false);
  };

  const handleProcessReport = async (action: 'dismiss' | 'remove' | 'ban') => {
    if (!selectedReport) return;
    setIsSubmittingAction(true);

    try {
      const table = selectedReport.source === 'nexus' ? 'nexus_reports'
        : selectedReport.source === 'blueprint' ? 'blueprint_reports'
          : 'content_flags';

      if (action === 'dismiss') {
        await supabase.from(table).update({ status: 'dismissed' }).eq('id', selectedReport.id);
        logArchitectAction(`Dismissed report for ${selectedReport.title}`, table, selectedReport.id);
      } else if (action === 'remove') {
        if (selectedReport.source === 'nexus') {
          await supabase.from('nexus_assets').update({ is_public: false }).eq('id', selectedReport.target_id);
          await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
          logArchitectAction(`Removed Asset (Hidden from Public): ${selectedReport.title} due to: ${resolutionReason}`, `nexus_assets`, selectedReport.target_id);
        } else if (selectedReport.source === 'blueprint') {
          await supabase.from('blueprints').update({ is_public: false }).eq('id', selectedReport.target_id);
          await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
          logArchitectAction(`Removed Blueprint: ${selectedReport.title} due to: ${resolutionReason}`, `blueprints`, selectedReport.target_id);
        } else if (selectedReport.source === 'comm-link') {
          if (selectedReport.metadata.content_type === 'post') {
            await supabase.from('mason_posts').delete().eq('id', selectedReport.target_id);
          } else if (selectedReport.metadata.content_type === 'comment') {
            await supabase.from('mason_post_comments').delete().eq('id', selectedReport.target_id);
          }
          await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
          logArchitectAction(`Removed Comm-Link ${selectedReport.metadata.content_type}: ${selectedReport.target_id}`, table, selectedReport.id);
        }
      } else if (action === 'ban') {
        if (selectedReport.metadata?.author) {
          await supabase.rpc('secure_update_spoke_profile', { p_target_user_id: selectedReport.metadata.author, p_updates: { is_banned: true, blacklist_reason: resolutionReason || 'Moderation Ban' },
            target_author: selectedReport.metadata.author,
            duration_days: banDuration === 'permanent' ? -1 : parseInt(banDuration)
          });
        }
        await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
        logArchitectAction(`Banned Author for ${banDuration === 'permanent' ? 'Permanent' : banDuration + ' Days'} and Revoked Uploads: ${resolutionReason}`, `profiles`, selectedReport.metadata?.author || selectedReport.reporter_name);
      }

      setReports(reports.map(r => r.id === selectedReport.id ? { ...r, status: action === 'dismiss' ? 'dismissed' : 'resolved' } : r));
      setSelectedReport(null);
      setResolutionReason("");
    } catch (e) {
      console.error(e);
      if (setStatus) setStatus(`${t("icon_block") || "block"} ${t("failed_action") || "Action failed"}`);
    }

    setIsSubmittingAction(false);
  };

  const filteredReports = reports.filter(r => {
    if (activeStatus !== "ALL" && activeStatus !== "overview" && r.status !== activeStatus) return false;
    if (activeType !== "ALL" && r.source !== activeType) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!r.title.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pendingReports = reports.filter(r => r.status === 'pending');
  const completedReports = reports.filter(r => r.status === 'resolved' || r.status === 'dismissed');

  const renderReportCard = (report: UnifiedReport) => {
    const isPending = report.status?.toLowerCase() === 'pending';
    return (
      <UniversalCard
        key={report.id}
        onClick={() => setSelectedReport(report)}
        layout="vertical"
        icon={isPending ? "warning" : "done_all"}
        title={report.title}
        subtitle={report.source.replace('-', ' ')}
        badges={
          <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors ${isPending ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_20%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'}`}>
            {(report.status || "PENDING").replace(/_/g, ' ')}
          </span>
        }
        footer={
          <div className="flex justify-between items-center w-full gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-1.5 opacity-60 shrink-0">
                <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today") || "calendar_today"}</span>
                {new Date(report.created_at).toLocaleDateString()}
              </span>
              <span className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest flex items-center gap-1.5 opacity-60 truncate">
                <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_person") || "person"}</span>
                {(report.reporter_name || "").substring(0, 8)}
              </span>
            </div>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] capitalize tracking-widest transition-all flex items-center gap-1 shrink-0">
              {t("btn_view") || "View"} <span className="text-lg leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] line-clamp-3 leading-relaxed font-bold opacity-70 group-hover:opacity-100 transition-opacity">
          {report.description}
        </p>
      </UniversalCard>
    );
  };

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon="schedule"
        iconColorClass="text-[var(--accent)]"
        title={t("recent_pending") || "Recent Pending"}
        isEmpty={pendingReports.length === 0}
        emptyIcon="check_circle"
        emptyTitle={t("no_pending") || "No Pending Reports"}
      >
        {pendingReports.slice(0, 4).map(renderReportCard)}
      </HubOverviewSection>

      <HubOverviewSection
        icon="check_circle"
        iconColorClass="text-[var(--success)]"
        title={t("recent_completed") || "Recent Completed"}
        isEmpty={completedReports.length === 0}
        emptyIcon="history"
        emptyTitle={t("no_history") || "No history"}
      >
        {completedReports.slice(0, 4).map(renderReportCard)}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  return (
    <ElevatedHubLayout
      headerTitle={t("stat_bugs") || "Nexus Reports"}
      headerSubtitle={t("nexus_reports_desc") || "Review flags and reports"}
      headerIcon="flag"
      headerIconColorClass="theme-text-accent"
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={(t("search_queue") || "Search reports...") as string}
      hideSearch={activeStatus === 'overview'}
      activeTab={activeStatus}
      onTabChange={(tabId: string) => setActiveStatus(tabId as any)}
      tabs={[
        { id: "overview", label: t("landing_overview") || "Overview", icon: "dashboard", number: reports.length.toString() },
        { id: "pending", label: t("pending") || "Pending", icon: "schedule", number: pendingReports.length.toString() },
        { id: "resolved", label: t("resolved") || "Resolved", icon: "check_circle", number: reports.filter(r => r.status === 'resolved').length.toString() },
        { id: "dismissed", label: t("dismissed") || "Dismissed", icon: "close", number: reports.filter(r => r.status === 'dismissed').length.toString() }
      ]}
      primaryPopover={
        activeStatus !== 'overview' ? {
          icon: "tune",
          label: t("filters") || "Filters",
          content: (
            <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category") || "Type"}</span>
                <CustomDropdown
                  flat={true}
                  variant="pill"
                  disableTint={true}
                  value={activeType}
                  options={[
                    { id: 'ALL', label: t("ui_tab_all_types") || "All Types" },
                    { id: 'nexus', label: t("tab_nexus") || "Nexus" },
                    { id: 'blueprint', label: t("playsets_title") || "Playsets" },
                    { id: 'comm-link', label: t("feed_title") || "Comm-Link" }
                  ]}
                  onChange={(v: string[]) => setActiveType(v[0])}
                  placeholder={(t("auto_select_type") || "Select Type") as string}
                />
              </div>
            </div>
          )
        } : undefined
      }
    >
      <div className="flex-1 flex flex-col gap-6 w-full animate-in fade-in pb-16">
        {activeStatus === 'overview' ? (
          renderLanding()
        ) : loading ? (
          <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)]">{t("hub_loading") || "Loading..."}</div>
        ) : filteredReports.length === 0 ? (
          <EmptyState icon={t("icon_security") || "security"} title={t("auto_no_tickets_found_38") || "No reports found"} className="col-span-full py-16" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
            {filteredReports.map(renderReportCard)}
          </div>
        )}
      </div>

      <SidePanel
        isOpen={!!selectedReport}
        onClose={() => {
          setSelectedReport(null);
          setResolutionReason("");
        }}
        title={t("report_details") || "Report Details"}
        subtitle={t("dossier_subtitle") || "Review report dossier"}
        icon="shield"
        headerActions={
          selectedReport?.status === 'pending' ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon="save"
                tooltip={t("dossier_btn_save") || "Save Action"}
                variant="accent"
                disabled={isSubmittingAction || !resolutionReason || !selectedAction || (selectedAction === 'ban' && !banDuration)}
                onClick={() => handleProcessReport(selectedAction as "dismiss" | "remove" | "ban")}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col h-full gap-8">
          {selectedReport && (
            <>
              <SidePanelTitleInput
                value={selectedReport.title || ""}
                readOnly
                subtitle={`${t("reporter") || "Reporter"}: ${selectedReport.reporter_name}`}
              />

              <UniversalGroup title={t("report_details") || "Report Details"} icon={t("icon_info") || "info"}>
                <div className="flex flex-col gap-4 relative z-10">
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("reporter") || "Reporter"}</label>
                    <span className="glass-surface rounded-xl px-5 h-12 flex items-center text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">{selectedReport.reporter_name}</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("reason") || "Reason"}</label>
                    <p className="text-sm font-bold text-[var(--text)] leading-relaxed glass-surface px-5 py-4 min-h-[4rem] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">{selectedReport.description}</p>
                  </div>
                </div>
              </UniversalGroup>

              {(selectedReport.source === 'nexus' && selectedReport.metadata?.asset_full || selectedReport.metadata?.json_data) && (
                <UniversalGroup title={t("resources") || "Resources"} icon={t("icon_link") || "link"}>
                  <div className="flex gap-4 relative z-10">
                    {selectedReport.source === 'nexus' && selectedReport.metadata?.asset_full && (
                      <button
                        onClick={() => setActiveAsset({ id: selectedReport.metadata.asset_full.id, type: selectedReport.metadata.asset_full.asset_type })}
                        className="flex-1 py-3 glass-surface hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--text)] hover:text-[var(--success)] font-black text-[10px] capitalize tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 group border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]"
                      >
                        <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("icon_visibility") || "visibility"}</span>
                        {t("btn_view_nexus") || "View Asset"}
                      </button>
                    )}
                    {selectedReport.metadata?.json_data && (
                      <button
                        onClick={() => setActiveCodeSnippet(typeof selectedReport.metadata.json_data === 'string' ? selectedReport.metadata.json_data : JSON.stringify(selectedReport.metadata.json_data, null, 2))}
                        className="flex-1 py-3 glass-surface hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--text)] hover:text-[var(--success)] font-black text-[10px] capitalize tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 group border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--success)_30%,transparent)]"
                      >
                        <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("icon_data_object") || "data_object"}</span>
                        {t("btn_view_code") || "View Code"}
                      </button>
                    )}
                  </div>
                </UniversalGroup>
              )}

              {selectedReport.status === 'pending' && (
                <UniversalGroup
                  title={t("dossier_action") || "Dossier Action"}
                  icon={t("icon_gavel") || "gavel"}
                  headerColorClass="text-[var(--warning)]"
                >
                  <div className="flex flex-col gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={resolutionReason}
                        onChange={e => setResolutionReason(e.target.value)}
                        placeholder={t("resolution_reason_ph") || "Enter resolution reason..."}
                        className="w-full glass-surface rounded-xl px-5 py-4 text-sm font-bold min-h-[120px] focus:outline-none transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[color-mix(in_srgb,var(--warning)_50%,transparent)] resize-none custom-scrollbar"
                      />
                    </div>

                    <div className="flex flex-col gap-3">
                      <CustomDropdown
                        value={[selectedAction]}
                        onChange={(val: string[]) => setSelectedAction(val[0] as "dismiss" | "remove" | "ban" | "")}
                        options={[
                          { id: "dismiss", label: t("btn_dismiss_report") || "Dismiss Report" },
                          { id: "remove", label: t("btn_remove_asset") || "Remove Asset" },
                          { id: "ban", label: t("btn_revoke_mason") || "Restrict Author" }
                        ]}
                        placeholder={t("ui_dropdown_action") || "Select Action"}
                        disableTint={true}
                      />
                      {selectedAction === 'ban' && (
                        <CustomDropdown
                          value={[banDuration]}
                          onChange={(val: string[]) => setBanDuration(val[0])}
                          options={[
                            { id: "1", label: t("ban_24h") || "24 Hours" },
                            { id: "7", label: t("ban_7d") || "7 Days" },
                            { id: "30", label: t("ban_30d") || "30 Days" },
                            { id: "permanent", label: t("ban_permanent") || "Permanent" }
                          ]}
                          placeholder={t("dropdown_ban_time") || "Select Duration"}
                          disableTint={true}
                        />
                      )}
                    </div>
                  </div>
                </UniversalGroup>
              )}
            </>
          )}
        </div>
      </SidePanel>

      {activeCodeSnippet && (
        <CodeSnippetSidebar
          onClose={() => setActiveCodeSnippet(null)}
          code={activeCodeSnippet}
          widthClass="w-[30vw] min-w-[400px] max-w-lg"
        />
      )}

      {activeAsset && (
        <AssetPreviewSidebar
          assetType={activeAsset.type}
          assetId={activeAsset.id}
          onClose={() => setActiveAsset(null)}
        />
      )}
    </ElevatedHubLayout>
  );
}

