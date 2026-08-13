import React, { useState, useMemo } from "react";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { SidePanel , getExtensionRegex, HubTabButton, ActionButton, SidePanelActionFooter } from "../shared";
import CodeSnippetSidebar from "./CodeSnippetSidebar";
import { UniversalCard } from "../components/universal/UniversalCard";
import { SearchBar } from "../shared";

interface LogSection {
  title: string;
  content: string;
}

export default function TicketLogViewer({
 logs }: { logs: string }) {
  const activeGameSchema = useStore(state => state.activeGameSchema);
  const { t } = useLexicon();
  const store = useStore();
  const [activeTab, setActiveTab] = useState<number>(0);
  const [blueprintJson, setBlueprintJson] = useState<any>(null);
  const [viewingLogContent, setViewingLogContent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const handleImportBlueprint = () => {
      if (!blueprintJson) return;
      const copySets = [...store.playSets];
      let newName = blueprintJson.name || t("support_imported_blueprint");
      let counter = 1;
      while (copySets.some((s: any) => s.name.toLowerCase() === newName.toLowerCase())) {
          newName = `${blueprintJson.name || t("support_imported_blueprint")} (${counter})`;
          counter++;
      }
      copySets.push({ name: newName, mods: [...(blueprintJson.mods || [])] });
      store.setPlaySets(copySets);

      window.dispatchEvent(new Event("storage"));
      
      store.pushStatus && store.pushStatus(
        (t("support_blueprint_imported")).replace('{name}', newName), 
        'success'
      );
      setBlueprintJson(null);
  };

  const sections = useMemo(() => {
    if (!logs) return [];
    
    const lines = logs.split("\n");
    const parsedSections: LogSection[] = [];
    let currentTitle = "General";
    let currentLines: string[] = [];

    const telemetryRegex = /^---\s*TELEMETRY:\s*(.*?)\s*---$/;
    const attachmentRegex = /^---\s*Log Attachment\s*---$/;

    for (const line of lines) {
      if (line.includes("Support ticket submission blocked due to policy violations")) {
          continue;
      }

      const telMatch = line.match(telemetryRegex);
      const attMatch = line.match(attachmentRegex);

      if (telMatch || attMatch) {
        if (currentLines.length > 0 || parsedSections.length === 0) {
          parsedSections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
        }
        currentTitle = telMatch ? telMatch[1] : "Manual Attachment";
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      parsedSections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
    }

    const PREFERRED_ORDER = ["Sanctuary OS Logs (OS)", "System Log History", "Attached Blueprint"];
    
    return parsedSections.filter(s => s.content.trim() !== "").sort((a, b) => {
      const idxA = PREFERRED_ORDER.indexOf(a.title);
      const idxB = PREFERRED_ORDER.indexOf(b.title);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }, [logs]);

  if (!logs || sections.length === 0) return null;

  const renderContent = (sec: LogSection) => {
    const lines = sec.content.split('\n').filter(l => l.trim() !== '' && !l.trim().startsWith('---'));
    const isKeyValue = sec.title !== 'System Log History' && lines.length > 0 && lines.every(line => {
       const idx = line.indexOf(':');
       return idx > 0 && idx < 40; 
    });

    if (isKeyValue) {
        return (
            <div className="flex flex-col w-full glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 py-2">
                {lines.map((line, i) => {
                    const idx = line.indexOf(':');
                    const key = line.substring(0, idx).trim();
                    const value = line.substring(idx + 1).trim();
                    return (
                        <div key={i} className="flex flex-row justify-between items-start py-3 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] last:border-0 gap-4 group w-full">
                            <span className="text-[9px] font-black capitalize tracking-widest text-[var(--subtext)] shrink-0 pt-0.5">{key}</span>
                            {key.toUpperCase() === 'MODS PATH' ? (
                                <div className="flex items-center gap-2 text-right">
                                    <span className="text-[11px] font-medium text-[var(--text)] break-all max-w-[200px] md:max-w-[400px]">
                                        {value.replace(/^([A-Za-z]:[\\/]Users[\\/])[^\\]+([\\/].*)$/i, '...$2')}
                                    </span>
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(value);
                                            store.pushStatus && store.pushStatus(t("support_path_copied"), "success");
                                        }}
                                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-white transition-colors"
                                    >
                                        <span className="material-symbols-outlined !text-[14px]">{t("icon_content_copy")}</span>
                                    </button>
                                </div>
                            ) : key.toUpperCase() === 'USER AGENT' ? (
                                <span className="text-[11px] font-medium text-[var(--text)] text-right line-clamp-1 group-hover:line-clamp-none max-w-[50%] transition-all break-words cursor-default">{value}</span>
                            ) : (
                                <span className="text-[11px] font-medium text-[var(--text)] text-right break-words">{value}</span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    if (sec.title === 'Attached Blueprint') {
        try {
            const parsed = JSON.parse(sec.content);
            return (
                <div className="glass-panel group relative border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all duration-300 rounded-[var(--radius)] overflow-hidden shadow-lg hover:-translate-y-0.5 bg-[color-mix(in_srgb,var(--bg)_50%,transparent)]">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="flex items-center gap-4 p-5 relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center shrink-0 shadow-[inset_0_0_15px_rgba(var(--accent-rgb),0.1)]">
                      <span className="material-symbols-outlined !text-[24px] text-[var(--accent)]">{t("icon_map")}</span>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-black text-[var(--text)] capitalize tracking-widest truncate">{parsed.name || t("support_attached_blueprint")}</span>
                      <span className="text-[10px] font-bold opacity-60 capitalize tracking-widest mt-0.5">{`${(parsed.mods?.length || 0)} ${t("support_mods_attached")}`}</span>
                    </div>
                    <ActionButton
                        onClick={() => setBlueprintJson(parsed)}
                        className="shrink-0"
                        icon="visibility"
                        label={t("support_view_blueprint")}
                    />
                  </div>
                </div>
            );
        } catch (e) {}
    }

    if (sec.title === 'System Log History') {
        const historyLines = sec.content.split('\n').filter(l => l.trim() !== '');
        return (
            <div className="flex flex-col w-full glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-2 gap-1 overflow-y-auto max-h-[300px] custom-scrollbar">
                {historyLines.map((line, i) => {
                    const match = line.match(/^\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/);
                    if (match) {
                        const [, timestamp, type, msg] = match;
                        const date = new Date(timestamp);
                        let typeColor = "text-[var(--text)]";
                        let bgTypeColor = "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border-[color-mix(in_srgb,var(--text)_20%,transparent)]";
                        const tLower = type.toLowerCase();
                        if (tLower === 'error') { typeColor = "text-rose-400"; bgTypeColor = "bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"; }
                        else if (tLower === 'success') { typeColor = "text-emerald-400"; bgTypeColor = "bg-[color-mix(in_srgb,var(--success)_20%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]"; }
                        else if (tLower === 'warning') { typeColor = "text-amber-400"; bgTypeColor = "bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]"; }
                        else if (tLower === 'info') { typeColor = "text-blue-400"; bgTypeColor = "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"; }

                        const knownIcons = ['check_circle', 'warning', 'error', 'info', 'sync', 'flight_takeoff', 'radar', 'terminal', 'bug_report', 'extension', 'block', 'update', 'done', 'download', 'delete', 'close', 'add', 'verified', 'new_releases', 'local_fire_department', 'health_and_safety', 'folder_open', 'inventory_2', 'account_tree', 'priority_high'];
                        const firstWord = msg.split(' ')[0];
                        let logIcon = '';
                        let displayMessage = msg;
                        if (knownIcons.includes(firstWord)) {
                            logIcon = firstWord;
                            displayMessage = msg.substring(firstWord.length).trim();
                        }

                        return (
                            <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-black/20 border border-transparent hover:border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all group">
                                <div className={`flex flex-col items-end shrink-0 w-[80px] pt-0.5`}>
                                    <span className="text-[10px] font-black tracking-wider text-[var(--text)] opacity-80">{date.toLocaleTimeString()}</span>
                                    <span className="text-[8px] font-bold tracking-widest capitalize text-[var(--subtext)] opacity-60 group-hover:opacity-100 transition-opacity">{date.toLocaleDateString()}</span>
                                </div>
                                <div className={`px-2 py-1 rounded-md text-[8px] font-black capitalize tracking-widest shrink-0 mt-0.5 ${typeColor} ${bgTypeColor} border shadow-inner flex items-center justify-center`}>
                                    {type}
                                </div>
                                <span className="text-[11px] font-bold text-[var(--text)] opacity-90 break-words pt-0.5 flex-1 leading-relaxed flex items-start gap-2">
                                    {logIcon && <span className={`material-symbols-outlined !text-[14px] ${typeColor}`}>{logIcon}</span>}
                                    <span>{displayMessage}</span>
                                </span>
                            </div>
                        );
                    }
                    return (
                        <div key={i} className="text-[10px] font-mono text-[var(--subtext)] p-2 break-words">{line}</div>
                    );
                })}
                {historyLines.length === 0 && (
                    <div className="p-8 text-center text-[10px] font-bold tracking-widest capitalize text-[var(--subtext)]">
                        {t("support_no_content")}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative group">
            <div className="p-4 overflow-y-auto max-h-[300px] text-[11px] text-[var(--text)] whitespace-pre-wrap custom-scrollbar font-mono leading-relaxed selection:bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] selection:text-white glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                {sec.content || t("support_no_content")}
            </div>
            {sec.content && (
               <button 
                 onClick={() => setViewingLogContent(sec.content)}
                 className="absolute top-4 right-4 px-4 py-2 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] rounded-lg font-black capitalize tracking-widest text-[9px] flex items-center gap-2 hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-all opacity-0 group-hover:opacity-100 shadow-md backdrop-blur-md"
               >
                 <span className="material-symbols-outlined !text-[14px]">{t("icon_open_in_full")}</span>
                 {t("btn_view_code")}
               </button>
            )}
        </div>
    );
  };

  return (
    <div className="flex flex-col w-full mt-4 gap-4">
         <div className="flex items-stretch overflow-x-auto overflow-y-hidden accent-scrollbar glass-panel rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner h-10 shrink-0 divide-x divide-white/5 w-full mb-4">
            {sections.map((sec, idx) => {
               const isActive = activeTab.toString() === idx.toString();
               const icon = sec.title.includes('Log') || sec.title.includes('Blueprint') ? 'description' : 'data_object';
               const label = sec.title.endsWith('Logs') ? sec.title.slice(0, -1) : sec.title.replace(' (OS)', '');
               
               return (
                 <button 
                   key={idx}
                   onClick={() => setActiveTab(idx)}
                   className={`h-full flex-1 shrink-0 px-4 rounded-none flex items-center justify-center gap-2 text-[10px] font-black capitalize tracking-widest transition-all whitespace-nowrap ${isActive ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
                 >
                   <span className="material-symbols-outlined !text-[14px]">{icon}</span>
                   {label}
                 </button>
               );
            })}
         </div>

       <div className="w-full">
           {renderContent(sections[activeTab])}
       </div>

       {blueprintJson && (
          <SidePanel
            isOpen={!!blueprintJson}
            onClose={() => setBlueprintJson(null)}
            title={t("support_attached_blueprint")}
            subtitle={blueprintJson.name || t("support_import_load_order")}
            icon={t("icon_map")}
            iconColorClass="text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
            widthClass="w-full md:w-[550px]"
            footer={
                <SidePanelActionFooter 
                    onCancel={() => setBlueprintJson(null)}
                    cancelLabel={t("nav_cancel")}
                    cancelIcon="close"
                    onAction={handleImportBlueprint}
                    actionLabel={t("playsets_btn_import")}
                    actionIcon={t("icon_download")}
                    actionVariant="success"
                />
            }
          >
             <div className="flex flex-col min-h-full gap-4 relative pb-4">
                    <div className="text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] mb-2 flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-3">
                      <span className="material-symbols-outlined !text-[14px]">format_list_bulleted</span>
                      {t("support_mods_list")} ({(blueprintJson.mods?.length || 0)})
                    </div>
                    <SearchBar 
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder={t("playsets_search_ph")}
                      className="!h-12 !rounded-2xl"
                    />
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
                      {blueprintJson.mods?.filter((m: string) => m.toLowerCase().includes(searchQuery.toLowerCase())).map((m: string, i: number) => {
                          const displayName = m.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '').replace(/[-_]/g, ' ') || m.replace(/[-_]/g, ' ');
                          return (
                            <div key={i} className="glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-colors p-4 rounded-[var(--radius)] flex flex-col items-center justify-center text-center gap-3 shadow-sm group aspect-square">
                                <div className="w-12 h-12 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined !text-[24px] text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">{t("icon_extension")}</span>
                                </div>
                                <span className="text-xs font-bold text-[var(--text)] group-hover:theme-text-accent transition-colors line-clamp-2 w-full" title={displayName}>{displayName}</span>
                            </div>
                          );
                      })}
                    </div>
             </div>
          </SidePanel>
       )}

       {viewingLogContent && (
           <CodeSnippetSidebar code={viewingLogContent} onClose={() => setViewingLogContent(null)} />
       )}
    </div>
  );
}
