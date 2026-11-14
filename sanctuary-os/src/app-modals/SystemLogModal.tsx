import React, { useState, useMemo } from "react";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  SidePanelFilterBar,
  ActionPill,
  ActionButton,
  HoverTooltip,
  EmptyState,
  VAULT_CHIP_CLASS,
} from "../shared";
import { openSanctuaryContextMenu } from "../ContextMenu";
import { useVirtualWindow } from "../hooks/useVirtualWindow";

type LogFilterGroup = "all" | "vault" | "nexus" | "alerts";
type LogSeverityFilter = "all" | "success" | "warning" | "error";
type LogSortOrder = "newest" | "oldest";

const KNOWN_ICON_PREFIXES = new Set([
  "check_circle",
  "warning",
  "error",
  "info",
  "sync",
  "flight_takeoff",
  "radar",
  "terminal",
  "bug_report",
  "extension",
  "block",
  "update",
  "done",
  "download",
  "delete",
  "close",
  "add",
  "verified",
  "new_releases",
  "local_fire_department",
  "health_and_safety",
  "folder_open",
  "inventory_2",
  "account_tree",
  "priority_high",
  "notifications_active",
  "palette",
  "translate",
  "map",
  "shield_lock",
  "save",
  "cloud_done",
]);

type CachedUnsavedFileItem = {
  name: string;
  path: string;
  source: "cw" | "ide" | "masonhub" | "wayfinder";
  rawContent?: string;
  originalContent?: string;
};

function resolveAllCachedUnsavedFiles(): CachedUnsavedFileItem[] {
  const results: CachedUnsavedFileItem[] = [];
  const seen = new Set<string>();
  const addFile = (
    name: string,
    path?: string,
    source: "cw" | "ide" | "masonhub" | "wayfinder" = "cw",
    rawContent?: string,
    originalContent?: string
  ) => {
    const cleanName = String(name || "").trim();
    if (!cleanName) return;
    const key = cleanName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      name: cleanName,
      path: path || cleanName,
      source,
      rawContent,
      originalContent,
    });
  };

  const state = useStore.getState();
  const wsId = state.activeWorkspaceId || "default";

  try {
    const cwMem = state.cwUnsavedEdits || {};
    Object.keys(cwMem).forEach((k) => {
      if (cwMem[k] && Object.keys(cwMem[k]).length > 0) {
        const name = k.split(/[\\/]/).pop();
        if (name) addFile(name, k, "cw", cwMem[k]);
      }
    });

    for (const storageKey of [
      `sanctuary_${wsId}_cw_unsaved_edits`,
      "sanctuary_cw_unsaved_edits",
    ]) {
      const cwRaw = localStorage.getItem(storageKey);
      if (cwRaw) {
        const parsed = JSON.parse(cwRaw);
        if (parsed && typeof parsed === "object") {
          Object.keys(parsed).forEach((k) => {
            if (parsed[k] && Object.keys(parsed[k]).length > 0) {
              const name = k.split(/[\\/]/).pop();
              if (name) {
                addFile(
                  name,
                  k,
                  "cw",
                  typeof parsed[k] === "string"
                    ? parsed[k]
                    : JSON.stringify(parsed[k], null, 2)
                );
              }
            }
          });
        }
      }
    }
  } catch {}

  try {
    (state.ideOpenFiles || []).forEach((f: any) => {
      if (f && f.content !== f.originalContent && f.name) {
        addFile(f.name, f.path || f.name, "ide", f.content, f.originalContent);
      }
    });
    for (const storageKey of [
      `sanctuary_${wsId}_ide_open_files`,
      "sanctuary_ide_open_files",
    ]) {
      const ideRaw = localStorage.getItem(storageKey);
      if (ideRaw) {
        const parsed = JSON.parse(ideRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((f: any) => {
            if (f && f.content !== f.originalContent && f.name) {
              addFile(
                f.name,
                f.path || f.name,
                "ide",
                f.content,
                f.originalContent
              );
            }
          });
        }
      }
    }
  } catch {}

  try {
    for (const storageKey of [
      `sanctuary_${wsId}_mason_hub_drafts`,
      "sanctuary_mason_hub_drafts",
    ]) {
      const masonRaw = localStorage.getItem(storageKey);
      if (masonRaw) {
        const parsed = JSON.parse(masonRaw);
        if (parsed && typeof parsed === "object") {
          Object.keys(parsed).forEach((k) => {
            const name = `${parsed[k]?.title || `Draft ${k}`}.masonhub`;
            addFile(name, name, "masonhub");
          });
        }
      }
    }
  } catch {}

  try {
    for (const storageKey of [
      `sanctuary_${wsId}_wayfinder_drafts`,
      "sanctuary_wayfinder_drafts",
    ]) {
      const wfRaw = localStorage.getItem(storageKey);
      if (wfRaw) {
        const parsed = JSON.parse(wfRaw);
        if (parsed && typeof parsed === "object") {
          Object.keys(parsed).forEach((k) => {
            const name = `${parsed[k]?.title || `Draft ${k}`}.wayfinder`;
            addFile(name, name, "wayfinder");
          });
        }
      }
    }
  } catch {}

  return results;
}

