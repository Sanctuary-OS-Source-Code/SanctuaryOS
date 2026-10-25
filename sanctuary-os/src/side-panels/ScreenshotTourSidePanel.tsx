import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { useStore } from "../store";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  SidePanelHeroCard,
  SidePanelPillToggle,
  UniversalGroup,
  StatBox,
} from "../shared";
import { notifyOS } from "../utils/notificationHelper";

export interface TourTargetStep {
  id: string;
  view: string;
  subTabKey?:
    | "masonActiveTab"
    | "architectActiveTab"
    | "oversightActiveTab"
    | "wayfinderActiveTab"
    | "keepersActiveTab";
  subTabValue?: string;
  fileSlug: string;
  labelKey: string;
  labelFallback: string;
  iconKey: string;
  iconFallback: string;
  isSubTab?: boolean;
}

const CORE_TOUR_STEPS: TourTargetStep[] = [
  {
    id: "dashboard",
    view: "dashboard",
    fileSlug: "01_Command_Center",
    labelKey: "center_title",
    labelFallback: "Command Center",
    iconKey: "icon_desktop_windows",
    iconFallback: "desktop_windows",
  },
  {
    id: "vault",
    view: "vault",
    fileSlug: "02_Vault",
    labelKey: "vault_title",
    labelFallback: "Your {Vault}",
    iconKey: "icon_account_balance",
    iconFallback: "account_balance",
  },
  {
    id: "nexus",
    view: "nexus",
    fileSlug: "03_The_Nexus",
    labelKey: "market_title",
    labelFallback: "The Nexus",
    iconKey: "icon_hub",
    iconFallback: "hub",
  },
  {
    id: "playsets",
    view: "playsets",
    fileSlug: "04_Blueprints",
    labelKey: "playsets_title",
    labelFallback: "{Blueprints}",
    iconKey: "icon_map",
    iconFallback: "map",
  },
  {
    id: "GlobalFeed",
    view: "GlobalFeed",
    fileSlug: "05_Comm_Link_Feed",
    labelKey: "feed_title",
    labelFallback: "Comm-Link Feed",
    iconKey: "icon_satellite_alt",
    iconFallback: "satellite_alt",
  },
  {
    id: "DbpfScout",
    view: "DbpfScout",
    fileSlug: "06_Conflict_Radar",
    labelKey: "radar_title",
    labelFallback: "Conflict Radar",
    iconKey: "icon_track_changes",
    iconFallback: "track_changes",
  },
  {
    id: "lab",
    view: "lab",
    fileSlug: "07_Homestead_Lab",
    labelKey: "term_lab",
    labelFallback: "Homestead {Lab}",
    iconKey: "icon_science",
    iconFallback: "science",
  },
  {
    id: "CitizensWorkbench",
    view: "CitizensWorkbench",
    fileSlug: "08_Workbench",
    labelKey: "title_sidebar",
    labelFallback: "Workbench",
    iconKey: "icon_design_services",
    iconFallback: "design_services",
  },
  {
    id: "backups",
    view: "backups",
    fileSlug: "09_Time_Capsule",
    labelKey: "term_backups",
    labelFallback: "{Backups}",
    iconKey: "icon_history",
    iconFallback: "history",
  },
  {
    id: "MasonHub",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "command_center",
    fileSlug: "10_Mason_Workshop",
    labelKey: "sidebar_mason_hub",
    labelFallback: "{Mason} Workshop",
    iconKey: "icon_construction",
    iconFallback: "construction",
  },
  {
    id: "ArchitectHub",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "command_center",
    fileSlug: "11_Architect_Console",
    labelKey: "sidebar_architect_hub",
    labelFallback: "Architect Console",
    iconKey: "icon_analytics",
    iconFallback: "analytics",
  },
  {
    id: "Oversight",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "command_center",
    fileSlug: "12_Oversight_Command",
    labelKey: "stat_oversight",
    labelFallback: "Oversight Command",
    iconKey: "icon_security",
    iconFallback: "security",
  },
  {
    id: "WayfinderHub",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "command_center",
    fileSlug: "13_Wayfinder_Operations",
    labelKey: "sidebar_wayfinder_tools",
    labelFallback: "Wayfinder Operations",
    iconKey: "icon_terminal",
    iconFallback: "terminal",
  },
  {
    id: "KeepersCore",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "command_center",
    fileSlug: "14_Keepers_Core",
    labelKey: "sidebar_keepers_core",
    labelFallback: "Keepers Core",
    iconKey: "icon_admin_panel_settings",
    iconFallback: "admin_panel_settings",
  },
  {
    id: "settings",
    view: "settings",
    fileSlug: "15_System_Preferences",
    labelKey: "term_settings",
    labelFallback: "{Settings}",
    iconKey: "icon_settings",
    iconFallback: "settings",
  },
];

