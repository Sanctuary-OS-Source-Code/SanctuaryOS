import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  StatBox,
  HoverTooltip,
  handleOpenUrl,
  SidePanelHeroCard,
  UniversalGroup,
} from "../shared";
import { useModalStore } from "../store/modalStore";
import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";
import { supabaseAuth } from "../supabase";
import { relaunch } from "@tauri-apps/plugin-process";
import MarkdownRenderer from "../MarkdownRenderer";
import { DispatchPollViewer } from "../components/universal/DispatchPollAndMeta";
import {
  getKeepersPipelineConfig,
  downloadAndInstallReleaseAsset,
  DEFAULT_KEEPERS_PIPELINE_CONFIG,
  KeepersPipelineConfig,
} from "../utils/supporterManager";
import { isDesktop } from "../utils/envUtils";
import {
  KeepersReleasePostRecord,
  LEGACY_BLOG_BROADCAST_TITLE,
  StructuredReleaseNotesView,
  cleanPostBodyForViewer,
  parseSeedCommunityBlog,
  parseLatestChangelogBlock,
  deserializeReleasePostRow,
} from "../components/ReleaseNotesShowcase";
import packageJson from "../../package.json";
import bundledCommunityBlog from "../../../Release Notes (Community Blog).md?raw";
import bundledNerdChangelog from "../../../changelog.md?raw";

const GITHUB_RELEASES_WEB_URL =
  "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases";
const GITHUB_WEB_DEV_RELEASE_URL =
  "https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/dev-latest";