function parseLogEntryPresentation(log: any, t: any) {
  const rawMessage = typeof log?.message === "string" ? log.message.trim() : "";
  const match = rawMessage.match(/^([a-z_0-9]+)\s+(.*)$/);

  let logIcon = "";
  let logText = rawMessage;

  if (
    match &&
    (KNOWN_ICON_PREFIXES.has(match[1]) || match[1].includes("_"))
  ) {
    logIcon = match[1].replace(/^icon_/, "");
    logText = match[2];
  }

  const lower = logText.toLowerCase();

  const category: string =
    log?.category ||
    (lower.includes("preview") ||
    lower.includes("chameleon") ||
    lower.includes("theme") ||
    lower.includes("lexicon") ||
    lower.includes("nexus") ||
    lower.includes("market")
      ? "nexus"
      : lower.includes("blueprint") ||
          lower.includes("playset") ||
          lower.includes("play set") ||
          lower.includes("deploy")
        ? "blueprint"
        : lower.includes("radar") ||
            lower.includes("conflict") ||
            lower.includes("scan")
          ? "radar"
          : lower.includes("quarantine") ||
              lower.includes("shelter") ||
              lower.includes("backup") ||
              lower.includes("time capsule") ||
              lower.includes("defcon") ||
              lower.includes("lockdown")
            ? "security"
            : lower.includes("cached changes") ||
                lower.includes("unsaved") ||
                lower.includes("workbench") ||
                lower.includes(".cfg") ||
                lower.includes(".ini") ||
                lower.includes(".json") ||
                lower.includes(".wayfinder") ||
                lower.includes(".masonhub")
              ? "workbench"
              : lower.includes("vault") ||
                  lower.includes("artifact") ||
                  lower.includes("mod") ||
                  lower.includes("package") ||
                  lower.includes("install")
                ? "vault"
                : "system");

  const isErr =
    log?.type === "error" ||
    logIcon === "error" ||
    logIcon === "bug_report" ||
    lower.includes("error") ||
    lower.includes("failed");
  const isWarn =
    !isErr &&
    (log?.type === "warning" ||
      logIcon === "warning" ||
      logIcon === "priority_high" ||
      lower.includes("warning") ||
      lower.includes("conflict") ||
      lower.includes("quarantine") ||
      lower.includes("lockdown"));
  const isSucc =
    !isErr &&
    !isWarn &&
    (log?.type === "success" ||
      logIcon === "check_circle" ||
      logIcon === "done" ||
      logIcon === "verified" ||
      lower.includes("restored") ||
      lower.includes("complete") ||
      lower.includes("saved") ||
      lower.includes("installed") ||
      lower.includes("synced") ||
      lower.includes("loaded") ||
      lower.includes("reorganized"));

  if (!logIcon || logIcon === "terminal") {
    if (isErr) logIcon = "error";
    else if (isWarn) logIcon = "warning";
    else if (lower.includes("lexicon") || lower.includes("language"))
      logIcon = "translate";
    else if (
      lower.includes("preview") ||
      lower.includes("chameleon") ||
      lower.includes("theme")
    )
      logIcon = "palette";
    else if (category === "blueprint") logIcon = "map";
    else if (category === "vault") logIcon = "inventory_2";
    else if (category === "radar") logIcon = "radar";
    else if (category === "security") logIcon = "shield_lock";
    else if (category === "workbench") logIcon = "save";
    else if (isSucc) logIcon = "check_circle";
    else logIcon = "terminal";
  }

  const severity: "error" | "warning" | "success" | "info" = isErr
    ? "error"
    : isWarn
      ? "warning"
      : isSucc
        ? "success"
        : "info";

  const isPreviewEvent =
    lower.includes("live preview") || lower.includes("preview stopped");

  // Derive a clean card title + body description for 2-column card anatomy
  let cardTitle = "";
  let cardBody = logText;

  if (lower.includes("cached changes from your last session")) {
    cardTitle = t("cached_changes", "Unsaved Edits");
  } else if (logText.includes(":")) {
    const colonIdx = logText.indexOf(":");
    const prefix = logText.slice(0, colonIdx).trim();
    const rest = logText.slice(colonIdx + 1).trim();
    if (prefix.length > 0 && prefix.length <= 34 && rest.length > 0) {
      cardTitle = prefix;
      cardBody = rest;
    }
  } else if (logText.includes("—")) {
    const dashIdx = logText.indexOf("—");
    const prefix = logText.slice(0, dashIdx).trim();
    const rest = logText.slice(dashIdx + 1).trim();
    if (prefix.length > 0 && prefix.length <= 36 && rest.length > 0) {
      cardTitle = prefix;
      cardBody = rest;
    }
  }

  if (!cardTitle) {
    if (isPreviewEvent) {
      cardTitle = lower.includes("stopped") || lower.includes("terminated")
        ? t("preview_stopped", "Preview Ended")
        : t("live_preview", "Live Preview");
    } else if (category === "vault") {
      cardTitle = t("vault_title", "Your {Vault}");
    } else if (category === "blueprint") {
      cardTitle = t("tab_blueprints", "{Blueprints}");
    } else if (category === "nexus") {
      cardTitle = t("tab_nexus", "The Nexus");
    } else if (category === "radar") {
      cardTitle = t("btn_radar", "Conflict Radar");
    } else if (category === "workbench") {
      cardTitle = t("tab_workbench", "Workbench");
    } else if (category === "security") {
      cardTitle = t("security", "Security");
    } else {
      cardTitle = t("system_status", "System Event");
    }
  }

  return {
    logIcon,
    logText,
    cardTitle,
    cardBody,
    category,
    severity,
    isPreviewEvent,
    repeatCount: Number(log?.repeatCount) > 1 ? Number(log.repeatCount) : 1,
  };
}