const HUB_SUBTAB_STEPS: TourTargetStep[] = [
  {
    id: "MasonHub_sandbox",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "sandbox",
    fileSlug: "10a_Mason_Artifacts",
    labelKey: "term_mods",
    labelFallback: "{Mason} {Mods}",
    iconKey: "icon_deployed_code",
    iconFallback: "deployed_code",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_registry",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "registry",
    fileSlug: "11a_Architect_Registry",
    labelKey: "term_mods",
    labelFallback: "Architect Registry",
    iconKey: "icon_inventory_2",
    iconFallback: "inventory_2",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_lab",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "lab",
    fileSlug: "11b_Architect_Diagnostics",
    labelKey: "tab_diagnostics",
    labelFallback: "Architect Diagnostics",
    iconKey: "icon_monitor_heart",
    iconFallback: "monitor_heart",
    isSubTab: true,
  },
  {
    id: "Oversight_identities",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "identities",
    fileSlug: "12a_Oversight_Identities",
    labelKey: "tab_identities",
    labelFallback: "Oversight Identities",
    iconKey: "icon_group",
    iconFallback: "group",
    isSubTab: true,
  },
  {
    id: "Oversight_malware",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "malware_oversight",
    fileSlug: "12b_Oversight_Malware",
    labelKey: "rating_malware",
    labelFallback: "Oversight Malware",
    iconKey: "icon_coronavirus",
    iconFallback: "coronavirus",
    isSubTab: true,
  },
  {
    id: "Wayfinder_ide",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "ide",
    fileSlug: "13a_Wayfinder_Spoke_Control",
    labelKey: "wf_tab_spoke_control",
    labelFallback: "Spoke Control",
    iconKey: "icon_data_object",
    iconFallback: "data_object",
    isSubTab: true,
  },
  {
    id: "Wayfinder_chameleons",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "chameleons",
    fileSlug: "13b_Wayfinder_Aesthetics",
    labelKey: "wf_tab_spoke_aesthetics",
    labelFallback: "Spoke Aesthetics",
    iconKey: "icon_palette",
    iconFallback: "palette",
    isSubTab: true,
  },
  {
    id: "Keepers_spokes",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "active_games",
    fileSlug: "14a_Keepers_Partner_Spokes",
    labelKey: "keepers_tab_partner_spokes",
    labelFallback: "Partner Spokes",
    iconKey: "icon_dns",
    iconFallback: "dns",
    isSubTab: true,
  },
  {
    id: "Keepers_chameleons",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "chameleons",
    fileSlug: "14b_Keepers_Core_Aesthetics",
    labelKey: "keepers_tab_core_aesthetics",
    labelFallback: "Core Aesthetics",
    iconKey: "icon_palette",
    iconFallback: "palette",
    isSubTab: true,
  },
];

