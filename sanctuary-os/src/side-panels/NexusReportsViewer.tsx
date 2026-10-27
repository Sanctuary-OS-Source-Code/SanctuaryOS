import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelTitleInput, SidePanelHeroCard } from '../components/layouts/ElevatedHubLayout';
import { UniversalCard } from '../components/universal/UniversalCard';
import { useState, useEffect } from "react";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
export type UnifiedReport = { [key: string]: any };
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel, CustomDropdown, EmptyState,
  PanelHeaderGroup, PanelHeaderButton, ActionButton, StatBox,
  VAULT_CHIP_CLASS,
} from "../shared";
import { UniversalGroup, UniversalTextArea } from "../components/universal/UniversalLayout";
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
          title: r.nexus_assets?.name || t("unknown_asset", "Unknown Asset"),
          description: r.reason || t("no_reason", "No reason provided"),
          created_at: r.created_at,
          reporter_name: r.reporter_name || t("anonymous", "Anonymous"),
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
          title: r.blueprints?.name || t("unknown_blueprint", "Unknown {Blueprint}"),
          description: r.reason || t("no_reason", "No reason provided"),
          created_at: r.created_at,
          reporter_name: r.reporter_name || t("anonymous", "Anonymous"),
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
          description: r.reason || t("no_reason", "No reason provided"),
          created_at: r.created_at,
          reporter_name: r.reporter_id || t("anonymous", "Anonymous"),
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
      if (setStatus) setStatus(`${t("icon_block", "block")} ${t("failed_action", "Action failed")}`);
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
    const statusLower = (report.status || "pending").toLowerCase();
    const isPending = statusLower === "pending";
    const isDismissed = statusLower === "dismissed";
    const statusIcon = isPending
      ? t("icon_schedule", "schedule")
      : isDismissed
        ? t("icon_cancel", "cancel")
        : t("icon_check_circle", "check_circle");
    const statusColorVar = isPending
      ? "var(--warning)"
      : isDismissed
        ? "var(--subtext)"
        : "var(--success)";
    const statusLabel = isPending
      ? t("pending", "Pending")
      : isDismissed
        ? t("dismissed", "Dismissed")
        : t("resolved", "Resolved");

    return (
      <UniversalCard
        key={report.id}
        onClick={() => setSelectedReport(report)}
        layout="vertical"
        icon={isPending ? t("icon_flag", "flag") : t("icon_done_all", "done_all")}
        title={report.title}
        subtitle={`${t("by_author", "BY")} ${report.reporter_name || t("anonymous", "Anonymous")}`}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div
              className={VAULT_CHIP_CLASS}
              style={{
                color: statusColorVar,
                borderColor: `color-mix(in srgb, ${statusColorVar} 35%, var(--border))`,
              }}
            >
              <span className="material-symbols-rounded !text-[12px] shrink-0">
                {statusIcon}
              </span>
              <span>{statusLabel}</span>
            </div>
          </div>
        }
        badges={
          <>
            <div
              className={VAULT_CHIP_CLASS}
              style={{
                color: "var(--accent)",
                borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
              }}
            >
              <span className="material-symbols-rounded !text-[12px] shrink-0">
                {report.source === "nexus"
                  ? t("icon_hub", "hub")
                  : report.source === "blueprint"
                    ? t("icon_architecture", "architecture")
                    : t("icon_forum", "forum")}
              </span>
              <span>{report.source.replace(/-/g, " ")}</span>
            </div>
            {report.metadata?.content_type && (
              <div
                className={VAULT_CHIP_CLASS}
                style={{
                  color: "var(--subtext)",
                  borderColor: "color-mix(in srgb, var(--subtext) 35%, var(--border))",
                }}
              >
                <span className="material-symbols-rounded !text-[12px] shrink-0">
                  {t("icon_category", "category")}
                </span>
                <span>{report.metadata.content_type}</span>
              </div>
            )}
            {report.metadata?.author && (
              <div
                className={VAULT_CHIP_CLASS}
                style={{
                  color: "var(--subtext)",
                  borderColor: "color-mix(in srgb, var(--subtext) 35%, var(--border))",
                }}
              >
                <span className="material-symbols-rounded !text-[12px] shrink-0">
                  {t("icon_person", "person")}
                </span>
                <span className="truncate max-w-[120px]">{String(report.metadata.author).substring(0, 12)}</span>
              </div>
            )}
          </>
        }
        footer={
          <div className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
            <span className="flex items-center gap-1.5 truncate pr-2">
              <span className="material-symbols-outlined !text-[12px] opacity-70">
                {t("icon_calendar_today", "calendar_today")}
              </span>
              {new Date(report.created_at).toLocaleDateString()}
            </span>
            <span className="text-[var(--text)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 shrink-0">
              {t("btn_inspect", "Inspect")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        {report.description && (
          <p className="text-xs text-[var(--subtext)] opacity-80 leading-relaxed line-clamp-2">
            {report.description}
          </p>
        )}
      </UniversalCard>
    );
  };

  const renderLanding = () => (
    <HubOverviewLanding>
      <HubOverviewSection
        icon={t("icon_schedule", "schedule")}
        iconColorClass="text-[var(--accent)]"
        title={t("recent_pending", "Recent Pending")}
        isEmpty={pendingReports.length === 0}
        emptyIcon={t("icon_check_circle", "check_circle")}
        emptyTitle={t("no_pending", "No Pending Reports")}
      >
        {pendingReports.slice(0, 4).map(renderReportCard)}
      </HubOverviewSection>

      <HubOverviewSection
        icon={t("icon_check_circle", "check_circle")}
        iconColorClass="text-[var(--success)]"
        title={t("recent_completed", "Recent Completed")}
        isEmpty={completedReports.length === 0}
        emptyIcon={t("icon_history", "history")}
        emptyTitle={t("no_history", "No history")}
      >
        {completedReports.slice(0, 4).map(renderReportCard)}
      </HubOverviewSection>
    </HubOverviewLanding>
  );

  return (
    <ElevatedHubLayout
      headerTitle={t("stat_bugs", "Nexus Reports")}
      headerSubtitle={t("nexus_reports_desc", "Review flags and reports")}
      headerIcon={t("icon_flag", "flag")}
      headerIconColorClass="theme-text-accent"
      search={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={(t("search_queue", "Search reports...")) as string}
      hideSearch={activeStatus === 'overview'}
      activeTab={activeStatus}
      onTabChange={(tabId: string) => setActiveStatus(tabId as any)}
      tabs={[
        { id: "overview", label: t("overview", "Overview"), icon: t("icon_dashboard", "dashboard"), number: reports.length.toString() },
        { id: "pending", label: t("pending", "Pending"), icon: t("icon_schedule", "schedule"), number: pendingReports.length.toString() },
        { id: "resolved", label: t("resolved", "Resolved"), icon: t("icon_check_circle", "check_circle"), number: reports.filter(r => r.status === 'resolved').length.toString() },
        { id: "dismissed", label: t("dismissed", "Dismissed"), icon: t("icon_close", "close"), number: reports.filter(r => r.status === 'dismissed').length.toString() }
      ]}
      primaryPopover={
        activeStatus !== 'overview' ? {
          icon: t("icon_tune", "tune"),
          label: t("filters", "Filters"),
          content: (
            <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("category", "Type")}</span>
                <CustomDropdown
                  flat={true}
                  variant="pill"
                  disableTint={true}
                  value={activeType}
                  options={[
                    { id: 'ALL', label: t("all_types", "All Types") },
                    { id: 'nexus', label: t("tab_nexus", "{Nexus}") },
                    { id: 'blueprint', label: t("playsets_title", "{Blueprints}") },
                    { id: 'comm-link', label: t("feed_title", "Comm-Link") }
                  ]}
                  onChange={(v: string[]) => setActiveType(v[0])}
                  placeholder={(t("auto_select_type", "Select Type")) as string}
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
          <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)]">{t("hub_loading", "Loading...")}</div>
        ) : filteredReports.length === 0 ? (
          <EmptyState icon={t("icon_security", "security")} title={t("auto_no_tickets_found_38", "No reports found")} className="col-span-full py-16" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
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
        title={t("report_details", "Report Details")}
        subtitle={t("dossier_subtitle", "Review report dossier")}
        icon={t("icon_shield", "shield")}
        iconColorClass="text-[var(--warning)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          selectedReport?.status === 'pending' ? (
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_save", "save")}
                tooltip={t("dossier_btn_save", "Save Action")}
                variant="accent"
                disabled={isSubmittingAction || !resolutionReason || !selectedAction || (selectedAction === 'ban' && !banDuration)}
                onClick={() => handleProcessReport(selectedAction as "dismiss" | "remove" | "ban")}
              />
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          {selectedReport && (
            <>
              <SidePanelHeroCard
                icon={t("icon_shield", "shield")}
                overline={selectedReport.source?.toUpperCase() || t("report_details", "REPORT")}
                title={selectedReport.title || t("unknown_asset", "Unknown Asset")}
                description={t("dossier_subtitle", "Review report dossier")}
                badge={(selectedReport.status || "pending").replace(/_/g, " ")}
                badgeIcon={
                  selectedReport.status === "pending"
                    ? t("icon_schedule", "schedule")
                    : t("icon_check_circle", "check_circle")
                }
                variant={selectedReport.status === 'pending' ? 'warning' : 'success'}
              >
                <div className="grid grid-cols-2 gap-3 w-full">
                  <StatBox
                    label={t("reporter", "Reporter")}
                    value={selectedReport.reporter_name || t("anonymous", "Anonymous")}
                    icon={t("icon_person", "person")}
                    colorClass="text-[var(--accent)]"
                  />
                  <StatBox
                    label={t("sort_date", "Date")}
                    value={new Date(selectedReport.created_at).toLocaleDateString()}
                    icon={t("icon_calendar_today", "calendar_today")}
                  />
                </div>
              </SidePanelHeroCard>

              <SidePanelTitleInput
                value={selectedReport.title || ""}
                readOnly
                subtitle={`${t("reporter", "Reporter")}: ${selectedReport.reporter_name}`}
              />

              <UniversalGroup title={t("report_details", "Report Details")} icon={t("icon_info", "info")}>
                <div className="flex flex-col gap-4 relative z-10">
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("reporter", "Reporter")}</label>
                    <span className="glass-surface rounded-xl px-5 h-12 flex items-center text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">{selectedReport.reporter_name}</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("reason", "Reason")}</label>
                    <p className="text-sm font-bold text-[var(--text)] leading-relaxed glass-surface px-5 py-4 min-h-[4rem] rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">{selectedReport.description}</p>
                  </div>
                </div>
              </UniversalGroup>

              {(selectedReport.source === 'nexus' && selectedReport.metadata?.asset_full || selectedReport.metadata?.json_data) && (
                <UniversalGroup title={t("resources", "Resources")} icon={t("icon_link", "link")}>
                  <div className="flex gap-3 relative z-10">
                    {selectedReport.source === 'nexus' && selectedReport.metadata?.asset_full && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_visibility", "visibility")}
                        onClick={() => setActiveAsset({ id: selectedReport.metadata.asset_full.id, type: selectedReport.metadata.asset_full.asset_type })}
                        className="flex-1 justify-center !py-3"
                      >
                        {t("btn_view_nexus", "View {Nexus} Asset")}
                      </ActionButton>
                    )}
                    {selectedReport.metadata?.json_data && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_data_object", "data_object")}
                        onClick={() => setActiveCodeSnippet(typeof selectedReport.metadata.json_data === 'string' ? selectedReport.metadata.json_data : JSON.stringify(selectedReport.metadata.json_data, null, 2))}
                        className="flex-1 justify-center !py-3"
                      >
                        {t("btn_view_code", "View Code")}
                      </ActionButton>
                    )}
                  </div>
                </UniversalGroup>
              )}

              {selectedReport.status === 'pending' && (
                <UniversalGroup
                  title={t("dossier_action", "Dossier Action")}
                  icon={t("icon_gavel", "gavel")}
                  headerColorClass="text-[var(--warning)]"
                >
                  <div className="flex flex-col gap-4 relative z-10">
                    <UniversalTextArea
                      label={t("reason", "Resolution Reason")}
                      value={resolutionReason}
                      onChange={setResolutionReason}
                      placeholder={t("resolution_reason_ph", "Enter resolution reason...")}
                      className="min-h-[120px]"
                    />

                    <div className="flex flex-col gap-3">
                      <CustomDropdown
                        value={[selectedAction]}
                        onChange={(val: string[]) => setSelectedAction(val[0] as "dismiss" | "remove" | "ban" | "")}
                        options={[
                          { id: "dismiss", label: t("btn_dismiss_report", "Dismiss Report") },
                          { id: "remove", label: t("btn_remove_asset", "Remove {Mod}") },
                          { id: "ban", label: t("btn_revoke_mason", "Revoke {Mason} Privileges") }
                        ]}
                        placeholder={t("ui_dropdown_action", "Select Action")}
                        disableTint={true}
                      />
                      {selectedAction === 'ban' && (
                        <CustomDropdown
                          value={[banDuration]}
                          onChange={(val: string[]) => setBanDuration(val[0])}
                          options={[
                            { id: "1", label: t("ban_24h", "24 Hours") },
                            { id: "7", label: t("ban_7d", "7 Days") },
                            { id: "30", label: t("ban_30d", "30 Days") },
                            { id: "permanent", label: t("ban_permanent", "Permanent") }
                          ]}
                          placeholder={t("dropdown_ban_time", "Select Duration")}
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
