import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection, SidePanelHeroCard } from '../components/layouts/ElevatedHubLayout';
import { UniversalCard } from '../components/universal/UniversalCard';
import { useState, useEffect } from "react";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import AssetPreviewSidebar from "../AssetPreviewSidebar";
import MasonPostViewer from "./MasonPostViewer";
import {
  MarketBlueprintPanel,
  NexusFlagResolutionCard,
  auditBlueprintsTier0Compliance,
  BlueprintComplianceAuditResult,
} from "./NexusSidePanels";
export type UnifiedReport = { [key: string]: any };
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel, CustomDropdown, EmptyState,
  PanelHeaderGroup, PanelHeaderButton, ActionButton, StatBox,
  VAULT_CHIP_CLASS,
  countBlueprintArtifacts,
} from "../shared";
import { UniversalGroup, UniversalTextArea } from "../components/universal/UniversalLayout";
import { logArchitectAction } from "../lib/audit";
import enDefault from "../lexicons/en-default.json";
import { deepCompare } from "../lib/MasonValidation";
import { useStore } from "../store";


export function NexusReportsViewer({ onOpenDossier: _onOpenDossier, setStatus }: any) {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const [reports, setReports] = useState<UnifiedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<UnifiedReport | null>(null);
  const [activeCodeSnippet, setActiveCodeSnippet] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<{ id: string, type: string } | null>(null);
  const [activeBlueprint, setActiveBlueprint] = useState<any | null>(null);
  const [activePost, setActivePost] = useState<any | null>(null);
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

    const [
      { data: nexusData },
      { data: blueprintData },
      { data: commData },
      { data: masonsData },
    ] = await Promise.all([
      supabase.from('nexus_reports').select('*, nexus_assets(*)'),
      supabase.from('blueprint_reports').select('*, blueprints(*)'),
      supabase.from('content_flags').select('*'),
      supabase.from('masons').select('id, name, profile_id'),
    ]);

    const masonById = new Map<string, any>();
    const masonByProfileId = new Map<string, any>();
    (masonsData || []).forEach((m: any) => {
      if (m?.id) masonById.set(String(m.id), m);
      if (m?.profile_id) masonByProfileId.set(String(m.profile_id), m);
    });

    // Audit reported blueprints for Tier 0 compliance violations so moderators see the full issue list
    const uniqueBlueprintsMap = new Map<string, any>();
    (blueprintData || []).forEach((r: any) => {
      if (r?.blueprints?.id) {
        uniqueBlueprintsMap.set(String(r.blueprints.id), r.blueprints);
      }
    });
    let bpAuditMap: Record<string, BlueprintComplianceAuditResult> = {};
    if (uniqueBlueprintsMap.size > 0) {
      try {
        bpAuditMap = await auditBlueprintsTier0Compliance(
          supabase,
          Array.from(uniqueBlueprintsMap.values()),
          { autoFlagInDb: false }
        );
      } catch (err) {
        console.warn("Blueprint compliance audit in NexusReportsViewer failed:", err);
      }
    }

    // Fetch Comm-Link posts if any content_flags reference posts
    const postIds = Array.from(
      new Set(
        (commData || [])
          .filter((r: any) => r.content_type === "post" && r.content_id)
          .map((r: any) => r.content_id)
      )
    );
    const postById = new Map<string, any>();
    if (postIds.length > 0) {
      const { data: postsData } = await supabase
        .from("mason_posts")
        .select("*, masons(id, name, profile_id)")
        .in("id", postIds);
      (postsData || []).forEach((p: any) => {
        if (p?.id) postById.set(String(p.id), p);
      });
    }

    const unified: UnifiedReport[] = [];

    if (nexusData) {
      nexusData.forEach((r: any) => {
        const asset = r.nexus_assets || {};
        const rawAuthor = asset.author || "";
        const resolvedMason =
          masonById.get(String(rawAuthor)) || masonByProfileId.get(String(rawAuthor));
        const authorName =
          resolvedMason?.name ||
          (rawAuthor && !/^[0-9a-f-]{24,}$/i.test(String(rawAuthor))
            ? String(rawAuthor)
            : t("unknown", "Unknown"));
        const authorProfileId = resolvedMason?.profile_id || rawAuthor || null;
        const subtype = String(asset.asset_type || "lexicon").toLowerCase();

        let parsedJson = asset.json_data;
        if (typeof parsedJson === "string") {
          try {
            parsedJson = JSON.parse(parsedJson);
          } catch {
            // keep string
          }
        }

        let issueCount = 0;
        let issueBadgeLabel = "";
        let diagnosticCallout = "";
        if (subtype === "lexicon" && parsedJson && typeof parsedJson === "object") {
          try {
            const parity = deepCompare(enDefault, parsedJson, true);
            issueCount = (parity.missing || 0) + (parity.deprecated || 0);
            if (parity.missing > 0) {
              issueBadgeLabel = `${parity.missing.toLocaleString()} ${t("flag_res_missing_keys", "Missing Keys")}`;
            } else if (parity.deprecated > 0) {
              issueBadgeLabel = `${parity.deprecated.toLocaleString()} ${t("flag_res_deprecated_keys", "Deprecated Keys")}`;
            }
            if (parity.missing > 0 || parity.deprecated > 0) {
              diagnosticCallout = `${parity.missing.toLocaleString()} ${t("flag_res_missing_keys", "Missing Keys")} • ${parity.deprecated.toLocaleString()} ${t("flag_res_deprecated_keys", "Deprecated Keys")}`;
            }
          } catch {}
        }

        unified.push({
          id: r.id,
          source: "nexus",
          status: r.status === 'pending' ? 'pending' : (r.status === 'dismissed' ? 'dismissed' : 'resolved'),
          title: asset.name || t("unknown_asset", "Unknown Asset"),
          description: r.reason || t("no_reason", "No reason provided"),
          created_at: r.created_at,
          reporter_name: r.reporter_name || t("anonymous", "Anonymous"),
          target_id: r.asset_id,
          metadata: {
            original_status: r.status,
            author: authorProfileId,
            author_name: authorName,
            asset_subtype: subtype,
            version: asset.version || "1.0.0",
            downloads: asset.downloads || 0,
            is_public: asset.is_public !== false,
            is_outdated: Boolean(asset.is_outdated),
            language: asset.language,
            lexicon_type: asset.lexicon_type,
            theme_mode: asset.theme_mode,
            json_data: parsedJson,
            asset_full: asset,
            issue_count: issueCount,
            issue_badge_label: issueBadgeLabel,
            diagnostic_callout: diagnosticCallout,
          }
        });
      });
    }

    if (blueprintData) {
      blueprintData.forEach((r: any) => {
        const bp = r.blueprints || {};
        const masonObj = Array.isArray(bp.masons) ? bp.masons[0] : bp.masons;
        const resolvedMason =
          masonObj ||
          (bp.mason_id ? masonById.get(String(bp.mason_id)) : null);
        const authorName =
          resolvedMason?.name ||
          bp.author ||
          t("unknown", "Unknown");
        const authorProfileId =
          resolvedMason?.profile_id || bp.mason_id || null;

        let parsedJson = bp.json_data;
        if (typeof parsedJson === "string") {
          try {
            parsedJson = JSON.parse(parsedJson);
          } catch {
            parsedJson = {};
          }
        }
        const rawModCount = Array.isArray(bp?.artifacts)
          ? countBlueprintArtifacts(bp.artifacts)
          : Array.isArray(parsedJson?.artifacts)
            ? countBlueprintArtifacts(parsedJson.artifacts)
            : Array.isArray(parsedJson?.mods)
              ? countBlueprintArtifacts(parsedJson.mods)
              : Array.isArray(parsedJson?.manifest)
                ? countBlueprintArtifacts(parsedJson.manifest)
                : 0;

        const audit = bp.id ? bpAuditMap[String(bp.id)] : undefined;
        const violations = audit?.violations || [];
        const totalMods = audit?.totalRawCount || rawModCount;
        const issueCount = violations.length;
        const issueBadgeLabel =
          issueCount > 0
            ? `${issueCount.toLocaleString()} ${t("flagged", "Flagged")}`
            : "";

        const rawReason = String(r.reason || "");
        const isAutoAudit = /^Nexus Compliance Audit:/i.test(rawReason);
        const cleanSummary = isAutoAudit
          ? t(
              "flag_res_bp_audit_summary",
              "Automated Tier 0 Compliance Audit — Only verified Tier 0 {mods} with Stable status are permitted in {Nexus} {Blueprints}."
            )
          : rawReason.replace(/\s+\?\s+/g, " — ") || t("no_reason", "No reason provided");

        const diagnosticCallout =
          issueCount > 0
            ? `${issueCount.toLocaleString()} / ${totalMods.toLocaleString()} ${t("mods", "{Mods}")} ${t("flagged", "Flagged")}`
            : "";

        unified.push({
          id: r.id,
          source: "blueprint",
          status: r.status === 'pending' ? 'pending' : (r.status === 'dismissed' ? 'dismissed' : 'resolved'),
          title: bp.name || t("unknown_blueprint", "Unknown {Blueprint}"),
          description: r.reason || t("no_reason", "No reason provided"),
          clean_summary: cleanSummary,
          created_at: r.created_at,
          reporter_name: r.reporter_name || t("anonymous", "Anonymous"),
          target_id: r.blueprint_id,
          metadata: {
            original_status: r.status,
            author: authorProfileId,
            author_name: authorName,
            asset_subtype: "blueprint",
            code: bp.code || parsedJson?.code || "",
            downloads: bp.downloads || 0,
            is_public: bp.is_public !== false,
            mod_count: totalMods,
            json_data: parsedJson,
            blueprint_full: {
              ...bp,
              author: authorName,
              mod_count: totalMods,
              json_data: parsedJson,
            },
            violations,
            issue_count: issueCount,
            issue_badge_label: issueBadgeLabel,
            diagnostic_callout: diagnosticCallout,
          }
        });
      });
    }

    if (commData) {
      commData.forEach((r: any) => {
        const post = r.content_type === "post" ? postById.get(String(r.content_id)) : null;
        const postMason = post?.masons
          ? Array.isArray(post.masons)
            ? post.masons[0]
            : post.masons
          : post?.mason_id
            ? masonById.get(String(post.mason_id))
            : null;
        const authorName =
          postMason?.name || t("role_citizen", "{Citizen}");

        unified.push({
          id: r.id,
          source: "comm-link",
          status: r.status === 'pending' ? 'pending' : (r.status === 'dismissed' ? 'dismissed' : 'resolved'),
          title: post?.title || `COMM-LINK: ${(r.content_type || '').toUpperCase()}`,
          description: r.reason || t("no_reason", "No reason provided"),
          created_at: r.created_at,
          reporter_name: r.reporter_id || t("anonymous", "Anonymous"),
          target_id: r.content_id,
          metadata: {
            original_status: r.status,
            content_type: r.content_type,
            asset_subtype: "comm-link",
            author: postMason?.profile_id || null,
            author_name: authorName,
            post_full: post || null,
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
        logArchitectAction(
          `Dismissed report for ${selectedReport.title}`,
          table,
          selectedReport.id,
          resolutionReason || undefined,
          undefined,
          false,
          {
            status: { from: selectedReport.status || 'pending', to: 'dismissed' },
            target: { to: selectedReport.title },
          }
        );
      } else if (action === 'remove') {
        if (selectedReport.source === 'nexus') {
          await supabase.from('nexus_assets').update({ is_public: false }).eq('id', selectedReport.target_id);
          await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
          logArchitectAction(
            `Removed Asset (Hidden from Public): ${selectedReport.title} due to: ${resolutionReason}`,
            `nexus_assets`,
            selectedReport.target_id,
            resolutionReason || undefined,
            undefined,
            false,
            {
              is_public: { from: true, to: false },
              report_status: { from: selectedReport.status || 'pending', to: 'resolved' },
            }
          );
        } else if (selectedReport.source === 'blueprint') {
          await supabase.from('blueprints').update({ is_public: false }).eq('id', selectedReport.target_id);
          await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
          logArchitectAction(
            `Removed Blueprint: ${selectedReport.title} due to: ${resolutionReason}`,
            `blueprints`,
            selectedReport.target_id,
            resolutionReason || undefined,
            undefined,
            false,
            {
              is_public: { from: true, to: false },
              report_status: { from: selectedReport.status || 'pending', to: 'resolved' },
            }
          );
        } else if (selectedReport.source === 'comm-link') {
          if (selectedReport.metadata.content_type === 'post') {
            await supabase.from('mason_posts').delete().eq('id', selectedReport.target_id);
          } else if (selectedReport.metadata.content_type === 'comment') {
            await supabase.from('mason_post_comments').delete().eq('id', selectedReport.target_id);
          }
          await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
          logArchitectAction(
            `Removed Comm-Link ${selectedReport.metadata.content_type}: ${selectedReport.target_id}`,
            table,
            selectedReport.id,
            resolutionReason || undefined,
            undefined,
            false,
            {
              content_type: { from: selectedReport.metadata.content_type, to: 'deleted' },
              report_status: { from: selectedReport.status || 'pending', to: 'resolved' },
            }
          );
        }
      } else if (action === 'ban') {
        if (selectedReport.metadata?.author) {
          await supabase.rpc('secure_update_spoke_profile', { p_target_user_id: selectedReport.metadata.author, p_updates: { is_banned: true, blacklist_reason: resolutionReason || 'Moderation Ban' },
            target_author: selectedReport.metadata.author,
            duration_days: banDuration === 'permanent' ? -1 : parseInt(banDuration)
          });
        }
        await supabase.from(table).update({ status: 'resolved' }).eq('id', selectedReport.id);
        logArchitectAction(
          `Banned Author for ${banDuration === 'permanent' ? 'Permanent' : banDuration + ' Days'} and Revoked Uploads: ${resolutionReason}`,
          `profiles`,
          selectedReport.metadata?.author || selectedReport.reporter_name,
          resolutionReason || undefined,
          undefined,
          false,
          {
            is_banned: { from: false, to: true },
            ban_duration: { to: banDuration === 'permanent' ? 'Permanent' : `${banDuration} Days` },
            blacklist_reason: { to: resolutionReason || 'Moderation Ban' },
          }
        );
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

  const openAssetInspector = (report: UnifiedReport) => {
    if (!report) return;
    if (report.source === "nexus" && (report.metadata?.asset_full || report.target_id)) {
      setActiveAsset({
        id: String(report.metadata?.asset_full?.id || report.target_id),
        type: String(report.metadata?.asset_full?.asset_type || report.metadata?.asset_subtype || "lexicon"),
      });
    } else if (report.source === "blueprint" && report.metadata?.blueprint_full) {
      setActiveBlueprint(report.metadata.blueprint_full);
    } else if (report.source === "comm-link" && report.metadata?.post_full) {
      setActivePost(report.metadata.post_full);
    }
  };

  const getAssetSubtypeLabel = (report: UnifiedReport) => {
    const sub = String(report.metadata?.asset_subtype || report.source || "").toLowerCase();
    if (sub === "blueprint") return t("playsets_title", "{Blueprints}");
    if (sub === "lexicon") return t("tab_lexicons", "{Lexicons}");
    if (sub === "chameleon") return t("tab_chameleons", "Chameleons");
    if (sub === "workbench_template") return t("tab_templates", "Templates");
    if (sub === "comm-link") return t("feed_title", "Comm-Link");
    return report.source;
  };

  const getAssetSubtypeIcon = (report: UnifiedReport) => {
    const sub = String(report.metadata?.asset_subtype || report.source || "").toLowerCase();
    if (sub === "blueprint") return t("icon_architecture", "architecture");
    if (sub === "lexicon") return t("icon_translate", "translate");
    if (sub === "chameleon") return t("icon_palette", "palette");
    if (sub === "workbench_template") return t("icon_space_dashboard", "space_dashboard");
    return t("icon_forum", "forum");
  };

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

    const authorName = report.metadata?.author_name || t("unknown", "Unknown");
    const reporterName = report.reporter_name || t("anonymous", "Anonymous");
    const reporterPrefix = t("reporter", "Reporter").replace(/:+$/, "");
    const canOpenAsset =
      (report.source === "nexus" && (report.metadata?.asset_full || report.target_id)) ||
      (report.source === "blueprint" && report.metadata?.blueprint_full) ||
      (report.source === "comm-link" && report.metadata?.post_full);

    return (
      <UniversalCard
        key={report.id}
        onClick={() => setSelectedReport(report)}
        layout="vertical"
        icon={isPending ? t("icon_flag", "flag") : t("icon_done_all", "done_all")}
        title={report.title}
        subtitle={`${t("by_prefix", "By")} ${authorName} • ${reporterPrefix}: ${reporterName}`}
        bannerTopLabel={`${reporterPrefix}: ${reporterName}`}
        bannerTopRightLabel={new Date(report.created_at).toLocaleDateString()}
        bannerBottomLabel={
          report.metadata?.diagnostic_callout ||
          report.clean_summary ||
          report.description
        }
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[85%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className="material-symbols-rounded !text-[12px] shrink-0"
                style={{ color: statusColorVar }}
              >
                {statusIcon}
              </span>
              <span>{statusLabel}</span>
            </div>
            {report.metadata?.is_public === false && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--warning)]">
                  {t("icon_visibility_off", "visibility_off")}
                </span>
                <span>{t("reply_hidden", "Hidden")}</span>
              </div>
            )}
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                {getAssetSubtypeIcon(report)}
              </span>
              <span>{getAssetSubtypeLabel(report)}</span>
            </div>
            {report.source === "blueprint" && typeof report.metadata?.mod_count === "number" && report.metadata.mod_count > 0 && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--subtext)]">
                  {t("icon_inventory_2", "inventory_2")}
                </span>
                <span>
                  {report.metadata.mod_count.toLocaleString()} {t("mods", "{Mods}")}
                </span>
              </div>
            )}
            {report.source === "nexus" && report.metadata?.version && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--subtext)]">
                  {t("icon_sell", "sell")}
                </span>
                <span>v{report.metadata.version}</span>
              </div>
            )}
            {report.metadata?.issue_badge_label && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--danger)]">
                  {t("icon_gpp_bad", "gpp_bad")}
                </span>
                <span>{report.metadata.issue_badge_label}</span>
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
            <div className="flex items-center gap-2 shrink-0">
              {canOpenAsset && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAssetInspector(report);
                  }}
                  className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] flex items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                    {t("icon_open_in_new", "open_in_new")}
                  </span>
                  <span>{t("open", "Open")}</span>
                </button>
              )}
              <span className="text-[var(--text)] group-hover:text-[var(--accent)] transition-all flex items-center gap-1 shrink-0">
                {t("btn_inspect", "Inspect")} <span className="text-base leading-none">&rarr;</span>
              </span>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-2 w-full">
          {(report.clean_summary || report.description) && (
            <p className="text-xs text-[var(--subtext)] opacity-85 leading-relaxed line-clamp-2">
              {report.clean_summary || report.description}
            </p>
          )}
          {report.metadata?.diagnostic_callout && (
            <div className="w-full px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined !text-[14px] text-[var(--danger)] shrink-0">
                {t("icon_report_problem", "report_problem")}
              </span>
              <span className="text-[11px] font-bold text-[var(--text)] leading-snug break-words">
                {report.metadata.diagnostic_callout}
              </span>
            </div>
          )}
        </div>
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
          <EmptyState
            icon={t("icon_sync", "sync")}
            title={t("hub_loading", "Loading...")}
          />
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
          selectedReport ? (
            <PanelHeaderGroup>
              {((selectedReport.source === "nexus" && (selectedReport.metadata?.asset_full || selectedReport.target_id)) ||
                (selectedReport.source === "blueprint" && selectedReport.metadata?.blueprint_full) ||
                (selectedReport.source === "comm-link" && selectedReport.metadata?.post_full)) && (
                <PanelHeaderButton
                  icon={t("icon_open_in_new", "open_in_new")}
                  tooltip={t("btn_inspect", "Inspect")}
                  onClick={() => openAssetInspector(selectedReport)}
                />
              )}
              {selectedReport.metadata?.json_data && (
                <PanelHeaderButton
                  icon={t("icon_data_object", "data_object")}
                  tooltip={t("btn_view_code", "View Code")}
                  onClick={() =>
                    setActiveCodeSnippet(
                      typeof selectedReport.metadata.json_data === "string"
                        ? selectedReport.metadata.json_data
                        : JSON.stringify(selectedReport.metadata.json_data, null, 2)
                    )
                  }
                />
              )}
              {selectedReport.status === 'pending' && (
                <PanelHeaderButton
                  icon={t("icon_save", "save")}
                  tooltip={t("dossier_btn_save", "Save Action")}
                  variant="accent"
                  disabled={isSubmittingAction || !resolutionReason || !selectedAction || (selectedAction === 'ban' && !banDuration)}
                  onClick={() => handleProcessReport(selectedAction as "dismiss" | "remove" | "ban")}
                />
              )}
            </PanelHeaderGroup>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          {selectedReport && (
            <>
              <SidePanelHeroCard
                icon={getAssetSubtypeIcon(selectedReport)}
                overline={`${getAssetSubtypeLabel(selectedReport)} • ${t("report_details", "Report Details")}`}
                title={selectedReport.title || t("unknown_asset", "Unknown Asset")}
                description={`${t("by_prefix", "By")} ${selectedReport.metadata?.author_name || t("unknown", "Unknown")}`}
                badge={(selectedReport.status || "pending").replace(/_/g, " ")}
                badgeIcon={
                  selectedReport.status === "pending"
                    ? t("icon_schedule", "schedule")
                    : t("icon_check_circle", "check_circle")
                }
                variant={selectedReport.status === 'pending' ? 'warning' : 'success'}
              >
                <div className="flex flex-col gap-3 w-full">
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <StatBox
                      label={t("mason", "{Mason}")}
                      value={selectedReport.metadata?.author_name || t("unknown", "Unknown")}
                      icon={t("icon_person", "person")}
                      colorClass="text-[var(--accent)]"
                    />
                    <StatBox
                      label={t("category", "Type")}
                      value={
                        selectedReport.source === "blueprint" && selectedReport.metadata?.code
                          ? `${getAssetSubtypeLabel(selectedReport)} (${selectedReport.metadata.code})`
                          : selectedReport.source === "nexus" && selectedReport.metadata?.version
                            ? `${getAssetSubtypeLabel(selectedReport)} (v${selectedReport.metadata.version})`
                            : getAssetSubtypeLabel(selectedReport)
                      }
                      icon={getAssetSubtypeIcon(selectedReport)}
                    />
                    <StatBox
                      label={t("reporter", "Reporter")}
                      value={selectedReport.reporter_name || t("anonymous", "Anonymous")}
                      icon={t("icon_flag", "flag")}
                      colorClass="text-[var(--warning)]"
                    />
                    <StatBox
                      label={t("sort_date", "Date")}
                      value={new Date(selectedReport.created_at).toLocaleDateString()}
                      icon={t("icon_calendar_today", "calendar_today")}
                    />
                  </div>

                  {/* Direct Asset Panel Access Links */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 w-full ml-auto">
                    {selectedReport.source === "nexus" && (selectedReport.metadata?.asset_full || selectedReport.target_id) && (
                      <ActionButton
                        variant="accent"
                        icon={t("icon_open_in_new", "open_in_new")}
                        onClick={() => openAssetInspector(selectedReport)}
                      >
                        {t("btn_view_nexus", "View {Nexus} Asset")}
                      </ActionButton>
                    )}
                    {selectedReport.source === "blueprint" && selectedReport.metadata?.blueprint_full && (
                      <ActionButton
                        variant="accent"
                        icon={t("icon_open_in_new", "open_in_new")}
                        onClick={() => openAssetInspector(selectedReport)}
                      >
                        {`${t("btn_inspect", "Inspect")} ${t("playsets_title", "{Blueprints}")}`}
                      </ActionButton>
                    )}
                    {selectedReport.source === "comm-link" && selectedReport.metadata?.post_full && (
                      <ActionButton
                        variant="accent"
                        icon={t("icon_open_in_new", "open_in_new")}
                        onClick={() => openAssetInspector(selectedReport)}
                      >
                        {`${t("btn_inspect", "Inspect")} ${t("feed_title", "Comm-Link")}`}
                      </ActionButton>
                    )}
                    {selectedReport.metadata?.json_data && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_data_object", "data_object")}
                        onClick={() =>
                          setActiveCodeSnippet(
                            typeof selectedReport.metadata.json_data === "string"
                              ? selectedReport.metadata.json_data
                              : JSON.stringify(selectedReport.metadata.json_data, null, 2)
                          )
                        }
                      >
                        {t("btn_view_code", "View Code")}
                      </ActionButton>
                    )}
                  </div>
                </div>
              </SidePanelHeroCard>

              {/* Full List of Issues & Flag Diagnostics */}
              <NexusFlagResolutionCard
                activeFlags={[
                  {
                    id: selectedReport.id,
                    reason: selectedReport.description,
                    reporter_name: selectedReport.reporter_name,
                    created_at: selectedReport.created_at,
                  },
                ]}
                isHidden={selectedReport.metadata?.is_public === false}
                isOutdated={Boolean(selectedReport.metadata?.is_outdated)}
                assetType={String(selectedReport.metadata?.asset_subtype || selectedReport.source)}
                fileContent={selectedReport.metadata?.json_data}
                complianceViolations={selectedReport.metadata?.violations || []}
                isModerationView={true}
              />

              {/* Raw Report Reason & Asset Telemetry */}
              <UniversalGroup title={t("report_details", "Report Details")} icon={t("icon_info", "info")}>
                <div className="flex flex-col gap-3 relative z-10">
                  {selectedReport.source === "blueprint" && typeof selectedReport.metadata?.mod_count === "number" && (
                    <div className="grid grid-cols-2 gap-3">
                      <StatBox
                        label={t("mods", "{Mods}")}
                        value={selectedReport.metadata.mod_count.toLocaleString()}
                        icon={t("icon_inventory_2", "inventory_2")}
                        colorClass="text-[var(--accent)]"
                      />
                      <StatBox
                        label={t("flagged", "Flagged")}
                        value={(selectedReport.metadata?.issue_count || 0).toLocaleString()}
                        icon={t("icon_gpp_bad", "gpp_bad")}
                        colorClass="text-[var(--danger)]"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">
                      {t("reason", "Reason")}
                    </label>
                    <p className="text-xs font-bold text-[var(--text)] leading-relaxed glass-surface px-4 py-3.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] break-words">
                      {selectedReport.description}
                    </p>
                  </div>
                </div>
              </UniversalGroup>

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

                      <ActionButton
                        variant="accent"
                        icon={t("icon_save", "save")}
                        disabled={isSubmittingAction || !resolutionReason || !selectedAction || (selectedAction === 'ban' && !banDuration)}
                        onClick={() => handleProcessReport(selectedAction as "dismiss" | "remove" | "ban")}
                        className="w-full justify-center !py-3 mt-1"
                      >
                        {t("dossier_btn_save", "Save Action")}
                      </ActionButton>
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
          title={selectedReport?.title}
        />
      )}

      {activeAsset && (
        <AssetPreviewSidebar
          assetType={activeAsset.type}
          assetId={activeAsset.id}
          onClose={() => setActiveAsset(null)}
        />
      )}

      {activeBlueprint && (
        <MarketBlueprintPanel
          selectedMarketBlueprint={activeBlueprint}
          setSelectedMarketBlueprint={setActiveBlueprint}
          handleDownloadBlueprint={() => {}}
          openFlagModal={() => {}}
          session={session}
          backdropZ="z-[70000]"
          panelZ="z-[70001]"
        />
      )}

      {activePost && (
        <MasonPostViewer
          post={activePost}
          onClose={() => setActivePost(null)}
          userId={session?.user?.id || null}
          backdropZ="z-[70000]"
          panelZ="z-[70001]"
        />
      )}
    </ElevatedHubLayout>
  );
}