export function UpdateSidePanel() {
  const { t } = useLexicon();
  const session = useStore((state) => state.session);
  const { updatePayload, isUpdatePanelOpen, setIsUpdatePanelOpen } = useModalStore();
  const setStatus = useStore((state) => state.setStatus);

  const [isInstalling, setIsInstalling] = useState(false);
  const [installStage, setInstallStage] = useState<
    "idle" | "downloading" | "installing" | "relaunching"
  >("idle");
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<"post" | "changelog">("post");
  const [isSyncing, setIsSyncing] = useState(false);
  const [liveReleaseNotes, setLiveReleaseNotes] = useState<string | null>(null);

  const seedPublicBlog = useMemo(() => parseSeedCommunityBlog(bundledCommunityBlog), []);
  const seedChangelog = useMemo(() => parseLatestChangelogBlock(bundledNerdChangelog), []);

  const [pipelineConfig, setPipelineConfig] = useState<KeepersPipelineConfig>(
    DEFAULT_KEEPERS_PIPELINE_CONFIG
  );

  const rawPayloadVersion = String(updatePayload?.version || "")
    .replace(/^v/i, "")
    .trim();
  const isDevUpdate = Boolean(
    updatePayload?.isDevChannel || /dev/i.test(rawPayloadVersion)
  );

  const defaultStableVersion = (
    (!isDevUpdate && rawPayloadVersion) ||
    pipelineConfig.stable_version ||
    packageJson.version.split("-")[0] ||
    packageJson.version ||
    "0.5.8"
  )
    .replace(/^v/i, "")
    .trim();

  const defaultDevVersion = (
    (isDevUpdate && rawPayloadVersion) ||
    pipelineConfig.dev_build_version ||
    seedChangelog.version ||
    packageJson.version ||
    `${defaultStableVersion}-dev.1`
  )
    .replace(/^v/i, "")
    .trim();

  const defaultStableDate =
    seedPublicBlog.releaseDate ||
    (pipelineConfig.stable_published_at
      ? new Date(pipelineConfig.stable_published_at).toLocaleDateString()
      : seedChangelog.date || new Date().toLocaleDateString());

  const defaultDevDate = pipelineConfig.dev_published_at
    ? new Date(pipelineConfig.dev_published_at).toLocaleDateString()
    : seedChangelog.date || new Date().toLocaleDateString();

  const defaultPublicPost = useMemo<Omit<KeepersReleasePostRecord, "id">>(
    () => ({
      title: seedPublicBlog.mainTitle,
      summary:
        seedPublicBlog.summary ||
        t(
          "release_notes_section_subtitle",
          "What's new in the latest Sanctuary OS build — written for humans, backed by the full technical changelog."
        ),
      version: defaultStableVersion,
      releaseDate: defaultStableDate,
      platform: t("release_notes_meta_platform_default", "Windows / Mac (Planned)"),
      imageUrl: "",
      codeSnippet: "",
      pollData: null,
      body: seedPublicBlog.cleanBody,
    }),
    [seedPublicBlog, defaultStableVersion, defaultStableDate, t]
  );

  const defaultDevPost = useMemo<Omit<KeepersReleasePostRecord, "id">>(
    () => ({
      title: `${t("release_notes_dev_card_title", "Sanctuary OS — Daily Dev Build")}`,
      summary: seedChangelog.heading
        ? `${seedChangelog.heading} — ${t(
            "release_notes_dev_card_desc",
            "Latest daily preview features, heuristic refinements, and architectural updates ahead of the next Stable release."
          )}`
        : t(
            "release_notes_dev_card_desc",
            "Latest daily preview features, heuristic refinements, and architectural updates ahead of the next Stable release."
          ),
      version: defaultDevVersion,
      releaseDate: defaultDevDate,
      platform: t("release_notes_meta_platform_default", "Windows / Mac (Planned)"),
      imageUrl: "",
      codeSnippet: "",
      pollData: null,
      body: seedChangelog.markdown,
    }),
    [seedChangelog, defaultDevVersion, defaultDevDate, t]
  );

  const [publicPost, setPublicPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultPublicPost,
  });
  const [devPost, setDevPost] = useState<KeepersReleasePostRecord>({
    id: null,
    ...defaultDevPost,
  });

  const loadPostsAndReleases = useCallback(
    async (forceRefreshGitHub = false) => {
      try {
        const cachedRaw = localStorage.getItem("sanctuary_keepers_release_posts_v1");
        if (cachedRaw) {
          const parsedCache = JSON.parse(cachedRaw);
          if (parsedCache?.publicPost) setPublicPost(parsedCache.publicPost);
          if (parsedCache?.devPost) setDevPost(parsedCache.devPost);
        }
      } catch {
        // ignore cache parse errors
      }

      try {
        const [broadcastRes, cfg] = await Promise.all([
          supabaseAuth
            .from("keeper_system_broadcasts")
            .select(
              "id, title, description, message, category, target_audience, code_snippet, poll_data, created_at"
            )
            .in("category", ["ReleasePost_Public", "ReleasePost_Dev", "ReleaseNotesBlog"])
            .order("created_at", { ascending: false }),
          getKeepersPipelineConfig(forceRefreshGitHub),
        ]);

        if (cfg) {
          setPipelineConfig(cfg);
        }

        if (!broadcastRes.error && Array.isArray(broadcastRes.data)) {
          const rows = broadcastRes.data;
          const publicRow =
            rows.find((r: any) => r.category === "ReleasePost_Public") ||
            rows.find(
              (r: any) =>
                r.category === "ReleaseNotesBlog" || r.title === LEGACY_BLOG_BROADCAST_TITLE
            );

          const devRow = rows.find((r: any) => r.category === "ReleasePost_Dev");

          const resolvedPublic = deserializeReleasePostRow(publicRow, defaultPublicPost);
          const resolvedDev = deserializeReleasePostRow(devRow, defaultDevPost);

          setPublicPost(resolvedPublic);
          setDevPost(resolvedDev);

          try {
            localStorage.setItem(
              "sanctuary_keepers_release_posts_v1",
              JSON.stringify({
                publicPost: resolvedPublic,
                devPost: resolvedDev,
              })
            );
          } catch {
            // ignore storage errors
          }
        }
      } catch {
        // Keep cached / fallback post data when offline
      }
    },
    [defaultPublicPost, defaultDevPost]
  );

  useEffect(() => {
    if (isUpdatePanelOpen) {
      setActiveView("post");
      loadPostsAndReleases(false);
    }
  }, [isUpdatePanelOpen, loadPostsAndReleases]);

  useEffect(() => {
    if (updatePayload && isUpdatePanelOpen) {
      const version = String(updatePayload.version || "").trim();
      if (!version) return;
      const rawTag =
        version.startsWith("v") || version.startsWith("V") ? version : `v${version}`;
      setLiveReleaseNotes(null);
      const primaryUrl = `https://api.github.com/repos/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tags/${rawTag}`;
      const fallbackUrl =
        rawTag !== rawTag.toLowerCase()
          ? `https://api.github.com/repos/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tags/${rawTag.toLowerCase()}`
          : isDevUpdate
            ? "https://api.github.com/repos/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tags/dev-latest"
            : primaryUrl;
      fetch(primaryUrl)
        .then((res) => (res.ok ? res : fetch(fallbackUrl)))
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.body) {
            setLiveReleaseNotes(data.body);
          }
        })
        .catch((err) => console.error("Failed to fetch live release notes:", err));
    }
  }, [updatePayload, isUpdatePanelOpen, isDevUpdate]);

  const handleRefreshReleaseData = async () => {
    setIsSyncing(true);
    try {
      await loadPostsAndReleases(true);
      useStore
        .getState()
        .pushStatus(
          t("release_notes_synced_toast", "Synced latest Release Notes & Changelog!"),
          "success"
        );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!updatePayload || isInstalling) return;
    setIsInstalling(true);
    setInstallStage("downloading");
    setDownloadProgress(0);
    setStatus(t("status_downloading_update", "Downloading Update..."));
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      const handleProgressEvent = (event: any) => {
        if (event?.event === "Started") {
          setInstallStage("downloading");
          totalBytes = Number(event?.data?.contentLength) || 0;
          setDownloadProgress(0);
        } else if (event?.event === "Progress" && event?.data?.chunkLength) {
          setInstallStage("downloading");
          downloadedBytes += Number(event.data.chunkLength) || 0;
          if (totalBytes > 0) {
            setDownloadProgress(
              Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
            );
          }
        } else if (event?.event === "Finished" || event?.event === "Installing") {
          setDownloadProgress(100);
          setInstallStage("installing");
          setStatus(t("update_panel_installing", "Installing Update..."));
        } else if (event?.event === "Relaunching") {
          setDownloadProgress(100);
          setInstallStage("relaunching");
          setStatus(t("status_restarting", "Restarting Sanctuary OS..."));
        }
      };

      // On Desktop, always run the silent in-app Rust downloader & /UPDATE /S /R installer so no Windows setup dialog appears
      if (isDesktop()) {
        const targetVer = String(updatePayload.version || "")
          .replace(/^v/i, "")
          .trim();
        const fallbackUrl =
          updatePayload.downloadUrl ||
          (isDevUpdate
            ? pipelineConfig.dev_build_download_url ||
              pipelineConfig.dev_release_url ||
              GITHUB_WEB_DEV_RELEASE_URL
            : pipelineConfig.stable_exe_url ||
              pipelineConfig.stable_msi_url ||
              pipelineConfig.stable_release_url ||
              GITHUB_RELEASES_WEB_URL);
        await downloadAndInstallReleaseAsset(
          fallbackUrl,
          targetVer,
          isDevUpdate,
          handleProgressEvent
        );
        setInstallStage("relaunching");
        setStatus(t("status_restarting", "Restarting Sanctuary OS..."));
        return;
      }

      await updatePayload.downloadAndInstall(handleProgressEvent);
      if (updatePayload.isExternalDownload && !isDesktop()) {
        setIsInstalling(false);
        setInstallStage("idle");
        setDownloadProgress(null);
        setIsUpdatePanelOpen(false);
        return;
      }
      setInstallStage("relaunching");
      setStatus(t("status_restarting", "Restarting Sanctuary OS..."));
      await relaunch();
    } catch (e) {
      setStatus(`${t("update_panel_failed_prefix", "Update Failed:")} ${e}`);
      setIsInstalling(false);
      setInstallStage("idle");
      setDownloadProgress(null);
    }
  };

  if (!updatePayload) return null;

  const activePostRecord = isDevUpdate ? devPost : publicPost;
  const cleanTargetVersion = (
    rawPayloadVersion ||
    activePostRecord.version ||
    defaultStableVersion
  )
    .replace(/^v/i, "")
    .trim();

  const resolvedDateStr = (() => {
    if (updatePayload.date) {
      const parsed = new Date(updatePayload.date);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString();
      }
    }
    return activePostRecord.releaseDate || (isDevUpdate ? defaultDevDate : defaultStableDate);
  })();

  const activePlatformStr =
    activePostRecord.platform ||
    t("release_notes_meta_platform_default", "Windows / Mac (Planned)");

  const activeChannelBadge = isDevUpdate
    ? t("release_notes_dev_channel_badge", "Daily Dev Build")
    : t("release_notes_stable_channel_badge", "Stable Release");

  const activeGitHubUrl = isDevUpdate
    ? pipelineConfig.dev_release_url || GITHUB_WEB_DEV_RELEASE_URL
    : pipelineConfig.stable_release_url ||
      (cleanTargetVersion
        ? `https://github.com/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tag/v${cleanTargetVersion}`
        : GITHUB_RELEASES_WEB_URL);

  const isDetailedChangelog = (raw?: string | null): boolean => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return false;
    const placeholderStr = "See the assets to download this version and install.";
    const simStr = "This is a simulated update payload for UI testing.";
    const defaultDevNote =
      "Daily Dev Build stream for Sanctuary OS Ecosystem Supporters ($5 = +30 Days across any Partner Community or Keepers Core).";
    if (
      trimmed === placeholderStr ||
      trimmed === simStr ||
      trimmed === defaultDevNote
    ) {
      return false;
    }
    return (
      trimmed.length > 140 &&
      (trimmed.includes("\n") || trimmed.includes("- ") || trimmed.includes("#"))
    );
  };

  const stableGitHubChangelog = isDetailedChangelog(pipelineConfig.stable_release_notes)
    ? pipelineConfig.stable_release_notes!.trim()
    : bundledNerdChangelog;

  const devGitHubChangelog = isDetailedChangelog(pipelineConfig.dev_build_notes)
    ? pipelineConfig.dev_build_notes!.trim()
    : seedChangelog.markdown || bundledNerdChangelog;

  const resolvedChangelogMarkdown = (() => {
    if (isDetailedChangelog(liveReleaseNotes)) {
      return liveReleaseNotes!.trim();
    }
    if (isDetailedChangelog(updatePayload.body)) {
      return String(updatePayload.body).trim();
    }
    return isDevUpdate ? devGitHubChangelog : stableGitHubChangelog;
  })();

  const activeTitle =
    activeView === "changelog"
      ? t("release_notes_github_changelog_title", "Full Change Log (GitHub Release Notes)")
      : activePostRecord.title;

  const activeMarkdownContent =
    activeView === "changelog"
      ? resolvedChangelogMarkdown
      : cleanPostBodyForViewer(activePostRecord.body);

  const canAutoInstall = isDesktop() || !updatePayload.isExternalDownload;

  const activeChannelShort = isDevUpdate
    ? t("release_notes_meta_channel_dev", "Dev")
    : t("release_notes_meta_channel_public", "Public");

  const installStatusText = (() => {
    if (!isInstalling) {
      return canAutoInstall
        ? t("update_panel_btn_install", "Install & Restart")
        : t("update_panel_btn_download", "Download Update");
    }
    if (installStage === "relaunching") {
      return t("status_restarting", "Restarting Sanctuary OS...");
    }
    if (installStage === "installing") {
      return t("update_panel_installing", "Installing Update...");
    }
    return downloadProgress !== null
      ? `${t("status_downloading_update", "Downloading Update...")} (${downloadProgress}%)`
      : t("status_downloading_update", "Downloading Update...");
  })();

  return (
    <SidePanel
      isOpen={isUpdatePanelOpen}
      onClose={() => setIsUpdatePanelOpen(false)}
      title={t("update_panel_title", "System Update")}
      subtitle={`${activeChannelBadge} v${cleanTargetVersion}`}
      icon={t("icon_system_update_alt", "system_update_alt")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[55vw] max-w-5xl"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      noPadding={true}
      noScroll={true}
      panelClass="!border-l-[color-mix(in_srgb,var(--text)_15%,transparent)]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            onClick={handleRefreshReleaseData}
            disabled={isSyncing}
            tooltip={t("release_notes_sync_github_btn", "Sync from Repo / GitHub")}
            icon={t("icon_sync", "sync")}
            className={isSyncing ? "animate-spin" : ""}
          />
          <PanelHeaderButton
            onClick={handleInstallUpdate}
            disabled={isInstalling}
            variant="success"
            tooltip={installStatusText}
            icon={
              isInstalling
                ? t("icon_sync", "sync")
                : canAutoInstall
                  ? t("icon_system_update_alt", "system_update_alt")
                  : t("icon_download", "download")
            }
            className={isInstalling ? "animate-spin" : ""}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col relative">
        {activeView === "post" && activePostRecord.imageUrl && (
          <div className="w-full h-56 sm:h-72 relative shrink-0 overflow-hidden">
            <img
              src={activePostRecord.imageUrl}
              alt={activeTitle}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent" />
          </div>
        )}

        <div className="px-4 sm:px-8 md:px-10 pb-12 pt-6 gap-4 flex flex-col flex-1 relative z-20 min-w-0">
          {/* 3-Column View Switcher Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_menu_book", "menu_book")}
              value={t("btn_post", "Post")}
              label={t("btn_view", "View")}
              colorClass="text-[var(--accent)]"
              isActive={activeView === "post"}
              onClick={() => setActiveView("post")}
              tooltipTitle={t("release_notes_tab_blog", "Community Blog")}
              tooltipSubtitle={t(
                "release_notes_tile_post_desc",
                "Read the formatted community dispatch post for this release.",
              )}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_terminal", "terminal")}
              value={t("release_notes_tile_changelog", "Changelog")}
              label={t("btn_view", "View")}
              colorClass="text-[var(--accent)]"
              isActive={activeView === "changelog"}
              onClick={() => setActiveView("changelog")}
              tooltipTitle={t("release_notes_tab_changelog", "Technical Log")}
              tooltipSubtitle={t(
                "release_notes_tile_changelog_desc",
                "Inspect the full technical commit and architecture changelog.",
              )}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_open_in_new", "open_in_new")}
              value={t("release_notes_tile_github", "On GitHub")}
              label={t("btn_view", "View")}
              colorClass="text-[var(--text)]"
              isActive={false}
              onClick={() => handleOpenUrl(activeGitHubUrl)}
              tooltipTitle={t("update_panel_view_github", "View on GitHub")}
              tooltipSubtitle={activeGitHubUrl}
            />
          </div>

          <SidePanelHeroCard
            icon={t("icon_system_update_alt", "system_update_alt")}
            overline={`${t("author_sanctuary_team", "Sanctuary Foundry")} • ${t("release_notes_author_subtitle", "Official Release Dispatch")}`}
            title={activeTitle}
            description={activePostRecord.summary}
            badge={activeChannelBadge}
            badgeIcon={
              isDevUpdate
                ? t("icon_bolt", "bolt")
                : t("icon_verified", "verified")
            }
            variant={isDevUpdate ? "warning" : "success"}
          >
            {/* 2-Column Release Telemetry StatBox Grid */}
            <div className="grid grid-cols-2 gap-3 w-full">
              <StatBox
                icon={t("icon_calendar_today", "calendar_today")}
                iconColorClass="text-[var(--accent)]"
                label={t("release_notes_meta_release_date", "Release Date")}
                value={resolvedDateStr}
                tooltipSubtitle={resolvedDateStr}
              />
              <StatBox
                icon={t("icon_tag", "tag")}
                iconColorClass="text-[var(--accent)]"
                label={t("release_notes_meta_version", "Version Number")}
                value={`v${cleanTargetVersion}`}
                tooltipSubtitle={`v${cleanTargetVersion}`}
              />
              <StatBox
                icon={
                  isDevUpdate
                    ? t("icon_bolt", "bolt")
                    : t("icon_verified", "verified")
                }
                iconColorClass={
                  isDevUpdate ? "text-[var(--warning)]" : "text-[var(--success)]"
                }
                label={t("release_notes_meta_channel", "Channel")}
                value={activeChannelShort}
                tooltipSubtitle={activeChannelBadge}
              />
              <StatBox
                icon={t("icon_devices", "devices")}
                iconColorClass="text-[var(--accent)]"
                label={t("release_notes_meta_platform", "Platform")}
                value={activePlatformStr}
                tooltipSubtitle={activePlatformStr}
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl glass-surface flex items-center justify-center shrink-0 border text-[var(--accent)]"
                  style={{
                    borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
                  }}
                >
                  <span className="material-symbols-outlined !text-[20px]">
                    {t("icon_memory", "memory")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black capitalize tracking-tight text-[var(--text)] leading-tight">
                      {t("author_sanctuary_team", "Sanctuary Foundry")}
                    </span>
                    <span className="relative inline-flex items-center cursor-default">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_verified", "verified")}
                      </span>
                      <HoverTooltip
                        title={t("verified", "Verified")}
                        icon={t("icon_verified", "verified")}
                        variant="default"
                      />
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[var(--subtext)] opacity-85">
                    {t("release_notes_author_subtitle", "Official Release Dispatch")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleInstallUpdate}
                disabled={isInstalling}
                className="glass-panel before:!hidden rounded-2xl px-6 py-3 flex items-center justify-center gap-3 border !border-[color-mix(in_srgb,var(--success)_55%,rgba(var(--text-rgb),0.25))] hover:!border-[var(--success)] hover:brightness-110 transition-all duration-300 active:scale-[0.99] disabled:pointer-events-none shrink-0 cursor-pointer relative overflow-hidden group"
              >
                <div
                  className="absolute inset-0 rounded-[inherit] pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--success) 18%, rgba(var(--text-rgb, 255, 255, 255), 0.08)) 0%, color-mix(in srgb, var(--success) 4%, transparent) 100%)",
                  }}
                />
                {isInstalling && downloadProgress !== null && (
                  <div
                    className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-200"
                    style={{
                      width: `${downloadProgress}%`,
                      background:
                        "linear-gradient(90deg, color-mix(in srgb, var(--success) 28%, transparent) 0%, color-mix(in srgb, var(--success) 14%, transparent) 100%)",
                    }}
                  />
                )}
                <span
                  className={`material-symbols-outlined !text-[20px] text-[var(--success)] relative z-10 transition-transform duration-300 group-hover:scale-110 ${
                    isInstalling ? "animate-spin" : ""
                  }`}
                >
                  {isInstalling
                    ? t("icon_sync", "sync")
                    : canAutoInstall
                      ? t("icon_system_update_alt", "system_update_alt")
                      : t("icon_download", "download")}
                </span>
                <span className="text-sm font-black tracking-tight text-[var(--text)] relative z-10">
                  {installStatusText}
                </span>
              </button>
            </div>
          </SidePanelHeroCard>

          {/* Structured Card-Based Release Notes Body */}
          {activeMarkdownContent ? (
            <StructuredReleaseNotesView content={activeMarkdownContent} />
          ) : (
            <UniversalGroup
              title={activeTitle}
              icon={t("icon_menu_book", "menu_book")}
            >
              <div className="text-center py-12 opacity-50 font-bold capitalize text-[10px] tracking-widest flex flex-col items-center gap-2">
                <span className="material-symbols-outlined !text-[24px]">
                  {t("icon_visibility_off", "visibility_off")}
                </span>
                {t("update_panel_no_notes", "No Release Notes Provided")}
              </div>
            </UniversalGroup>
          )}

          {activeView === "post" && activePostRecord.codeSnippet && (
            <UniversalGroup
              title={t("release_notes_tab_changelog", "Technical Log")}
              icon={t("icon_terminal", "terminal")}
            >
              <pre className="w-full glass-surface rounded-2xl p-5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] overflow-x-auto custom-scrollbar">
                <code>{activePostRecord.codeSnippet}</code>
              </pre>
            </UniversalGroup>
          )}

          {activeView === "post" && activePostRecord.pollData && (
            <DispatchPollViewer
              post={{
                id:
                  activePostRecord.id ||
                  `release-post-${isDevUpdate ? "dev" : "stable"}`,
                poll_data: activePostRecord.pollData,
                _sourceTable: "keeper_system_broadcasts",
              }}
              userId={session?.user?.id || null}
            />
          )}
        </div>
      </div>
    </SidePanel>
  );
}
