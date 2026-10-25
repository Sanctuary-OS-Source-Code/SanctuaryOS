import React, { useState, useMemo } from "react";
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
} from "../shared";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import { scrubLogUserData } from "../utils/logScrubber";

interface LogSection {
  title: string;
  content: string;
}

export default function TicketLogViewer({ logs }: { logs: string }) {
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const { t } = useLexicon();
  const store = useStore();
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(
    null
  );
  const [blueprintJson, setBlueprintJson] = useState<any>(null);
  const [viewingCodeSnippet, setViewingCodeSnippet] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const scrubbedLogs = useMemo(() => scrubLogUserData(logs || ""), [logs]);

  const handleImportBlueprint = () => {
    if (!blueprintJson) return;
    const copySets = [...store.playSets];
    let newName =
      blueprintJson.name || t("support_imported_blueprint", "Imported Blueprint");
    let counter = 1;
    while (
      copySets.some((s: any) => s.name.toLowerCase() === newName.toLowerCase())
    ) {
      newName = `${blueprintJson.name || t("support_imported_blueprint", "Imported Blueprint")} (${counter})`;
      counter++;
    }
    copySets.push({ name: newName, mods: [...(blueprintJson.mods || [])] });
    store.setPlaySets(copySets);

    window.dispatchEvent(new Event("storage"));

    if (store.pushStatus) {
      store.pushStatus(
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
    const attachmentRegex = /^---\s*Log Attachment\s*---$/;

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

      if (telMatch || attMatch) {
        if (currentLines.length > 0 || parsedSections.length === 0) {
          parsedSections.push({
            title: currentTitle,
            content: currentLines.join("\n").trim(),
          });
        }
        currentTitle = telMatch ? telMatch[1] : "Manual Attachment";
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
      return (
        <div className="flex flex-col gap-2 w-full">
          {lines.map((line, i) => {
            const idx = line.indexOf(":");
            const key = line.substring(0, idx).trim();
            const value = scrubLogUserData(line.substring(idx + 1).trim());
            return (
              <div
                key={i}
                className="flex flex-row justify-between items-start px-3.5 py-2.5 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] gap-4 group w-full"
              >
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] shrink-0 pt-0.5">
                  {key}
                </span>
                {key.toUpperCase() === "MODS PATH" ? (
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-xs font-mono font-bold text-[var(--text)] break-all max-w-[200px] md:max-w-[360px]">
                      {value}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(value);
                        if (store.pushStatus) {
                          store.pushStatus(
                            t("support_path_copied", "Path copied"),
                            "success"
                          );
                        }
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] transition-colors"
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        {t("icon_content_copy", "content_copy")}
                      </span>
                    </button>
                  </div>
                ) : key.toUpperCase() === "USER AGENT" ? (
                  <span className="text-xs font-medium text-[var(--text)] text-right line-clamp-1 group-hover:line-clamp-none max-w-[55%] transition-all break-words cursor-default">
                    {value}
                  </span>
                ) : (
                  <span className="text-xs font-bold text-[var(--text)] text-right break-words">
                    {value}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (sec.title === "System Log History") {
      const historyLines = sec.content
        .split("\n")
        .filter((l) => l.trim() !== "");
      return (
        <div className="flex flex-col w-full gap-2">
          {historyLines.map((line, i) => {
            const match = line.match(/^\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/);
            if (match) {
              const [, timestamp, type, msg] = match;
              const date = new Date(timestamp);
              let typeColor = "text-[var(--text)]";
              let borderTypeColor =
                "border-[color-mix(in_srgb,var(--text)_25%,transparent)]";
              const tLower = type.toLowerCase();
              if (tLower === "error") {
                typeColor = "text-[var(--danger)]";
                borderTypeColor =
                  "border-[color-mix(in_srgb,var(--danger)_40%,transparent)]";
              } else if (tLower === "success") {
                typeColor = "text-[var(--success)]";
                borderTypeColor =
                  "border-[color-mix(in_srgb,var(--success)_40%,transparent)]";
              } else if (tLower === "warning") {
                typeColor = "text-[var(--warning)]";
                borderTypeColor =
                  "border-[color-mix(in_srgb,var(--warning)_40%,transparent)]";
              } else if (tLower === "info") {
                typeColor = "text-[var(--accent)]";
                borderTypeColor =
                  "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]";
              }

              const knownIcons = [
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
              ];
              const firstWord = msg.split(" ")[0];
              let logIcon = "";
              let displayMessage = msg;
              if (knownIcons.includes(firstWord)) {
                logIcon = firstWord;
                displayMessage = msg.substring(firstWord.length).trim();
              }

              return (
                <div
                  key={i}
                  className="flex items-start gap-3 px-3.5 py-2.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] transition-all group"
                >
                  <div className="flex flex-col items-end shrink-0 w-[76px] pt-0.5">
                    <span className="text-[10px] font-mono font-bold text-[var(--text)] opacity-85">
                      {date.toLocaleTimeString()}
                    </span>
                    <span className="text-[8px] font-bold tracking-wider uppercase text-[var(--subtext)] opacity-60">
                      {date.toLocaleDateString()}
                    </span>
                  </div>
                  <div
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 mt-0.5 bg-transparent ${typeColor} ${borderTypeColor} border flex items-center justify-center`}
                  >
                    {type}
                  </div>
                  <span className="text-xs font-bold text-[var(--text)] opacity-90 break-words pt-0.5 flex-1 leading-relaxed flex items-start gap-2">
                    {logIcon && (
                      <span
                        className={`material-symbols-outlined !text-[14px] ${typeColor}`}
                      >
                        {logIcon}
                      </span>
                    )}
                    <span>{displayMessage}</span>
                  </span>
                </div>
              );
            }
            return (
              <div
                key={i}
                className="text-[10px] font-mono text-[var(--subtext)] px-3 py-2 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] break-words"
              >
                {line}
              </div>
            );
          })}
          {historyLines.length === 0 && (
            <div className="p-8 text-center text-[10px] font-bold tracking-widest uppercase text-[var(--subtext)]">
              {t("support_no_content", "No log entries found.")}
            </div>
          )}
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
      setActiveSectionIndex(idx);
    } else {
      setViewingCodeSnippet({ title: sec.title, content: sec.content });
    }
  };

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
              <div className="w-10 h-10 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                <span className="material-symbols-outlined !text-[20px]">
                  {icon}
                </span>
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-black text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                  {label}
                </span>
                <span className="text-[9px] font-bold opacity-70 uppercase tracking-wider mt-0.5 text-[var(--subtext)]">
                  {t("btn_view_details", "View Details")}
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
          widthClass="w-[90vw] md:w-[680px]"
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_terminal", "terminal")}
              overline={t("dossier_attached_logs", "Attached Telemetry")}
              title={sections[activeSectionIndex].title}
              description={t(
                "btn_view_details",
                "Scrubbed system telemetry and diagnostic log records."
              )}
              variant="accent"
            />
            <UniversalGroup
              title={sections[activeSectionIndex].title}
              icon={t("icon_terminal", "terminal")}
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
          title={t("support_attached_blueprint", "Attached Blueprint")}
          subtitle={
            blueprintJson.name ||
            t("support_import_load_order", "Import Load Order")
          }
          icon={t("icon_map", "map")}
          iconColorClass="text-[var(--accent)]"
          widthClass="w-[90vw] md:w-[680px]"
          headerActions={
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={t("icon_download", "download")}
                tooltip={t("playsets_btn_import", "Import Blueprint")}
                variant="success"
                onClick={handleImportBlueprint}
              />
            </PanelHeaderGroup>
          }
        >
          <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
            <SidePanelHeroCard
              icon={t("icon_map", "map")}
              overline={t("support_attached_blueprint", "Attached Blueprint")}
              title={
                blueprintJson.name ||
                t("support_import_load_order", "Blueprint Snapshot")
              }
              description={t(
                "support_mods_list",
                "Inspect or import the attached load order snapshot."
              )}
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
              title={`${t("support_mods_list", "Included Mods")} (${blueprintJson.mods?.length || 0})`}
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
                        <div className="w-10 h-10 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                          <span className="material-symbols-outlined !text-[20px]">
                            {t("icon_extension", "extension")}
                          </span>
                        </div>
                        <span
                          className="text-xs font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors line-clamp-2 w-full"
                          title={displayName}
                        >
                          {displayName}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </UniversalGroup>

            <ActionButton
              variant="glass"
              icon={t("icon_download", "download")}
              label={t("playsets_btn_import", "Import Blueprint")}
              onClick={handleImportBlueprint}
              className="w-full"
            />
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
