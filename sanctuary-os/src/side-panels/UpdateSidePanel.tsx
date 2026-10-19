import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  HoverTooltip,
  handleOpenUrl,
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
  DEFAULT_KEEPERS_PIPELINE_CONFIG,
  KeepersPipelineConfig,
} from "../utils/supporterManager";
import {
  KeepersReleasePostRecord,
  LEGACY_BLOG_BROADCAST_TITLE,
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
      fetch(
        `https://api.github.com/repos/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tags/${rawTag}`
      )
        .then((res) =>
          res.ok
            ? res
            : fetch(
                `https://api.github.com/repos/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tags/${rawTag.toLowerCase()}`
              )
        )
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.body) {
            setLiveReleaseNotes(data.body);
          }
        })
        .catch((err) => console.error("Failed to fetch live release notes:", err));
    }
  }, [updatePayload, isUpdatePanelOpen]);

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
    setDownloadProgress(null);
    setStatus(t("status_downloading_update", "Downloading Update..."));
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await updatePayload.downloadAndInstall((event: any) => {
        if (event?.event === "Started" && event?.data?.contentLength) {
          totalBytes = Number(event.data.contentLength) || 0;
          setDownloadProgress(0);
        } else if (event?.event === "Progress" && event?.data?.chunkLength) {
          downloadedBytes += Number(event.data.chunkLength) || 0;
          if (totalBytes > 0) {
            setDownloadProgress(
              Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
            );
          }
        } else if (event?.event === "Finished") {
          setDownloadProgress(100);
        }
      });
      if (updatePayload.isExternalDownload) {
        setIsInstalling(false);
        setDownloadProgress(null);
        setIsUpdatePanelOpen(false);
        return;
      }
      setStatus(t("status_restarting", "Restarting Sanctuary OS..."));
      await relaunch();
    } catch (e) {
      setStatus(`${t("update_panel_failed_prefix", "Update Failed:")} ${e}`);
      setIsInstalling(false);
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
  const cleanInstalledVersion = String(packageJson.version || "0.5.8")
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

  const stableGitHubChangelog = pipelineConfig.stable_release_notes?.trim()
    ? pipelineConfig.stable_release_notes.trim()
    : bundledNerdChangelog;

  const devGitHubChangelog = pipelineConfig.dev_build_notes?.trim()
    ? pipelineConfig.dev_build_notes.trim()
    : seedChangelog.markdown || bundledNerdChangelog;

  const resolvedChangelogMarkdown = (() => {
    const placeholderStr = "See the assets to download this version and install.";
    const simStr = "This is a simulated update payload for UI testing.";
    if (liveReleaseNotes && liveReleaseNotes.trim() && liveReleaseNotes.trim() !== placeholderStr) {
      return liveReleaseNotes.trim();
    }
    if (
      updatePayload.body &&
      String(updatePayload.body).trim() &&
      String(updatePayload.body).trim() !== placeholderStr &&
      String(updatePayload.body).trim() !== simStr
    ) {
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

  const renderReleaseInfoPanel = (
    dateVal: string,
    versionVal: string,
    isDevChan: boolean,
    platformVal: string
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full my-2">
      <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-3.5 relative hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors cursor-default">
        <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
          <span className="material-symbols-outlined !text-[20px]">
            {t("icon_calendar_today", "calendar_today")}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
            {t("release_notes_meta_release_date", "Release Date")}
          </span>
          <span className="text-xs font-black tracking-wide text-[var(--text)] truncate mt-0.5">
            {dateVal}
          </span>
        </div>
        <HoverTooltip
          title={t("release_notes_meta_release_date", "Release Date")}
          subtitle={dateVal}
          icon={t("icon_calendar_today", "calendar_today")}
          variant="info"
        />
      </div>

      <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-3.5 relative hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors cursor-default">
        <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
          <span className="material-symbols-outlined !text-[20px]">
            {t("icon_tag", "tag")}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
            {t("release_notes_meta_version", "Version Number")}
          </span>
          <span className="text-xs font-mono font-black tracking-wide text-[var(--accent)] truncate mt-0.5">
            v{versionVal.replace(/^v/i, "")}
          </span>
        </div>
        <HoverTooltip
          title={t("release_notes_meta_version", "Version Number")}
          subtitle={`v${versionVal.replace(/^v/i, "")}`}
          icon={t("icon_tag", "tag")}
          variant="accent"
        />
      </div>

      <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-3.5 relative hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors cursor-default">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            isDevChan
              ? "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)]"
              : "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]"
          }`}
        >
          <span className="material-symbols-outlined !text-[20px]">
            {isDevChan ? t("icon_bolt", "bolt") : t("icon_verified", "verified")}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
            {t("release_notes_meta_channel", "Channel")}
          </span>
          <span
            className={`text-xs font-black uppercase tracking-widest truncate mt-0.5 ${
              isDevChan ? "text-[var(--success)]" : "text-[var(--text)]"
            }`}
          >
            {isDevChan
              ? t("release_notes_meta_channel_dev", "Dev")
              : t("release_notes_meta_channel_public", "Public")}
          </span>
        </div>
        <HoverTooltip
          title={t("release_notes_meta_channel", "Channel")}
          subtitle={
            isDevChan
              ? t("release_notes_dev_channel_badge", "Daily Dev Build")
              : t("release_notes_stable_channel_badge", "Stable Release")
          }
          icon={isDevChan ? t("icon_bolt", "bolt") : t("icon_verified", "verified")}
          variant={isDevChan ? "success" : "accent"}
        />
      </div>

      <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-3.5 relative hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors cursor-default">
        <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
          <span className="material-symbols-outlined !text-[20px]">
            {t("icon_devices", "devices")}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60">
            {t("release_notes_meta_platform", "Platform")}
          </span>
          <span className="text-xs font-black tracking-wide text-[var(--text)] truncate mt-0.5">
            {platformVal}
          </span>
        </div>
        <HoverTooltip
          title={t("release_notes_meta_platform", "Platform")}
          subtitle={platformVal}
          icon={t("icon_devices", "devices")}
          variant="info"
        />
      </div>
    </div>
  );

  return (
    <SidePanel
      isOpen={isUpdatePanelOpen}
      onClose={() => setIsUpdatePanelOpen(false)}
      title={t("update_panel_title", "System Update")}
      subtitle={`${activeChannelBadge} • v${cleanTargetVersion}`}
      icon={t("icon_system_update_alt", "system_update_alt")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[55vw] max-w-5xl"
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
            icon={
              isInstalling
                ? t("icon_sync", "sync")
                : t("icon_system_update_alt", "system_update_alt")
            }
            tooltip={
              isInstalling
                ? t("update_panel_installing", "Installing Update...")
                : t("update_panel_install", "Install")
            }
            variant="accent"
            disabled={isInstalling}
            className={isInstalling ? "animate-spin" : ""}
            onClick={handleInstallUpdate}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col relative">
        {activeView === "post" && activePostRecord.imageUrl && (
          <div className="w-full h-56 sm:h-72 relative shrink-0 overflow-hidden border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <img
              src={activePostRecord.imageUrl}
              alt={activeTitle}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent" />
          </div>
        )}

        <div className="px-4 sm:px-8 md:px-12 pb-12 pt-8 gap-6 flex flex-col flex-1 relative z-20 min-w-0">
          {isInstalling && (
            <div className="w-full h-1.5 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] overflow-hidden relative z-10">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300 rounded-full shadow-[0_0_12px_var(--accent)]"
                style={{
                  width:
                    downloadProgress !== null ? `${Math.max(8, downloadProgress)}%` : "100%",
                }}
              />
            </div>
          )}

          {/* Landing Page Style StatTile Navigation: View -> Post / Changelog / On GitHub */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={
                <span className="material-symbols-outlined">
                  {t("icon_menu_book", "menu_book")}
                </span>
              }
              label={t("release_notes_tile_view", "View")}
              number={t("release_notes_tile_post", "Post")}
              isActive={activeView === "post"}
              onClick={() => setActiveView("post")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={
                <span className="material-symbols-outlined">
                  {t("icon_terminal", "terminal")}
                </span>
              }
              label={t("release_notes_tile_view", "View")}
              number={t("release_notes_tile_changelog", "Changelog")}
              isActive={activeView === "changelog"}
              onClick={() => setActiveView("changelog")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={
                <span className="material-symbols-outlined">
                  {t("icon_open_in_new", "open_in_new")}
                </span>
              }
              label={t("release_notes_tile_view", "View")}
              number={t("release_notes_tile_on_github", "On GitHub")}
              isActive={false}
              onClick={() => handleOpenUrl(activeGitHubUrl)}
            />
          </div>

          {/* Comm-Link Style Post Header & 2x2 Frosted-Glass Release Info Panel */}
          <div className="flex flex-col gap-4 mt-2 min-w-0">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter drop-shadow-sm leading-tight text-[var(--text)] break-words">
              {activeTitle}
            </h1>

            <div className="flex items-center gap-4 mt-1 mb-0 relative z-20">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg shrink-0 overflow-hidden glass-surface border border-[color-mix(in_srgb,var(--text)_20%,transparent)] backdrop-blur-md">
                <span className="material-symbols-outlined !text-[24px] text-[var(--text)] drop-shadow-md">
                  {t("icon_memory", "memory")}
                </span>
              </div>

              <div className="flex flex-col z-20">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-black capitalize tracking-widest text-[var(--text)]">
                    {t("author_sanctuary_team", "Sanctuary Foundry")}
                  </span>
                  <span className="relative inline-flex items-center cursor-default">
                    <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                      {t("icon_verified", "verified")}
                    </span>
                    <HoverTooltip
                      title={t("verified", "Verified")}
                      icon={t("icon_verified", "verified")}
                      variant="accent"
                    />
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[var(--subtext)] font-mono tracking-widest opacity-80 flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[12px] opacity-60">
                      {t("icon_schedule", "schedule")}
                    </span>
                    {resolvedDateStr}
                  </span>
                </div>
              </div>
            </div>

            {renderReleaseInfoPanel(
              resolvedDateStr,
              cleanTargetVersion,
              isDevUpdate,
              activePlatformStr
            )}

            <div className="flex-1 flex flex-col mt-2 gap-6 min-w-0">
              {activeMarkdownContent ? (
                <div className="markdown-body text-[var(--text)] opacity-90 leading-relaxed text-base sm:text-lg flex-1 min-w-0 break-words overflow-x-hidden [&_pre]:overflow-x-auto [&_code]:break-words">
                  <MarkdownRenderer content={activeMarkdownContent} />
                </div>
              ) : (
                <div className="text-center py-12 opacity-50 font-bold capitalize text-[10px] tracking-widest flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined !text-[24px]">
                    {t("icon_visibility_off", "visibility_off")}
                  </span>
                  {t("update_panel_no_notes", "No Release Notes Provided")}
                </div>
              )}

              {activeView === "post" && activePostRecord.codeSnippet && (
                <pre className="w-full glass-surface rounded-2xl p-5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] overflow-x-auto custom-scrollbar">
                  <code>{activePostRecord.codeSnippet}</code>
                </pre>
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
        </div>
      </div>
    </SidePanel>
  );
}
