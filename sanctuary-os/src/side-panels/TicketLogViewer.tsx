import { useState, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  SidePanelHeroCard,
  UniversalGroup,
  getExtensionRegex,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionPill,
  HoverTooltip,
  EmptyState,
  VAULT_CHIP_CLASS,
} from "../shared";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import { scrubLogUserData } from "../utils/logScrubber";
import { openSanctuaryContextMenu } from "../ContextMenu";

interface LogSection {
  title: string;
  content: string;
}

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

function resolveKeyValueIcon(key: string, t: any): string {
  const k = key.toUpperCase();
  if (k === "OS" || k.includes("OPERATING SYSTEM") || k.includes("PLATFORM")) {
    return t("icon_computer", "computer");
  }
  if (k.includes("ARCHITECTURE") || k.includes("CPU") || k.includes("MEMORY")) {
    return t("icon_memory", "memory");
  }
  if (k.includes("SANCTUARY OS VERSION") || k.includes("APP VERSION")) {
    return t("icon_verified", "verified");
  }
  if (k.includes("RESOLUTION") || k.includes("DISPLAY") || k.includes("SCREEN")) {
    return t("icon_aspect_ratio", "aspect_ratio");
  }
  if (k.includes("USER AGENT") || k.includes("BROWSER")) {
    return t("icon_public", "public");
  }
  if (k.includes("PATH") || k.includes("FOLDER") || k.includes("DIRECTORY")) {
    return t("icon_folder_open", "folder_open");
  }
  if (k.includes("BLUEPRINT") || k.includes("PLAYSET") || k.includes("PLAY SET")) {
    return t("icon_map", "map");
  }
  if (k.includes("MODS") || k.includes("ARTIFACTS")) {
    return t("icon_extension", "extension");
  }
  if (k.includes("UPDATE")) {
    return t("icon_update", "update");
  }
  if (k.includes("CAPTURED") || k.includes("TIME") || k.includes("DATE")) {
    return t("icon_schedule", "schedule");
  }
  if (k.includes("BUNDLE") || k.includes("DIAGNOSTIC")) {
    return t("icon_inventory_2", "inventory_2");
  }
  return t("icon_terminal", "terminal");
}

