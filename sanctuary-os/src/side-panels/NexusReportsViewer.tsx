import React, { useState, useEffect } from "react";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
export type UnifiedReport = { [key: string]: any };
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect,
  CustomComplianceDropdown, CustomDatePicker, StatTile,
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass,
  standardDangerButtonClass, standardAccentGlassButtonClass,
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion } from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import MasonPostViewer from "./MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";


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
  const [activeStatus, setActiveStatus] = useState<"pending" | "resolved" | "ALL">("pending");
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
          status: r.status === 'pending' ? 'pending' : 'resolved',
          title: r.nexus_assets?.name || "Unknown Asset",
          description: r.reason || "No reason provided",
          created_at: r.created_at,
          reporter_name: r.reporter_name || "Anonymous",
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
          status: r.status === 'pending' ? 'pending' : 'resolved',
          title: r.blueprints?.name || "Unknown Blueprint",
          description: r.reason || "No reason provided",
          created_at: r.created_at,
          reporter_name: r.reporter_name || "Anonymous",
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
          status: r.status === 'pending' ? 'pending' : 'resolved',
          title: `COMM-LINK: ${r.content_type.toUpperCase()}`,
          description: r.reason || "No reason provided",
          created_at: r.created_at,
          reporter_name: r.reporter_id || "Anonymous",
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
          await supabase.rpc('admin_ban_author', {
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
      if (setStatus) setStatus(`${t("icon_block")} ${t("failed_action")}`);
    }

    setIsSubmittingAction(false);
  };

  const filteredReports = reports.filter(r => {
    if (activeStatus !== "ALL" && r.status !== activeStatus) return false;
    if (activeType !== "ALL" && r.source !== activeType) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!r.title.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col w-full relative h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-white/5 w-full">
        <h2 className="text-xl font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl theme-glass-panel border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined !text-[24px] theme-text-accent opacity-90 drop-shadow-lg">{t("icon_flag")}</span>
          </div>
          <span className="truncate">{t("title_reports") || "REPORTS QUEUE"?.replace("dY>' ", "") || "Nexus Reports"}</span>
        </h2>

        <div className="flex items-center gap-3 relative flex-1 ml-auto justify-end">
          <div className="relative flex-1 max-w-[300px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm opacity-50">{t("icon_search")}</span>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t("search_queue")}
              className="w-full theme-glass-panel rounded-2xl pl-10 pr-6 h-12 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 transition-all text-[var(--text)] border border-white/5 hover:border-[var(--accent)]/50 placeholder:opacity-40"
            />
          </div>

          <div className="w-max min-w-[160px] max-w-xs relative z-50 h-12">
            <CustomDropdown disableTint={true}
              value={activeType}
              options={[
                { id: 'ALL', label: t("ui_tab_all_types") },
                { id: 'nexus', label: t("tab_nexus") },
                { id: 'blueprint', label: t("playsets_title") },
                { id: 'comm-link', label: t("feed_title") }
              ]}
              onChange={(v: string[]) => setActiveType(v[0])}
              placeholder={t("auto_select_type")}
            />
          </div>

          <div className="flex items-stretch overflow-hidden theme-glass-panel rounded-xl divide-x divide-white/5 border border-white/5 h-12 shrink-0">
            <button
              onClick={() => setActiveStatus("pending" as any)}
              className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeStatus === 'pending' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
            >
              {t("pending")}
            </button>
            <button
              onClick={() => setActiveStatus("resolved" as any)}
              className={`h-full px-5 rounded-none flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all ${activeStatus === 'resolved' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5'}`}
            >
              {t("dossier_action_resolved")}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-10">
        {loading ? (
          <div className="theme-glass-panel p-8 rounded-[var(--radius)] text-center text-sm font-bold text-[var(--subtext)]">{t("hub_loading")}</div>
        ) : filteredReports.length === 0 ? (
          <EmptyState icon={t("icon_security") || "shield"} title={t("auto_no_tickets_found_38")} className="col-span-full py-16" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
            {filteredReports.map(report => (
              <div
                key={report.id}
                className="theme-glass-panel rounded-[var(--radius)] flex flex-col group cursor-pointer border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/50 hover:shadow-[0_0_40px_rgba(var(--accent-rgb),0.15)] transition-all duration-500 hover:-translate-y-1.5 relative overflow-hidden bg-gradient-to-br from-white/5 to-transparent min-h-[220px]"
                onClick={() => setSelectedReport(report)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-500
                      ${report.status?.toLowerCase() === 'pending' ? 'bg-amber-500/50 group-hover:bg-amber-500 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.5)]' : 'bg-[var(--accent)]/50 group-hover:bg-[var(--accent)] group-hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.5)]'}
                  `} />

                <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
                  <div className="flex justify-between items-start gap-4">
                    <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-all duration-500 shadow-inner border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] group-hover:border-[var(--accent)]/30">
                      <span className="material-symbols-outlined !text-[24px] text-[var(--text)] opacity-50 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-colors duration-500">
                        {report.status?.toLowerCase() === 'pending' ? 'warning' : 'done_all'}
                      </span>
                    </div>
                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase border shadow-inner shrink-0 transition-colors
                              ${report.status?.toLowerCase() === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 group-hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 group-hover:bg-emerald-500/20'}
                          `}>
                      {(report.status || "PENDING").replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 mt-2">
                    <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2 truncate opacity-70 group-hover:opacity-100 transition-opacity">
                      {report.source.replace('-', ' ')}
                    </span>
                    <h3 className="font-black text-xl leading-tight text-[var(--text)] group-hover:text-[var(--accent)] transition-colors uppercase tracking-widest line-clamp-2">
                      {report.title}
                    </h3>
                  </div>

                  <p className="text-xs text-[var(--subtext)] line-clamp-3 leading-relaxed font-bold opacity-70 group-hover:opacity-100 transition-opacity flex-1">
                    {report.description}
                  </p>

                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] gap-4 relative">
                    <div className="flex items-center gap-4 flex-1 min-w-0 group-hover:opacity-0 transition-opacity duration-300">
                      <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60 shrink-0">
                        <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_calendar_today")}</span>
                        {new Date(report.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60 shrink-0">
                        <span className="material-symbols-outlined !text-[14px] normal-case">{t("icon_person")}</span>
                        {report.reporter_name.substring(0, 8)}
                      </span>
                    </div>
                    <button className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 shrink-0">
                      {t("btn_view")} <span className="text-lg leading-none">&rarr;</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SidePanel
        isOpen={!!selectedReport}
        onClose={() => {
          setSelectedReport(null);
          setResolutionReason("");
        }}
        title={selectedReport?.title || "Report Details"}
        icon="shield"
        footer={selectedReport?.status === 'pending' ? (
          <div className="flex justify-center items-center gap-4 w-full">
            <button type="button" onClick={() => setSelectedReport(null)} className={standardButtonClass}>
              {t("nav_cancel")}
            </button>
            <button
              onClick={() => handleProcessReport(selectedAction as "dismiss" | "remove" | "ban")}
              disabled={isSubmittingAction || !resolutionReason || !selectedAction || (selectedAction === 'ban' && !banDuration)}
              className={standardAccentGlassButtonClass}
            >
              {t("dossier_btn_save")}
            </button>
          </div>
        ) : undefined}
      >
        <div className="p-6 flex flex-col gap-6">
          {selectedReport && (
            <>
              <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent pointer-events-none rounded-2xl" />
                <h4 className="text-[10px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_info")}</span>
                  {t("report_details")}
                </h4>

                <div className="flex flex-col gap-6 relative z-10">
                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("reporter")}</label>
                    <span className="theme-glass-inner rounded-xl px-5 h-12 flex items-center text-[var(--text)] text-sm font-bold bg-black/20 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">{selectedReport.reporter_name}</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("reason")}</label>
                    <p className="text-sm font-bold text-[var(--text)] leading-relaxed theme-glass-inner px-5 py-4 min-h-[4rem] rounded-xl bg-black/20 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">{selectedReport.description}</p>
                  </div>
                </div>
              </div>

              {(selectedReport.source === 'nexus' && selectedReport.metadata?.asset_full || selectedReport.metadata?.json_data) && (
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative mt-2">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_link")}</span>
                    {t("label_resources")}
                  </h4>

                  <div className="flex gap-4 relative z-10">
                    {selectedReport.source === 'nexus' && selectedReport.metadata?.asset_full && (
                      <button
                        onClick={() => setActiveAsset({ id: selectedReport.metadata.asset_full.id, type: selectedReport.metadata.asset_full.asset_type })}
                        className="flex-1 py-3 theme-glass-inner hover:bg-emerald-500/10 text-[var(--text)] hover:text-emerald-400 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 group border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-emerald-500/30"
                      >
                        <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("icon_visibility")}</span>
                        {t("btn_view_nexus")}
                      </button>
                    )}
                    {selectedReport.metadata?.json_data && (
                      <button
                        onClick={() => setActiveCodeSnippet(typeof selectedReport.metadata.json_data === 'string' ? selectedReport.metadata.json_data : JSON.stringify(selectedReport.metadata.json_data, null, 2))}
                        className="flex-1 py-3 theme-glass-inner hover:bg-emerald-500/10 text-[var(--text)] hover:text-emerald-400 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 group border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-emerald-500/30"
                      >
                        <span className="material-symbols-outlined !text-[16px] group-hover:scale-110 transition-transform">{t("icon_data_object")}</span>
                        {t("btn_view_code")}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {selectedReport.status === 'pending' && (
                <div className="flex flex-col gap-6 p-6 theme-glass-inner rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative mt-2">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none rounded-2xl" />
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-4 mb-2">
                    <span className="material-symbols-outlined !text-[14px]">{t("icon_gavel")}</span>
                    {t("architect_action")}
                  </h4>

                  <div className="flex flex-col gap-6 relative z-10">
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={resolutionReason}
                        onChange={e => setResolutionReason(e.target.value)}
                        placeholder={t("resolution_reason_ph")}
                        className="w-full theme-glass-inner rounded-xl px-5 py-4 text-sm font-bold min-h-[120px] focus:outline-none transition-all text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-amber-500/50 resize-none custom-scrollbar bg-black/20"
                      />
                    </div>

                    <div className="flex flex-col gap-3">
                      <CustomDropdown
                        value={[selectedAction]}
                        onChange={(val: string[]) => setSelectedAction(val[0] as "dismiss" | "remove" | "ban" | "")}
                        options={[
                          { id: "dismiss", label: t("btn_dismiss_report") },
                          { id: "remove", label: t("btn_remove_asset") },
                          { id: "ban", label: t("btn_revoke_mason") }
                        ]}
                        placeholder={t("ui_dropdown_action")}
                        disableTint={true}
                      />
                      {selectedAction === 'ban' && (
                        <CustomDropdown
                          value={[banDuration]}
                          onChange={(val: string[]) => setBanDuration(val[0])}
                          options={[
                            { id: "1", label: t("ban_24h") },
                            { id: "7", label: t("ban_7d") },
                            { id: "30", label: t("ban_30d") },
                            { id: "permanent", label: t("ban_permanent") }
                          ]}
                          placeholder={t("dropdown_ban_time")}
                          disableTint={true}
                        />
                      )}
                    </div>
                  </div>
                </div>
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
    </div>
  );
}