export function openSanctuaryScreenshotTour() {
  window.dispatchEvent(new CustomEvent("sanctuary-open-screenshot-tour"));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

export function ScreenshotTourSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const {
    activeThemeId,
    setActiveThemeId,
    CORE_THEMES,
    customThemes,
    devThemes,
    gameThemes,
  } = useTheme();
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const allThemes = useMemo(() => {
    const merged: Record<string, any> = {
      ...(CORE_THEMES || {}),
      ...(gameThemes || {}),
      ...(customThemes || {}),
      ...(devThemes || {}),
    };
    return Object.entries(merged).map(([id, data]) => ({
      id,
      name: data?.name || id,
      bg: data?.bg || "#000000",
      accent: data?.accent || "#38bdf8",
    }));
  }, [CORE_THEMES, gameThemes, customThemes, devThemes]);

  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>(() => [
    activeThemeId || "architect",
  ]);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>(() =>
    CORE_TOUR_STEPS.map((s) => s.id)
  );
  const [includeSubTabs, setIncludeSubTabs] = useState(false);
  const [settleDelayMs, setSettleDelayMs] = useState<number>(750);
  const [outputDir, setOutputDir] = useState<string>("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastSavedCount, setLastSavedCount] = useState<number>(0);
  const abortRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      invoke<string>("get_screenshots_root_dir")
        .then((dir) => setOutputDir(dir))
        .catch(() => {});
    }
  }, [isOpen]);

  // Global Esc listener to abort an in-progress tour
  useEffect(() => {
    if (!isCapturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        abortRef.current = true;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCapturing]);

  const activeSteps = useMemo(() => {
    const base = CORE_TOUR_STEPS.filter((s) => selectedStepIds.includes(s.id));
    if (!includeSubTabs) return base;
    return [...base, ...HUB_SUBTAB_STEPS];
  }, [selectedStepIds, includeSubTabs]);

  const totalPlannedShots = selectedThemeIds.length * activeSteps.length;

  const toggleTheme = (id: string) => {
    setSelectedThemeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleStep = (id: string) => {
    setSelectedStepIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleOpenFolder = async () => {
    try {
      const dir = await invoke<string>("open_screenshots_dir");
      if (dir) setOutputDir(dir);
    } catch (err) {
      console.error("Failed to open screenshots folder:", err);
    }
  };

  const handleSnapCurrentScreen = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      await waitForNextPaint();
      await sleep(320);
      window.dispatchEvent(new Event("resize"));
      await waitForNextPaint();
      await sleep(160);

      const themeObj = allThemes.find((th) => th.id === activeThemeId);
      const themeFolder = themeObj?.name || activeThemeId || "Sanctuary";
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const fileSlug = `${view || "Screen"}_${timestamp}`;
      const savedPath = await invoke<string>("capture_window_screenshot", {
        themeFolder,
        fileName: fileSlug,
      });
      setLastSavedCount((c) => c + 1);
      notifyOS(
        t("screenshot_tour_title", "Screenshot Tour"),
        `${t("screenshot_tour_snapped_toast", "Saved Screenshot")}: ${savedPath}`,
        "SYSTEM"
      ).catch(() => {});
    } catch (err) {
      console.error("Failed to snap screen:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  const applyStepNavigation = (step: TourTargetStep) => {
    const storeState = useStore.getState();
    if (step.subTabKey && step.subTabValue) {
      if (step.subTabKey === "masonActiveTab" && storeState.setMasonActiveTab) {
        storeState.setMasonActiveTab(step.subTabValue);
      } else if (
        step.subTabKey === "architectActiveTab" &&
        storeState.setArchitectActiveTab
      ) {
        storeState.setArchitectActiveTab(step.subTabValue);
      } else if (
        step.subTabKey === "oversightActiveTab" &&
        storeState.setOversightActiveTab
      ) {
        storeState.setOversightActiveTab(step.subTabValue);
      } else if (
        step.subTabKey === "wayfinderActiveTab" &&
        storeState.setWayfinderActiveTab
      ) {
        storeState.setWayfinderActiveTab(step.subTabValue);
      } else if (
        step.subTabKey === "keepersActiveTab" &&
        storeState.setKeepersActiveTab
      ) {
        storeState.setKeepersActiveTab(step.subTabValue);
      }
    }
    setView(step.view);
  };

  const handleRunTour = async () => {
    if (isCapturing || selectedThemeIds.length === 0 || activeSteps.length === 0)
      return;

    const originalThemeId = activeThemeId;
    const originalView = view;
    const storeSnap = useStore.getState();
    const origMasonTab = storeSnap.masonActiveTab;
    const origArchitectTab = storeSnap.architectActiveTab;
    const origOversightTab = storeSnap.oversightActiveTab;
    const origWayfinderTab = storeSnap.wayfinderActiveTab;
    const origKeepersTab = storeSnap.keepersActiveTab;

    abortRef.current = false;
    setIsCapturing(true);
    let capturedCount = 0;

    try {
      // Wait for SidePanel to unmount completely before starting captures
      await waitForNextPaint();
      await sleep(350);

      for (const themeId of selectedThemeIds) {
        if (abortRef.current) break;
        const themeObj = allThemes.find((th) => th.id === themeId);
        const themeFolder = themeObj?.name || themeId;

        setActiveThemeId(themeId);
        await waitForNextPaint();
        await sleep(Math.max(450, settleDelayMs));

        for (const step of activeSteps) {
          if (abortRef.current) break;
          applyStepNavigation(step);

          const mainScroll = document.getElementById("sanctuary-main-scroll");
          if (mainScroll) mainScroll.scrollTop = 0;

          await waitForNextPaint();
          await sleep(settleDelayMs);
          window.dispatchEvent(new Event("resize"));
          await waitForNextPaint();
          await sleep(180);

          try {
            await invoke<string>("capture_window_screenshot", {
              themeFolder,
              fileName: step.fileSlug,
            });
            capturedCount++;
          } catch (err) {
            console.error(`Failed screenshot for ${themeFolder}/${step.fileSlug}:`, err);
          }
        }
      }
    } finally {
      // Restore original state
      setActiveThemeId(originalThemeId);
      const restoreStore = useStore.getState();
      if (restoreStore.setMasonActiveTab && origMasonTab)
        restoreStore.setMasonActiveTab(origMasonTab);
      if (restoreStore.setArchitectActiveTab && origArchitectTab)
        restoreStore.setArchitectActiveTab(origArchitectTab);
      if (restoreStore.setOversightActiveTab && origOversightTab)
        restoreStore.setOversightActiveTab(origOversightTab);
      if (restoreStore.setWayfinderActiveTab && origWayfinderTab)
        restoreStore.setWayfinderActiveTab(origWayfinderTab);
      if (restoreStore.setKeepersActiveTab && origKeepersTab)
        restoreStore.setKeepersActiveTab(origKeepersTab);
      setView(originalView);

      await waitForNextPaint();
      await sleep(250);
      setLastSavedCount(capturedCount);
      setIsCapturing(false);

      if (capturedCount > 0) {
        notifyOS(
          t("screenshot_tour_title", "Screenshot Tour"),
          `${t("screenshot_tour_complete_toast", "Screenshot Tour Completed")} (${capturedCount})`,
          "SYSTEM"
        ).catch(() => {});
      }
    }
  };

  // Hide panel completely while capturing so it never appears in screenshots
  if (isCapturing) {
    return null;
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("screenshot_tour_title", "Screenshot Tour")}
      subtitle={t(
        "screenshot_tour_subtitle",
        "Automated Multi-Theme & Full-OS Capture"
      )}
      icon={t("icon_photo_camera", "photo_camera")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_folder_open", "folder_open")}
            tooltip={t("screenshot_tour_open_folder", "Open Folder")}
            onClick={handleOpenFolder}
          />
          <PanelHeaderButton
            icon={t("icon_add_a_photo", "add_a_photo")}
            tooltip={t("screenshot_tour_snap_current", "Snap Current Screen")}
            onClick={handleSnapCurrentScreen}
          />
          <PanelHeaderButton
            icon={t("icon_play_arrow", "play_arrow")}
            variant="accent"
            disabled={totalPlannedShots === 0}
            tooltip={t("screenshot_tour_run", "Run Screenshot Tour")}
            onClick={handleRunTour}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_photo_camera", "photo_camera")}
          overline={t("screenshot_tour_subtitle", "Automated Multi-Theme & Full-OS Capture")}
          title={t("screenshot_tour_title", "Screenshot Tour")}
          description={t(
            "screenshot_tour_desc",
            "Automatically step through selected themes and screens across Sanctuary OS and export lossless native PNG captures into organized folders."
          )}
          badge={`${totalPlannedShots}`}
          variant="accent"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
            <ActionButton
              variant="glass"
              icon={t("icon_add_a_photo", "add_a_photo")}
              label={t("screenshot_tour_snap_current", "Snap Current Screen")}
              onClick={handleSnapCurrentScreen}
              className="w-full justify-center"
            />
            <ActionButton
              variant="primary"
              icon={t("icon_play_arrow", "play_arrow")}
              label={`${t("screenshot_tour_run", "Run Screenshot Tour")} (${totalPlannedShots})`}
              disabled={totalPlannedShots === 0}
              onClick={handleRunTour}
              className="w-full justify-center"
            />
            <ActionButton
              variant="glass"
              icon={t("icon_folder_open", "folder_open")}
              label={t("screenshot_tour_open_folder", "Open Folder")}
              onClick={handleOpenFolder}
              className="w-full justify-center"
            />
          </div>
        </SidePanelHeroCard>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
          <StatBox
            label={t("screenshot_tour_themes", "Themes to Capture")}
            value={`${selectedThemeIds.length} / ${allThemes.length}`}
            icon={t("icon_palette", "palette")}
          />
          <StatBox
            label={t("screenshot_tour_screens", "Screens & Views")}
            value={`${activeSteps.length}`}
            icon={t("icon_desktop_windows", "desktop_windows")}
          />
          <StatBox
            label={t("screenshot_tour_total_shots", "Total Captures")}
            value={`${totalPlannedShots}${lastSavedCount > 0 ? ` (${lastSavedCount})` : ""}`}
            icon={t("icon_photo_library", "photo_library")}
          />
        </div>

        {outputDir && (
          <div className="glass-surface rounded-2xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80">
                {t("screenshot_tour_output_dir", "Output Directory")}
              </span>
              <span className="text-xs font-mono font-bold text-[var(--text)] truncate mt-0.5">
                {outputDir}
              </span>
            </div>
            <ActionButton
              variant="glass"
              icon={t("icon_folder_open", "folder_open")}
              label={t("screenshot_tour_open_folder", "Open Folder")}
              onClick={handleOpenFolder}
            />
          </div>
        )}

        {/* THEMES SELECTION */}
        <UniversalGroup
          title={t("screenshot_tour_themes", "Themes to Capture")}
          icon={t("icon_palette", "palette")}
          count={`${selectedThemeIds.length}`}
          actions={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedThemeIds([activeThemeId])}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("screenshot_tour_current_only", "Current Only")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedThemeIds(allThemes.map((th) => th.id))}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("all", "All")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedThemeIds([])}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("clear", "Clear")}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {allThemes.map((th) => {
              const isSelected = selectedThemeIds.includes(th.id);
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => toggleTheme(th.id)}
                  className={`glass-surface rounded-xl px-3 py-2.5 border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-70 hover:opacity-100"
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-md border border-white/25 shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${th.bg} 45%, ${th.accent} 100%)`,
                    }}
                  />
                  <span className="text-xs font-black tracking-tight truncate flex-1">
                    {th.name}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[16px] shrink-0 ${
                      isSelected ? "text-[var(--accent)]" : "opacity-30"
                    }`}
                  >
                    {isSelected
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                  </span>
                </button>
              );
            })}
          </div>
        </UniversalGroup>

        {/* SCREENS & VIEWS SELECTION */}
        <UniversalGroup
          title={t("screenshot_tour_screens", "Screens & Views")}
          icon={t("icon_desktop_windows", "desktop_windows")}
          count={`${activeSteps.length}`}
          actions={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setSelectedStepIds(CORE_TOUR_STEPS.map((s) => s.id))
                }
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("all", "All")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedStepIds([])}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("clear", "Clear")}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CORE_TOUR_STEPS.map((step) => {
              const isSelected = selectedStepIds.includes(step.id);
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => toggleStep(step.id)}
                  className={`glass-surface rounded-xl px-3 py-2.5 border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-70 hover:opacity-100"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined !text-[17px] shrink-0 ${
                      isSelected ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                    }`}
                  >
                    {t(step.iconKey, step.iconFallback)}
                  </span>
                  <span className="text-xs font-black tracking-tight truncate flex-1">
                    {t(step.labelKey, step.labelFallback)}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[16px] shrink-0 ${
                      isSelected ? "text-[var(--accent)]" : "opacity-30"
                    }`}
                  >
                    {isSelected
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <SidePanelPillToggle
              checked={includeSubTabs}
              onChange={setIncludeSubTabs}
              icon={t("icon_account_tree", "account_tree")}
              label={t("screenshot_tour_include_subtabs", "Include Hub Sub-Tabs")}
              variant="accent"
            />
            <div className="glass-surface rounded-xl px-3.5 py-2 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)]">
                {t("screenshot_tour_settle_delay", "Render Settle Delay")}
              </span>
              <div className="flex items-center gap-1">
                {[500, 750, 1100].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => setSettleDelayMs(ms)}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-black transition-all cursor-pointer ${
                      settleDelayMs === ms
                        ? "bg-transparent border-[var(--accent)] text-[var(--accent)]"
                        : "bg-transparent border-transparent text-[var(--subtext)] hover:text-[var(--text)]"
                    }`}
                  >
                    {`${ms}ms`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}