function parseAttachedHistoryEntry(rawLine: string, t: any, index: number) {
  const match = rawLine.match(/^\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/);
  const timestampRaw = match ? match[1] : "";
  const typeRaw = match ? match[2].trim() : "INFO";
  const msgRaw = match ? match[3].trim() : rawLine.trim();

  const iconMatch = msgRaw.match(/^([a-z_0-9]+)\s+(.*)$/);
  let logIcon = "";
  let logText = msgRaw;

  if (
    iconMatch &&
    (KNOWN_ICON_PREFIXES.has(iconMatch[1]) || iconMatch[1].includes("_"))
  ) {
    logIcon = iconMatch[1].replace(/^icon_/, "");
    logText = iconMatch[2];
  }

  const lower = logText.toLowerCase();
  const tLower = typeRaw.toLowerCase();

  const category =
    lower.includes("preview") ||
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
                : "system";

  const isErr =
    tLower === "error" ||
    logIcon === "error" ||
    logIcon === "bug_report" ||
    lower.includes("error") ||
    lower.includes("failed");
  const isWarn =
    !isErr &&
    (tLower === "warning" ||
      logIcon === "warning" ||
      logIcon === "priority_high" ||
      lower.includes("warning") ||
      lower.includes("conflict") ||
      lower.includes("quarantine") ||
      lower.includes("lockdown"));
  const isSucc =
    !isErr &&
    !isWarn &&
    (tLower === "success" ||
      logIcon === "check_circle" ||
      logIcon === "done" ||
      logIcon === "verified" ||
      lower.includes("restored") ||
      lower.includes("complete") ||
      lower.includes("saved") ||
      lower.includes("installed") ||
      lower.includes("synced") ||
      lower.includes("deployed") ||
      lower.includes("loaded") ||
      lower.includes("reorganized"));

  if (!logIcon || logIcon === "terminal") {
    if (isErr) logIcon = t("icon_error", "error");
    else if (isWarn) logIcon = t("icon_warning", "warning");
    else if (lower.includes("lexicon") || lower.includes("language"))
      logIcon = t("icon_translate", "translate");
    else if (
      lower.includes("preview") ||
      lower.includes("chameleon") ||
      lower.includes("theme")
    )
      logIcon = t("icon_palette", "palette");
    else if (category === "blueprint") logIcon = t("icon_map", "map");
    else if (category === "vault") logIcon = t("icon_inventory_2", "inventory_2");
    else if (category === "radar") logIcon = t("icon_radar", "radar");
    else if (category === "security") logIcon = t("icon_shield_lock", "shield_lock");
    else if (category === "workbench") logIcon = t("icon_save", "save");
    else if (isSucc) logIcon = t("icon_check_circle", "check_circle");
    else logIcon = t("icon_terminal", "terminal");
  }

  const severity: "error" | "warning" | "success" | "info" = isErr
    ? "error"
    : isWarn
      ? "warning"
      : isSucc
        ? "success"
        : "info";

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
    if (category === "vault") {
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

  const categoryLabel =
    category === "vault"
      ? t("term_vault", "{Vault}")
      : category === "blueprint"
        ? t("tab_blueprints", "{Blueprints}")
        : category === "nexus"
          ? t("tab_nexus", "Nexus")
          : category === "radar"
            ? t("btn_radar", "Radar Sweep")
            : category === "security"
              ? t("term_backups", "{Backups}")
              : category === "workbench"
                ? t("tab_workbench", "Workbench")
                : t("system_status", "System");

  const parsedDate = timestampRaw ? new Date(timestampRaw) : null;
  const isValidDate = Boolean(parsedDate && !isNaN(parsedDate.getTime()));
  const timeStr = isValidDate
    ? parsedDate!.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : timestampRaw;
  const dateStr = isValidDate ? parsedDate!.toLocaleDateString() : "";
  const fullDateStr = isValidDate ? parsedDate!.toLocaleString() : timestampRaw;

  return {
    id: `hist-${index}`,
    rawLine,
    typeRaw: typeRaw.toUpperCase(),
    logIcon,
    logText,
    cardTitle,
    cardBody,
    category,
    categoryLabel,
    severity,
    timeStr,
    dateStr,
    fullDateStr,
  };
}

export default function TicketLogViewer({ logs }: { logs: string }) {
  const { activeGameSchema, playSets, setPlaySets, pushStatus } = useStore(
    useShallow((state) => ({
      activeGameSchema: state.activeGameSchema,
      playSets: state.playSets,
      setPlaySets: state.setPlaySets,
      pushStatus: state.pushStatus,
    }))
  );
  const { t } = useLexicon();
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(
    null
  );
  const [blueprintJson, setBlueprintJson] = useState<any>(null);
  const [viewingCodeSnippet, setViewingCodeSnippet] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAllSection, setCopiedAllSection] = useState(false);

  const scrubbedLogs = useMemo(() => scrubLogUserData(logs || ""), [logs]);

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(id);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === id ? null : prev));
      }, 1500);
    } catch {}
  };

  const handleCopyActiveSection = async () => {
    if (activeSectionIndex === null || !sections[activeSectionIndex]) return;
    try {
      await navigator.clipboard.writeText(sections[activeSectionIndex].content);
      setCopiedAllSection(true);
      setTimeout(() => setCopiedAllSection(false), 1800);
    } catch {}
  };

  const handleImportBlueprint = () => {
    if (!blueprintJson) return;
    const copySets = [...playSets];
    let newName =
      blueprintJson.name || t("support_imported_blueprint", "Imported {Blueprint}");
    let counter = 1;
    while (
      copySets.some((s: any) => s.name.toLowerCase() === newName.toLowerCase())
    ) {
      newName = `${blueprintJson.name || t("support_imported_blueprint", "Imported {Blueprint}")} (${counter})`;
      counter++;
    }
    copySets.push({ name: newName, mods: [...(blueprintJson.mods || [])] });
    setPlaySets(copySets);

    window.dispatchEvent(new Event("storage"));

    if (pushStatus) {
      pushStatus(
        t("support_blueprint_imported", "Imported {name}").replace(
          "{name}",
          newName
        ),
        "success"
      );
    }
    setBlueprintJson(null);
  };

  const sections = useMemo(() => {
    if (!scrubbedLogs) return [];

    const lines = scrubbedLogs.split("\n");
    const parsedSections: LogSection[] = [];
    let currentTitle = "General";
    let currentLines: string[] = [];

    const telemetryRegex = /^---\s*TELEMETRY:\s*(.*?)\s*---$/;
    const attachmentRegex =
      /^---\s*(?:Log Attachment|ATTACHED LOG FILE)(?:\s*\((.*?)\))?\s*---$/i;
    const legacyRuntimeRegex =
      /^---\s*RUNTIME TELEMETRY LOGS(?:\s*\(.*?\))?\s*---$/i;

    for (const line of lines) {
      if (
        line.includes(
          "Support ticket submission blocked due to policy violations"
        )
      ) {
        continue;
      }

      const telMatch = line.match(telemetryRegex);
      const attMatch = line.match(attachmentRegex);
      const legMatch = line.match(legacyRuntimeRegex);

      if (telMatch || attMatch || legMatch) {
        if (currentLines.length > 0) {
          let flushTitle = currentTitle;
          let flushContent = currentLines.join("\n").trim();
          if (legMatch && flushTitle === "General" && flushContent) {
            flushTitle = "Sanctuary OS Logs (OS)";
            const normalizedKv = flushContent
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => {
                if (l.includes(":")) return l;
                return `Platform Summary: ${l}`;
              });
            flushContent = normalizedKv.join("\n");
          }
          parsedSections.push({
            title: flushTitle,
            content: flushContent,
          });
        }
        if (telMatch) {
          currentTitle = telMatch[1];
        } else if (legMatch) {
          currentTitle = "System Log History";
        } else {
          currentTitle = attMatch?.[1]
            ? `Manual Attachment (${attMatch[1]})`
            : "Manual Attachment";
        }
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      parsedSections.push({
        title: currentTitle,
        content: currentLines.join("\n").trim(),
      });
    }

    const PREFERRED_ORDER = [
      "Sanctuary OS Logs (OS)",
      "System Log History",
      "Attached Blueprint",
    ];

    return parsedSections
      .filter((s) => s.content.trim() !== "")
      .sort((a, b) => {
        const idxA = PREFERRED_ORDER.indexOf(a.title);
        const idxB = PREFERRED_ORDER.indexOf(b.title);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });
  }, [scrubbedLogs]);

  if (!scrubbedLogs || sections.length === 0) return null;

  const renderContent = (sec: LogSection) => {
    const q = logSearchQuery.trim().toLowerCase();
    const lines = sec.content
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.trim().startsWith("---"));
    const isKeyValue =
      sec.title !== "System Log History" &&
      lines.length > 0 &&
      lines.every((line) => {
        const idx = line.indexOf(":");
        return idx > 0 && idx < 40;
      });

    if (isKeyValue) {
      const kvItems = lines
        .map((line, i) => {
          const idx = line.indexOf(":");
          const key = line.substring(0, idx).trim();
          const value = scrubLogUserData(line.substring(idx + 1).trim());
          const icon = resolveKeyValueIcon(key, t);
          return {
            id: `kv-${i}`,
            key,
            value,
            icon,
          };
        })
        .filter((item) => {
          if (!q) return true;
          return (
            item.key.toLowerCase().includes(q) ||
            item.value.toLowerCase().includes(q)
          );
        });

      if (kvItems.length === 0) {
        return (
          <EmptyState
            icon={t("icon_data_object", "data_object")}
            title={t("no_matching_logs", "No Matching Log Events")}
            subtitle={t(
              "no_matching_logs_desc",
              "Adjust your search query or category filters to view all recorded events."
            )}
          />
        );
      }

      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
          {kvItems.map((item) => {
            const isCopied = copiedKey === item.id;
            const isPathOrLong =
              item.key.toUpperCase().includes("PATH") ||
              item.key.toUpperCase().includes("USER AGENT") ||
              item.value.length > 42;

            return (
              <div
                key={item.id}
                onContextMenu={(e) => {
                  openSanctuaryContextMenu(e, {
                    title: item.key,
                    subtitle: sec.title,
                    icon: item.icon,
                    items: [
                      {
                        label: t("copy", "Copy"),
                        icon: t("icon_content_copy", "content_copy"),
                        onClick: () =>
                          handleCopyText(`${item.key}: ${item.value}`, item.id),
                      },
                    ],
                  });
                }}
                className="shrink-0 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_38%,transparent)] p-4 flex flex-col justify-between gap-3 transition-all duration-200 group"
              >
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                      <span className="material-symbols-outlined !text-[18px]">
                        {item.icon}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-80 truncate">
                        {item.key}
                      </span>
                      {!isPathOrLong && (
                        <span className="text-xs font-black text-[var(--text)] tracking-tight break-words mt-0.5">
                          {item.value}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyText(item.value, item.id);
                    }}
                    className="relative w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {isCopied
                        ? t("icon_check", "check")
                        : t("icon_content_copy", "content_copy")}
                    </span>
                    <HoverTooltip
                      title={
                        isCopied ? t("copied", "Copied") : t("copy", "Copy")
                      }
                    />
                  </button>
                </div>

                {isPathOrLong && (
                  <div className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[11px] font-mono font-semibold text-[var(--text)] opacity-90 break-all leading-relaxed">
                    {item.value}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (sec.title === "System Log History") {
      const historyEntries = sec.content
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((line, i) => parseAttachedHistoryEntry(line, t, i))
        .filter((entry) => {
          if (!q) return true;
          const hay = `${entry.cardTitle} ${entry.cardBody} ${entry.categoryLabel} ${entry.typeRaw} ${entry.timeStr} ${entry.dateStr}`.toLowerCase();
          return hay.includes(q);
        });

      if (historyEntries.length === 0) {
        return (
          <EmptyState
            icon={t("icon_receipt_long", "receipt_long")}
            title={
              q
                ? t("no_matching_logs", "No Matching Log Events")
                : t("support_no_content", "No log entries found.")
            }
            subtitle={
              q
                ? t(
                    "no_matching_logs_desc",
                    "Adjust your search query or category filters to view all recorded events."
                  )
                : undefined
            }
          />
        );
      }

      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
          {historyEntries.map((entry) => {
            const isErr = entry.severity === "error";
            const isWarn = entry.severity === "warning";
            const isSucc = entry.severity === "success";

            const iconColorClass = isErr
              ? "text-[var(--danger)]"
              : isWarn
                ? "text-[var(--warning)]"
                : isSucc
                  ? "text-[var(--success)]"
                  : "text-[var(--accent)]";

            const badgeBorderClass = isErr
              ? "text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
              : isWarn
                ? "text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_40%,transparent)]"
                : isSucc
                  ? "text-[var(--success)] border-[color-mix(in_srgb,var(--success)_40%,transparent)]"
                  : "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)]";

            const cardBorderClass = isErr
              ? "border-[color-mix(in_srgb,var(--danger)_28%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_48%,transparent)]"
              : isWarn
                ? "border-[color-mix(in_srgb,var(--warning)_28%,transparent)] hover:border-[color-mix(in_srgb,var(--warning)_48%,transparent)]"
                : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_38%,transparent)]";

            const badgeIcon = isErr
              ? t("icon_error", "error")
              : isWarn
                ? t("icon_warning", "warning")
                : isSucc
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_info", "info");

            const isCopied = copiedKey === entry.id;

            return (
              <div
                key={entry.id}
                onContextMenu={(e) => {
                  openSanctuaryContextMenu(e, {
                    title: entry.cardTitle,
                    subtitle: `${entry.categoryLabel}${entry.timeStr ? ` • ${entry.timeStr}` : ""}`,
                    icon: entry.logIcon,
                    items: [
                      {
                        label: t("copy", "Copy"),
                        icon: t("icon_content_copy", "content_copy"),
                        onClick: () =>
                          handleCopyText(entry.rawLine, entry.id),
                      },
                    ],
                  });
                }}
                className={`shrink-0 rounded-2xl glass-panel border p-4 flex flex-col justify-between gap-3 transition-all duration-200 group ${cardBorderClass}`}
              >
                {/* Card Header: Icon Box + Title/Subtitle + Severity Chip */}
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0">
                      <span
                        className={`material-symbols-outlined !text-[18px] ${iconColorClass}`}
                      >
                        {t(`icon_${entry.logIcon}`, entry.logIcon)}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-black text-[var(--text)] tracking-tight truncate">
                        {entry.cardTitle}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--subtext)] opacity-75 truncate flex items-center gap-1.5">
                        <span>{entry.categoryLabel}</span>
                        {entry.dateStr && (
                          <>
                            <span>•</span>
                            <span>{entry.dateStr}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`${VAULT_CHIP_CLASS} !bg-transparent ${badgeBorderClass} shrink-0`}
                  >
                    <span className="material-symbols-outlined !text-[12px] shrink-0">
                      {badgeIcon}
                    </span>
                    <span>{entry.typeRaw}</span>
                  </span>
                </div>

                {/* Card Body */}
                <div className="text-xs font-semibold text-[var(--text)] opacity-90 leading-relaxed break-words">
                  {entry.cardBody}
                </div>

                {/* Card Footer: Timestamp + Copy Button */}
                <div className="pt-2.5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex items-center justify-between gap-2">
                  <span className="relative text-[10px] font-mono font-bold text-[var(--subtext)] opacity-65 flex items-center gap-1.5 cursor-default">
                    <span className="material-symbols-outlined !text-[12px]">
                      {t("icon_schedule", "schedule")}
                    </span>
                    <span>{entry.timeStr || entry.dateStr}</span>
                    {entry.fullDateStr && (
                      <HoverTooltip title={entry.fullDateStr} />
                    )}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyText(entry.rawLine, entry.id);
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
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="relative group w-full flex flex-col gap-3">
        <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[11px] text-[var(--text)] whitespace-pre-wrap font-mono leading-relaxed">
          {sec.content || t("support_no_content", "No content available.")}
        </div>
        {sec.content && (
          <ActionButton
            variant="glass"
            icon={t("icon_open_in_full", "open_in_full")}
            label={t("btn_view_code", "Open Code Viewer")}
            onClick={() =>
              setViewingCodeSnippet({ title: sec.title, content: sec.content })
            }
            className="w-full"
          />
        )}
      </div>
    );
  };

  const handleCardClick = (idx: number) => {
    const sec = sections[idx];

    const lines = sec.content
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.trim().startsWith("---"));
    const isKeyValue =
      sec.title !== "System Log History" &&
      lines.length > 0 &&
      lines.every((line) => {
        const idx = line.indexOf(":");
        return idx > 0 && idx < 40;
      });

    if (sec.title === "Attached Blueprint") {
      try {
        const parsed = JSON.parse(sec.content);
        setBlueprintJson(parsed);
      } catch (e) {
        console.error("Invalid blueprint json");
      }
    } else if (sec.title === "System Log History" || isKeyValue) {
      setLogSearchQuery("");
      setActiveSectionIndex(idx);
    } else {
      setViewingCodeSnippet({ title: sec.title, content: sec.content });
    }
  };

  const activeSectionLinesCount = useMemo(() => {
    if (activeSectionIndex === null || !sections[activeSectionIndex]) return 0;
    return sections[activeSectionIndex].content
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.trim().startsWith("---")).length;
  }, [activeSectionIndex, sections]);

  return (
    <div className="flex flex-col w-full gap-3.5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5 w-full">
        {sections.map((sec, idx) => {
          let icon = t("icon_description", "description");
          if (sec.title.includes("Blueprint")) icon = t("icon_map", "map");
          else if (sec.title.includes("System"))
            icon = t("icon_terminal", "terminal");
          else if (sec.title.includes("OS Logs"))
            icon = t("icon_data_object", "data_object");

          const label = sec.title.endsWith("Logs")
            ? sec.title.slice(0, -1)
            : sec.title.replace(" (OS)", "");

          return (
            <div
              key={idx}
              onClick={() => handleCardClick(idx)}
              className="glass-surface group relative border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all duration-300 rounded-xl cursor-pointer flex items-center gap-3.5 px-4 py-3.5"
            >
              <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                <span className="material-symbols-rounded !text-[20px]">
                  {icon}
                </span>
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-black text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                  {label}
                </span>
                <span className="text-[9px] font-bold opacity-70 uppercase tracking-wider mt-0.5 text-[var(--subtext)]">
                  {t("view_details", "View Details")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {activeSectionIndex !== null && (
        <SidePanel
          isOpen={activeSectionIndex !== null}
          onClose={() => setActiveSectionIndex(null)}
          title={sections[activeSectionIndex].title}
          subtitle={t("dossier_attached_logs", "Attached Telemetry")}
          icon={t("icon_terminal", "terminal")}
          iconColorClass="text-[var(--accent)]"
          widthClass="w-[95vw] md:w-[820px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={
                  copiedAllSection
                    ? t("icon_check", "check")
                    : t("icon_content_copy", "content_copy")
                }
                variant={copiedAllSection ? "success" : "default"}
                tooltip={
                  copiedAllSection
                    ? t("copied", "Copied")
                    : t("copy_all_logs", "Copy All Logs")
                }
                onClick={handleCopyActiveSection}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_terminal", "terminal")}
              overline={t("dossier_attached_logs", "Attached Telemetry")}
              title={sections[activeSectionIndex].title}
              description={t(
                "view_details",
                "Scrubbed system telemetry and diagnostic log records."
              )}
              badge={`${activeSectionLinesCount}`}
              badgeIcon={t("icon_sensors", "sensors")}
              variant="accent"
            />

            <ActionPill
              searchQuery={logSearchQuery}
              setSearchQuery={setLogSearchQuery}
              searchPlaceholder={t("search", "Search...")}
              hideSearch={false}
            />

            <UniversalGroup
              title={sections[activeSectionIndex].title}
              icon={t("icon_terminal", "terminal")}
              count={activeSectionLinesCount}
            >
              {renderContent(sections[activeSectionIndex])}
            </UniversalGroup>
          </div>
        </SidePanel>
      )}

      {blueprintJson && (
        <SidePanel
          isOpen={!!blueprintJson}
          onClose={() => setBlueprintJson(null)}
          title={t("support_attached_blueprint", "Attached {Blueprint}")}
          subtitle={
            blueprintJson.name ||
            t("support_import_load_order", "Import Load Order")
          }
          icon={t("icon_map", "map")}
          iconColorClass="text-[var(--accent)]"
          widthClass="w-[95vw] md:w-[820px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_download", "download")}
                tooltip={t("playsets_btn_import", "Import {Blueprint}")}
                variant="success"
                onClick={handleImportBlueprint}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_map", "map")}
              overline={t("support_attached_blueprint", "Attached {Blueprint}")}
              title={
                blueprintJson.name ||
                t("support_import_load_order", "Blueprint Snapshot")
              }
              description={t("support_mods_list", "{Mods} List")}
              badge={`${blueprintJson.mods?.length || 0}`}
              badgeIcon={t("icon_extension", "extension")}
              variant="accent"
            />

            <ActionPill
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchPlaceholder={t("playsets_search_ph", "Search mods...")}
              hideSearch={false}
            />

            <UniversalGroup
              title={`${t("support_mods_list", "{Mods} List")} (${blueprintJson.mods?.length || 0})`}
              icon={t("icon_format_list_bulleted", "format_list_bulleted")}
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3.5">
                {blueprintJson.mods
                  ?.filter((m: string) =>
                    m.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((m: string, i: number) => {
                    const displayName =
                      m
                        .split(/[\\/]/)
                        .pop()
                        ?.replace(getExtensionRegex(activeGameSchema), "")
                        .replace(/[-_]/g, " ") || m.replace(/[-_]/g, " ");
                    return (
                      <div
                        key={i}
                        className="glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-colors p-3.5 rounded-xl flex flex-col items-center justify-center text-center gap-2.5 group"
                      >
                        <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                          <span className="material-symbols-rounded !text-[20px]">
                            {t("icon_extension", "extension")}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors line-clamp-2 w-full">
                          {displayName}
                          <HoverTooltip title={displayName} />
                        </span>
                      </div>
                    );
                  })}
              </div>
            </UniversalGroup>
          </div>
        </SidePanel>
      )}

      {viewingCodeSnippet && (
        <CodeSnippetSidebar
          title={viewingCodeSnippet.title}
          code={viewingCodeSnippet.content}
          onClose={() => setViewingCodeSnippet(null)}
        />
      )}
    </div>
  );
}