const LogFilterSection = React.memo(function LogFilterSection({
  title,
  options,
  value,
  onChange,
  t,
}: {
  title: string;
  options: { id: string; label: React.ReactNode }[];
  value: string;
  onChange: (val: any) => void;
  t: (k: string, fb?: string) => string;
}) {
  return (
    <div className="flex flex-col mb-4 w-full last:mb-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-90 mb-2.5 px-1.5 flex items-center gap-2">
        <span className="text-[var(--text)] opacity-90">{title}</span>
        <div className="h-px bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_30%,transparent)] via-[color-mix(in_srgb,var(--text)_12%,transparent)] to-transparent flex-1" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                active ? "is-selected font-bold" : "font-semibold"
              }`}
            >
              <span className="truncate flex items-center gap-2 min-w-0">
                {opt.label}
              </span>
              {active && (
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                  {t("icon_check", "check")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export function SystemLogModal({
  isLogExpanded,
  setIsLogExpanded,
  statusLog = [],
  clearStatusLog,
}: any) {
  const {
    t,
    previewLexiconId,
    previewLexiconName,
    stopLexiconPreview,
  } = useLexicon() as any;
  const {
    previewThemeId,
    previewThemeName,
    stopThemePreview,
  } = useTheme() as any;

  const status = useStore((s) => s.status);
  const setView = useStore((s) => s.setView);
  const pushStatus = useStore((s) => s.pushStatus);
  const removeStatusLogEntry = useStore((s) => s.removeStatusLogEntry);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const workspaces = useStore((s) => s.workspaces);
  const cwUnsavedEdits = useStore((s) => s.cwUnsavedEdits);
  const ideOpenFiles = useStore((s) => s.ideOpenFiles);
  const setIsSystemStatusOpen = useModalStore((s) => s.setIsSystemStatusOpen);
  const setIsConflictRadarOpen = useModalStore((s) => s.setIsConflictRadarOpen);

  const [activeGroup, setActiveGroup] = useState<LogFilterGroup>("all");
  const [severityFilter, setSeverityFilter] =
    useState<LogSeverityFilter>("all");
  const [sortOrder, setSortOrder] = useState<LogSortOrder>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const allLiveUnsavedFiles = useMemo(
    () => (isLogExpanded ? resolveAllCachedUnsavedFiles() : []),
    [cwUnsavedEdits, ideOpenFiles, isLogExpanded]
  );

  const activeWorkspaceName = useMemo(() => {
    if (!activeWorkspaceId) return t("global_scope", "Core OS");
    const found = (workspaces || []).find(
      (ws: any) =>
        ws.id === activeWorkspaceId || ws.schema_id === activeWorkspaceId
    );
    return found?.name || activeWorkspaceId;
  }, [activeWorkspaceId, workspaces, t]);

  const enrichedLogs = useMemo(() => {
    const safeList = Array.isArray(statusLog) ? statusLog : [];
    return safeList.map((entry: any) => ({
      ...entry,
      ...parseLogEntryPresentation(entry, t),
    }));
  }, [statusLog, t]);

  const counts = useMemo(() => {
    let vault = 0;
    let nexus = 0;
    let alerts = 0;
    for (const item of enrichedLogs) {
      if (
        item.category === "vault" ||
        item.category === "blueprint" ||
        item.category === "workbench"
      ) {
        vault++;
      }
      if (item.category === "nexus") {
        nexus++;
      }
      if (
        item.severity === "error" ||
        item.severity === "warning" ||
        item.category === "radar" ||
        item.category === "security"
      ) {
        alerts++;
      }
    }
    return {
      all: enrichedLogs.length,
      vault,
      nexus,
      alerts,
    };
  }, [enrichedLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = enrichedLogs.filter((item) => {
      if (activeGroup === "vault") {
        if (
          item.category !== "vault" &&
          item.category !== "blueprint" &&
          item.category !== "workbench"
        ) {
          return false;
        }
      } else if (activeGroup === "nexus") {
        if (item.category !== "nexus") return false;
      } else if (activeGroup === "alerts") {
        if (
          item.severity !== "error" &&
          item.severity !== "warning" &&
          item.category !== "radar" &&
          item.category !== "security"
        ) {
          return false;
        }
      }

      if (severityFilter !== "all" && item.severity !== severityFilter) {
        return false;
      }

      if (q) {
        const hay = `${item.cardTitle} ${item.logText} ${item.category} ${item.severity}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    if (sortOrder === "oldest") {
      return [...list].reverse();
    }
    return list;
  }, [enrichedLogs, activeGroup, severityFilter, sortOrder, searchQuery]);

  const formatRelativeTime = (timestamp: number) => {
    if (!timestamp) return "";
    const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 10) return t("just_now", "Just Now");
    if (diffSec < 60) return `${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getCategoryMeta = (category: string) => {
    switch (category) {
      case "vault":
        return {
          label: t("term_vault", "{Vault}"),
          icon: t("icon_inventory_2", "inventory_2"),
          colorClass:
            "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
          targetView: "vault",
        };
      case "blueprint":
        return {
          label: t("tab_blueprints", "{Blueprints}"),
          icon: t("icon_map", "map"),
          colorClass:
            "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
          targetView: "playsets",
        };
      case "nexus":
        return {
          label: t("tab_nexus", "Nexus"),
          icon: t("icon_hub", "hub"),
          colorClass:
            "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
          targetView: "nexus",
        };
      case "radar":
        return {
          label: t("btn_radar", "Radar Sweep"),
          icon: t("icon_radar", "radar"),
          colorClass:
            "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_40%,transparent)]",
          targetView: "ArtifactScout",
          onOpenPanel: () => setIsConflictRadarOpen(true),
        };
      case "security":
        return {
          label: t("term_backups", "{Backups}"),
          icon: t("icon_shield_lock", "shield_lock"),
          colorClass:
            "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_40%,transparent)]",
          targetView: "backups",
        };
      case "workbench":
        return {
          label: t("tab_workbench", "Workbench"),
          icon: t("icon_handyman", "handyman"),
          colorClass:
            "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
          targetView: "CitizensWorkbench",
        };
      default:
        return {
          label: t("system_status", "System"),
          icon: t("icon_terminal", "terminal"),
          colorClass:
            "text-[var(--subtext)] border-[color-mix(in_srgb,var(--text)_18%,transparent)]",
          targetView: null,
        };
    }
  };

  const handleOpenCachedFile = (
    fileName: string,
    filePath?: string,
    sourceOverride?: "cw" | "ide" | "masonhub" | "wayfinder"
  ) => {
    const cleanName = fileName.trim();
    const lower = cleanName.toLowerCase();
    const matchedItem = allLiveUnsavedFiles.find(
      (item) => item.name.toLowerCase() === lower
    );
    const resolvedPath = filePath || matchedItem?.path || cleanName;
    const resolvedSource =
      sourceOverride ||
      matchedItem?.source ||
      (lower.endsWith(".wayfinder")
        ? "wayfinder"
        : lower.endsWith(".masonhub")
          ? "masonhub"
          : lower.endsWith(".json") ||
              lower.endsWith(".cfg") ||
              lower.endsWith(".ini")
            ? "cw"
            : "ide");

    // 1. Section navigations (.wayfinder & .masonhub dispatch drafts): go to section and close log panel
    if (resolvedSource === "wayfinder" || lower.endsWith(".wayfinder")) {
      useStore.getState().setWayfinderActiveTab("wf_comms_title");
      useStore.getState().setView("WayfinderHub");
      setIsLogExpanded(false);
      return;
    }

    if (resolvedSource === "masonhub" || lower.endsWith(".masonhub")) {
      useStore.getState().setMasonActiveTab("posts");
      useStore.getState().setView("MasonHub");
      setIsLogExpanded(false);
      return;
    }

    // 2. Panel-backed files (IDE Lexicon/Schema files -> MasonEditorPanel; Workbench Templates/Configs -> WorkbenchSidePanel):
    //    Stay on the current page and keep SystemLogModal open underneath!
    if (resolvedSource === "ide") {
      const storeState = useStore.getState();
      const existingFiles = Array.isArray(storeState.ideOpenFiles)
        ? [...storeState.ideOpenFiles]
        : [];
      let idx = existingFiles.findIndex(
        (f: any) =>
          f?.path === resolvedPath ||
          String(f?.name || "").toLowerCase() === lower
      );
      if (idx === -1) {
        existingFiles.push({
          name: cleanName,
          path: resolvedPath,
          content: matchedItem?.rawContent ?? "",
          originalContent: matchedItem?.originalContent ?? "",
        });
        idx = existingFiles.length - 1;
        storeState.setIdeOpenFiles(existingFiles);
      }
      storeState.setIdeActiveFileIndex(idx);
      window.dispatchEvent(new CustomEvent("sanctuary-open-global-ide"));
      return;
    }

    // Workbench Template (.json) or Config (.cfg / .ini) -> opens WorkbenchSidePanel overlay in-place
    const storeState = useStore.getState();
    if (
      matchedItem?.rawContent !== undefined &&
      storeState.cwUnsavedEdits?.[resolvedPath] === undefined
    ) {
      storeState.setCwUnsavedEdits((prev) => ({
        ...prev,
        [resolvedPath]: matchedItem.rawContent as string,
      }));
    }
    storeState.setCwMainTab(lower.endsWith(".json") ? "TEMPLATES" : "CONFIGS");
    storeState.setCwSelectedFile({ name: cleanName, path: resolvedPath });
    window.dispatchEvent(new CustomEvent("sanctuary-open-global-workbench"));
  };

  const handleCopyEntry = async (entry: any) => {
    try {
      const ts = new Date(entry.timestamp).toLocaleTimeString();
      await navigator.clipboard.writeText(
        `[${ts}] [${String(entry.severity || "info").toUpperCase()}] ${entry.logText}`
      );
      setCopiedId(entry.id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === entry.id ? null : prev));
      }, 1500);
    } catch {}
  };

  const handleCopyAll = async () => {
    if (filteredLogs.length === 0) return;
    try {
      const text = filteredLogs
        .map((item) => {
          const ts = new Date(item.timestamp).toLocaleTimeString();
          const repeatSuffix =
            item.repeatCount > 1 ? ` (x${item.repeatCount})` : "";
          return `[${ts}] [${String(item.severity || "info").toUpperCase()}] [${item.category}] ${item.logText}${repeatSuffix}`;
        })
        .join("\n");
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    } catch {}
  };

  const hasActivePreview = Boolean(previewThemeId || previewLexiconId);
  const activePreviewLabel = previewThemeName || previewLexiconName || "";

  const handleStopAllPreviews = () => {
    if (previewThemeId && typeof stopThemePreview === "function") {
      stopThemePreview();
    }
    if (previewLexiconId && typeof stopLexiconPreview === "function") {
      stopLexiconPreview();
    }
    pushStatus(
      t(
        "preview_stopped_restored",
        "check_circle Preview stopped — restored your active {Settings}."
      ),
      "success"
    );
  };

  const liveHeroStatusText = useMemo(() => {
    const isStandby =
      !status ||
      status.toUpperCase().includes("STANDING BY") ||
      status.toUpperCase().includes("STANDBY");
    return isStandby
      ? t("standing_by", "Standing By — Telemetry Nominal")
      : parseLogEntryPresentation({ message: status }, t).logText;
  }, [status, t]);

  const logVirtual = useVirtualWindow({
    count: filteredLogs.length,
    estimateSize: 168,
    gap: 14,
    threshold: 60,
  });
  const visibleLogs = logVirtual.isVirtualized
    ? filteredLogs.slice(logVirtual.startIndex, logVirtual.endIndex)
    : filteredLogs;

  return (
    <SidePanel
      isOpen={Boolean(isLogExpanded)}
      onClose={() => setIsLogExpanded(false)}
      title={t("sys_log_history", "System Log History")}
      subtitle={t(
        "sys_log_subtitle",
        "Live Telemetry Stream, Event History & Quick Diagnostics"
      )}
      icon={t("icon_receipt_long", "receipt_long")}
      widthClass="w-[95vw] md:w-[820px]"
      backdropZ="z-[16000]"
      panelZ="z-[16001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_memory", "memory")}
            tooltip={t("system_status", "System Status")}
            tooltipSubtitle={t(
              "sys_panel_desc",
              "Hardware & Environment Telemetry"
            )}
            onClick={() => {
              setIsSystemStatusOpen(true);
            }}
          />
          {enrichedLogs.length > 0 && (
            <>
              <PanelHeaderButton
                icon={
                  copiedAll
                    ? t("icon_check", "check")
                    : t("icon_content_copy", "content_copy")
                }
                variant={copiedAll ? "success" : "default"}
                tooltip={
                  copiedAll
                    ? t("copied", "Copied")
                    : t("copy_all_logs", "Copy All Logs")
                }
                onClick={handleCopyAll}
              />
              <PanelHeaderButton
                icon={t("icon_delete_sweep", "delete_sweep")}
                variant="danger"
                tooltip={t("clear", "Clear")}
                tooltipSubtitle={t(
                  "sys_log_clear_sub",
                  "Clear recorded telemetry events"
                )}
                onClick={() => {
                  clearStatusLog?.();
                }}
              />
            </>
          )}
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-5 pb-8">
        {/* Hero Telemetry Card */}
        <SidePanelHeroCard
          icon={
            counts.alerts > 0
              ? t("icon_warning", "warning")
              : hasActivePreview
                ? t("icon_visibility", "visibility")
                : t("icon_sensors", "sensors")
          }
          overline={`${activeWorkspaceName} • ${enrichedLogs.length} ${t("events_logged", "Events Logged")}`}
          title={liveHeroStatusText}
          badge={
            counts.alerts > 0
              ? `${counts.alerts} ${t("alerts", "Alerts")}`
              : t("status_online", "Nominal")
          }
          badgeIcon={
            counts.alerts > 0
              ? t("icon_warning", "warning")
              : t("icon_check_circle", "check_circle")
          }
          variant={counts.alerts > 0 ? "warning" : "success"}
        >
          {hasActivePreview && (
            <div className="pt-1 flex flex-wrap items-center justify-end gap-2 ml-auto w-full">
              <ActionButton
                variant="warning"
                icon={t("icon_visibility_off", "visibility_off")}
                label={`${t("stop_preview", "Stop Preview")}${activePreviewLabel ? ` (${activePreviewLabel})` : ""}`}
                onClick={handleStopAllPreviews}
              />
            </div>
          )}
        </SidePanelHeroCard>

        {/* 4-Tile Category Filter Grid (Full-Width, Single-Word Non-Truncating Labels) */}
        <SidePanelFilterBar className="grid-cols-2 sm:grid-cols-4 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_receipt_long", "receipt_long")}
            label={t("all", "All")}
            value={counts.all}
            isActive={activeGroup === "all"}
            onClick={() => setActiveGroup("all")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_inventory_2", "inventory_2")}
            label={t("term_vault", "{Vault}")}
            value={counts.vault}
            isActive={activeGroup === "vault"}
            onClick={() =>
              setActiveGroup(activeGroup === "vault" ? "all" : "vault")
            }
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_hub", "hub")}
            label={t("term_nexus", "Nexus")}
            value={counts.nexus}
            isActive={activeGroup === "nexus"}
            onClick={() =>
              setActiveGroup(activeGroup === "nexus" ? "all" : "nexus")
            }
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_warning", "warning")}
            label={t("alerts", "Alerts")}
            value={counts.alerts}
            isActive={activeGroup === "alerts"}
            colorClass={
              counts.alerts > 0 ? "text-[var(--warning)]" : undefined
            }
            onClick={() =>
              setActiveGroup(activeGroup === "alerts" ? "all" : "alerts")
            }
          />
        </SidePanelFilterBar>

        {/* Search & Filter Popover Bar (Canonical Nexus/Vault FilterSection Layout) */}
        <ActionPill
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchPlaceholder={t("search", "Search...")}
          primaryPopover={{
            icon: t("icon_tune", "tune"),
            label: t("filters", "Filters"),
            content: (
              <div className="flex flex-col w-[380px] p-4 max-w-[calc(100vw-40px)]">
                <LogFilterSection
                  t={t}
                  title={t("sort_by", "Sort By")}
                  value={sortOrder}
                  onChange={(val: LogSortOrder) => setSortOrder(val)}
                  options={[
                    {
                      id: "newest",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_arrow_downward", "arrow_downward")}
                          </span>
                          <span>{t("sort_newest", "Newest First")}</span>
                        </span>
                      ),
                    },
                    {
                      id: "oldest",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_arrow_upward", "arrow_upward")}
                          </span>
                          <span>{t("sort_oldest", "Oldest First")}</span>
                        </span>
                      ),
                    },
                  ]}
                />

                <LogFilterSection
                  t={t}
                  title={t("filter_type", "Event Type")}
                  value={severityFilter}
                  onChange={(val: LogSeverityFilter) => setSeverityFilter(val)}
                  options={[
                    {
                      id: "all",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_apps", "apps")}
                          </span>
                          <span>{t("all", "All")}</span>
                        </span>
                      ),
                    },
                    {
                      id: "success",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--success)]">
                            {t("icon_check_circle", "check_circle")}
                          </span>
                          <span>{t("status_verified", "Verified")}</span>
                        </span>
                      ),
                    },
                    {
                      id: "warning",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                            {t("icon_warning", "warning")}
                          </span>
                          <span>{t("warning", "Warning")}</span>
                        </span>
                      ),
                    },
                    {
                      id: "error",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--danger)]">
                            {t("icon_error", "error")}
                          </span>
                          <span>{t("error", "Error")}</span>
                        </span>
                      ),
                    },
                  ]}
                />

                <LogFilterSection
                  t={t}
                  title={t("filter_category", "Category")}
                  value={activeGroup}
                  onChange={(val: LogFilterGroup) => setActiveGroup(val)}
                  options={[
                    {
                      id: "all",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_receipt_long", "receipt_long")}
                          </span>
                          <span>{t("all", "All")}</span>
                        </span>
                      ),
                    },
                    {
                      id: "vault",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                            {t("icon_inventory_2", "inventory_2")}
                          </span>
                          <span>{t("term_vault", "{Vault}")}</span>
                        </span>
                      ),
                    },
                    {
                      id: "nexus",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                            {t("icon_hub", "hub")}
                          </span>
                          <span>{t("term_nexus", "Nexus")}</span>
                        </span>
                      ),
                    },
                    {
                      id: "alerts",
                      label: (
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--warning)]">
                            {t("icon_warning", "warning")}
                          </span>
                          <span>{t("alerts", "Alerts")}</span>
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          }}
        />

        {/* 2-Column Sanctuary Telemetry Card Grid */}
        <UniversalGroup
          title={t("sys_log_history", "System Log History")}
          icon={t("icon_sensors", "sensors")}
          count={filteredLogs.length}
        >
          {filteredLogs.length === 0 ? (
            <EmptyState
              icon={t("icon_receipt_long", "receipt_long")}
              title={
                enrichedLogs.length === 0
                  ? t("no_logs_title", "No Telemetry Events Recorded")
                  : t("no_matching_logs", "No Matching Log Events")
              }
              subtitle={
                enrichedLogs.length === 0
                  ? t(
                      "no_logs_desc",
                      "System operations, {Vault} scans, {Blueprint} deployments, and live previews will appear here in real time."
                    )
                  : t(
                      "no_matching_logs_desc",
                      "Adjust your search query or category filters to view all recorded events."
                    )
              }
              action={
                activeGroup !== "all" ||
                severityFilter !== "all" ||
                searchQuery.trim() !== "" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveGroup("all");
                      setSeverityFilter("all");
                      setSearchQuery("");
                    }}
                    className="px-4 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest cursor-pointer"
                  >
                    {t("clear", "Clear")}
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div ref={logVirtual.containerRef}>
              {logVirtual.topPadding > 0 && (
                <div style={{ height: logVirtual.topPadding }} aria-hidden="true" />
              )}
              <div
                ref={logVirtual.gridRef}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
              >
                {visibleLogs.map((log: any) => {
                const catMeta = getCategoryMeta(log.category);

                const isErr = log.severity === "error";
                const isWarn = log.severity === "warning";
                const isSucc = log.severity === "success";

                const iconColorClass = isErr
                  ? "text-[var(--danger)]"
                  : isWarn
                    ? "text-[var(--warning)]"
                    : isSucc
                      ? "text-[var(--success)]"
                      : "text-[var(--accent)]";

                const cardBorderClass = isErr
                  ? "border-[color-mix(in_srgb,var(--danger)_28%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_48%,transparent)]"
                  : isWarn
                    ? "border-[color-mix(in_srgb,var(--warning)_28%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_48%,transparent)]"
                    : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_38%,transparent)]";

                // Resolve all unsaved files when entry is a cached-changes notification
                let bodyContent: React.ReactNode = log.cardBody;
                const cachedMatch =
                  typeof log.logText === "string"
                    ? log.logText.match(
                        /^(.*?) (has|have) cached changes from your last session\.$/i
                      )
                    : null;

                const combinedCachedFiles: CachedUnsavedFileItem[] = [];

                if (cachedMatch) {
                  const filesString = cachedMatch[1];
                  const parts = filesString.split(/\s+and\s+\d+\s+other\s+(?:files|drafts)/i);
                  const parsedFromText = parts[0]
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean);

                  // Merge parsed filenames with all live unsaved files from store/localStorage so none are hidden behind "and 4 other files"
                  const seenLower = new Set<string>();

                  for (const name of parsedFromText) {
                    const lower = name.toLowerCase();
                    if (!seenLower.has(lower)) {
                      seenLower.add(lower);
                      const liveMatch = allLiveUnsavedFiles.find(
                        (item) => item.name.toLowerCase() === lower
                      );
                      combinedCachedFiles.push({
                        name: liveMatch?.name || name,
                        path: liveMatch?.path || name,
                        source:
                          liveMatch?.source ||
                          (lower.endsWith(".wayfinder")
                            ? "wayfinder"
                            : lower.endsWith(".masonhub")
                              ? "masonhub"
                              : "cw"),
                        rawContent: liveMatch?.rawContent,
                        originalContent: liveMatch?.originalContent,
                      });
                    }
                  }

                  for (const liveFile of allLiveUnsavedFiles) {
                    const lower = liveFile.name.toLowerCase();
                    if (!seenLower.has(lower)) {
                      seenLower.add(lower);
                      combinedCachedFiles.push(liveFile);
                    }
                  }

                  bodyContent = (
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold text-[var(--subtext)]">
                        { `${combinedCachedFiles.length} ${t("files_with_unsaved_edits", "files with unsaved edits — click to open:")}` }
                      </span>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {combinedCachedFiles.map((fileObj) => {
                          const displayLabel = fileObj.name
                            .replace(/\.wayfinder$/i, "")
                            .replace(/\.masonhub$/i, "");
                          return (
                            <button
                              key={fileObj.name}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenCachedFile(
                                  fileObj.name,
                                  fileObj.path,
                                  fileObj.source
                                );
                              }}
                              className="relative px-2.5 py-1 glass-surface border border-[color-mix(in_srgb,var(--accent)_32%,transparent)] hover:border-[var(--accent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] rounded-lg transition-all text-[10px] font-black tracking-wide flex items-center gap-1.5 cursor-pointer"
                            >
                              <span className="material-symbols-outlined !text-[12px]">
                                {t("icon_edit_document", "edit_document")}
                              </span>
                              <span>{displayLabel}</span>
                              <HoverTooltip
                                title={`${t("open", "Open")} ${displayLabel}`}
                                subtitle={t("tab_workbench", "Workbench")}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // Resolve whether this log card's action opens a Panel (stays on current page & keeps SystemLogModal open underneath)
                // or navigates to a Section (goes to targetView & closes SystemLogModal).
                const lowerLog = String(log.logText || "").toLowerCase();
                let entryActionLabel = catMeta.label;
                let entryActionIcon = catMeta.icon;
                let entryOnOpenPanel: (() => void) | null =
                  catMeta.onOpenPanel || null;
                let entryTargetView: string | null = catMeta.targetView || null;

                if (cachedMatch && combinedCachedFiles.length > 0) {
                  const primaryFile = combinedCachedFiles[0];
                  const primaryLower = primaryFile.name.toLowerCase();
                  const isSectionDraft =
                    primaryFile.source === "wayfinder" ||
                    primaryFile.source === "masonhub" ||
                    primaryLower.endsWith(".wayfinder") ||
                    primaryLower.endsWith(".masonhub");
                  const cleanPrimaryLabel = primaryFile.name
                    .replace(/\.wayfinder$/i, "")
                    .replace(/\.masonhub$/i, "");
                  entryActionLabel = cleanPrimaryLabel;
                  entryActionIcon = t("icon_edit_document", "edit_document");
                  if (!isSectionDraft) {
                    entryOnOpenPanel = () =>
                      handleOpenCachedFile(
                        primaryFile.name,
                        primaryFile.path,
                        primaryFile.source
                      );
                    entryTargetView = null;
                  } else {
                    entryOnOpenPanel = null;
                  }
                } else if (!entryOnOpenPanel) {
                  if (
                    lowerLog.includes("sanctuary alert") ||
                    lowerLog.includes("urgent alert") ||
                    lowerLog.includes("global alert") ||
                    lowerLog.includes("advisory")
                  ) {
                    entryActionLabel = t(
                      "sanctuary_alerts",
                      "Sanctuary Alerts"
                    );
                    entryActionIcon = t(
                      "icon_notifications_active",
                      "notifications_active"
                    );
                    entryOnOpenPanel = () =>
                      useStore.getState().setIsAlertsOpen(true);
                  } else if (lowerLog.includes("nexus update")) {
                    entryActionLabel = t("updates_available", "Updates");
                    entryActionIcon = t("icon_update", "update");
                    entryOnOpenPanel = () =>
                      useModalStore.getState().setIsNexusUpdatesPanelOpen(true);
                  } else if (
                    lowerLog.includes("updates available") ||
                    lowerLog.includes("updates detected")
                  ) {
                    entryActionLabel = t("updates_available", "Updates");
                    entryActionIcon = t("icon_update", "update");
                    entryOnOpenPanel = () =>
                      useModalStore.getState().setShowUpdatesModal(true);
                  } else if (
                    lowerLog.includes("explicit signature") ||
                    lowerLog.includes("signature queue")
                  ) {
                    entryActionLabel = t("sig_queue_title", "Signature Queue");
                    entryActionIcon = t("icon_verified", "verified");
                    entryOnOpenPanel = () =>
                      useModalStore.getState().setIsSignatureQueueOpen(true);
                  } else if (lowerLog.includes("dna match")) {
                    entryActionLabel = t("dna_match_title", "DNA Match");
                    entryActionIcon = t("icon_fingerprint", "fingerprint");
                    entryOnOpenPanel = () =>
                      useModalStore.getState().setIsDnaModalOpen(true);
                  } else if (
                    lowerLog.includes("unidentified") ||
                    lowerLog.includes("scout queue")
                  ) {
                    entryActionLabel = t("scout_queue_title", "Scout Queue");
                    entryActionIcon = t("icon_radar", "radar");
                    entryOnOpenPanel = () =>
                      useModalStore.getState().setIsScoutPanelOpen(true);
                  } else if (
                    log.category === "system" &&
                    !log.isPreviewEvent
                  ) {
                    entryActionLabel = t("system_status", "System Status");
                    entryActionIcon = t("icon_memory", "memory");
                    entryOnOpenPanel = () => setIsSystemStatusOpen(true);
                  }
                }

                const triggerEntryOpenAction = () => {
                  if (entryOnOpenPanel) {
                    // Panel: stay on current page and keep System Log Panel open underneath!
                    entryOnOpenPanel();
                  } else if (cachedMatch && combinedCachedFiles.length > 0) {
                    // Section draft (.wayfinder / .masonhub): navigate to section and close System Log Panel
                    const primaryFile = combinedCachedFiles[0];
                    handleOpenCachedFile(
                      primaryFile.name,
                      primaryFile.path,
                      primaryFile.source
                    );
                  } else if (entryTargetView) {
                    // Section: navigate to section and close System Log Panel
                    setView(entryTargetView);
                    setIsLogExpanded(false);
                  }
                };

                const hasEntryOpenAction = Boolean(
                  entryOnOpenPanel || entryTargetView
                );

                const isCopied = copiedId === log.id;
                const exactTimeStr = new Date(log.timestamp).toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }
                );
                const fullDateStr = new Date(log.timestamp).toLocaleString();

                return (
                  <div
                    key={log.id}
                    onContextMenu={(e) => {
                      openSanctuaryContextMenu(e, {
                        title: log.cardTitle,
                        subtitle: `${catMeta.label} • ${exactTimeStr}`,
                        icon: log.logIcon,
                        items: [
                          {
                            label: t("copy", "Copy"),
                            icon: t("icon_content_copy", "content_copy"),
                            onClick: () => handleCopyEntry(log),
                          },
                          ...(hasEntryOpenAction
                            ? [
                                {
                                  label: `${t("open", "Open")} ${entryActionLabel}`,
                                  icon: entryActionIcon,
                                  onClick: triggerEntryOpenAction,
                                },
                              ]
                            : []),
                          {
                            label: t("remove", "Remove"),
                            icon: t("icon_delete", "delete"),
                            variant: "danger",
                            dividerBefore: true,
                            onClick: () => removeStatusLogEntry?.(log.id),
                          },
                        ],
                      });
                    }}
                    className={`shrink-0 rounded-2xl glass-panel border p-4 flex flex-col justify-between gap-3 transition-all duration-200 group ${cardBorderClass}`}
                  >
                    {/* Card Header: Icon Box + Title/Subtitle + Badges */}
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                          <span
                            className={`material-symbols-outlined !text-[18px] ${iconColorClass}`}
                          >
                            {t(`icon_${log.logIcon}`, log.logIcon)}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs font-black text-[var(--text)] tracking-tight truncate">
                            {log.cardTitle}
                          </span>
                          <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate flex items-center gap-1.5">
                            <span>{catMeta.label}</span>
                            <span>•</span>
                            <span>{formatRelativeTime(log.timestamp)}</span>
                          </span>
                        </div>
                      </div>

                      {log.repeatCount > 1 && (
                        <span
                          className={`relative ${VAULT_CHIP_CLASS} text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shrink-0`}
                        >
                          <span>×{log.repeatCount}</span>
                          <HoverTooltip
                            title={`${log.repeatCount} ${t("repeated_events", "Repeated Events")}`}
                          />
                        </span>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="text-xs font-semibold text-[var(--text)] opacity-90 leading-relaxed break-words">
                      {bodyContent}
                    </div>

                    {/* Card Footer: Timestamp + HoverTooltip Action Buttons */}
                    <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                      <span className="relative text-[10px] font-mono font-bold text-[var(--subtext)] opacity-65 flex items-center gap-1.5 cursor-default">
                        <span className="material-symbols-outlined !text-[12px]">
                          {t("icon_schedule", "schedule")}
                        </span>
                        <span>{exactTimeStr}</span>
                        <HoverTooltip title={fullDateStr} />
                      </span>

                      <div className="flex items-center gap-1.5">
                        {log.isPreviewEvent && hasActivePreview && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStopAllPreviews();
                            }}
                            className="relative px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined !text-[12px]">
                              {t("icon_visibility_off", "visibility_off")}
                            </span>
                            <span>{t("stop_preview", "Stop")}</span>
                            <HoverTooltip
                              title={t("stop_preview", "Stop Preview")}
                            />
                          </button>
                        )}

                        {hasEntryOpenAction &&
                          !log.isPreviewEvent && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerEntryOpenAction();
                              }}
                              className="relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                            >
                              <span className="material-symbols-outlined !text-[14px]">
                                {t("icon_open_in_new", "open_in_new")}
                              </span>
                              <HoverTooltip
                                title={`${t("open", "Open")} ${entryActionLabel}`}
                              />
                            </button>
                          )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyEntry(log);
                          }}
                          className="relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {isCopied
                              ? t("icon_check", "check")
                              : t("icon_content_copy", "content_copy")}
                          </span>
                          <HoverTooltip
                            title={
                              isCopied
                                ? t("copied", "Copied")
                                : t("copy", "Copy")
                            }
                          />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStatusLogEntry?.(log.id);
                          }}
                          className="relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined !text-[14px]">
                            {t("icon_close", "close")}
                          </span>
                          <HoverTooltip
                            title={t("remove", "Remove")}
                            variant="danger"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
              {logVirtual.bottomPadding > 0 && (
                <div style={{ height: logVirtual.bottomPadding }} aria-hidden="true" />
              )}
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
