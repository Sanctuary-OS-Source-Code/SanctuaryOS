import React, { useState, useMemo } from "react";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { SidePanel } from "./shared";
import CodeSnippetSidebar from "./CodeSnippetSidebar";

interface LogSection {
  title: string;
  content: string;
}

export default function TicketLogViewer({ logs }: { logs: string }) {
  const { t } = useLexicon();
  const store = useStore();
  const [activeTab, setActiveTab] = useState<number>(0);
  const [blueprintJson, setBlueprintJson] = useState<any>(null);
  const [viewingLogContent, setViewingLogContent] = useState<string | null>(null);
  
  const handleImportBlueprint = () => {
      if (!blueprintJson) return;
      const copySets = [...store.playSets];
      let newName = blueprintJson.name || t("sa_support_imported_blueprint") || "Imported Blueprint";
      let counter = 1;
      while (copySets.some((s: any) => s.name.toLowerCase() === newName.toLowerCase())) {
          newName = `${blueprintJson.name || t("sa_support_imported_blueprint") || "Imported Blueprint"} (${counter})`;
          counter++;
      }
      copySets.push({ name: newName, mods: [...(blueprintJson.mods || [])] });
      store.setPlaySets(copySets);
      localStorage.setItem("sanctuary_playsets", JSON.stringify(copySets));
      window.dispatchEvent(new Event("storage"));
      
      store.pushStatus && store.pushStatus(
        (t("sa_support_blueprint_imported")).replace('{name}', newName), 
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
      // Filter out irrelevant local OS errors from logs that confuse the ticket context
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
    
    // Filter out empty general sections
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
            <div className="flex flex-col w-full theme-glass-inner rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 py-2">
                {lines.map((line, i) => {
                    const idx = line.indexOf(':');
                    const key = line.substring(0, idx).trim();
                    const value = line.substring(idx + 1).trim();
                    return (
                        <div key={i} className="flex flex-row justify-between items-start py-3 border-b border-white/5 last:border-0 gap-4 group">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] shrink-0 pt-0.5">{key}</span>
                            {key.toUpperCase() === 'MODS PATH' ? (
                                <div className="flex items-center gap-2 text-right">
                                    <span className="text-[11px] font-medium text-[var(--text)] break-all max-w-[200px] md:max-w-[400px]">
                                        {value.replace(/^([A-Za-z]:[\\/]Users[\\/])[^\\]+([\\/].*)$/i, '...$2')}
                                    </span>
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(value);
                                            store.pushStatus && store.pushStatus(t("sa_support_path_copied"), "success");
                                        }}
                                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 text-[var(--subtext)] hover:text-white transition-colors"
                                    >
                                        <span className="material-symbols-outlined !text-[14px]">{t("auto_content_copy")}</span>
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
                <div className="flex flex-col items-center justify-center gap-4 py-8 theme-glass-inner rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    <div className="w-16 h-16 rounded-2xl bg-black/20 flex items-center justify-center text-[var(--accent)] border border-white/5 shadow-inner">
                        <span className="material-symbols-outlined !text-[32px]">{t("auto_map")}</span>
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-black tracking-tighter text-[var(--text)] drop-shadow-md">{parsed.name || t("sa_support_attached_blueprint") || "Blueprint"}</h3>
                        <p className="text-[10px] font-black tracking-widest uppercase text-[var(--subtext)] mt-1">{(parsed.mods?.length || 0)} {t("sa_support_mods_attached")}</p>
                    </div>
                    <button 
                        onClick={() => setBlueprintJson(parsed)}
                        className="mt-2 px-6 py-3 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] hover:scale-105"
                    >
                        <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_visibility")}</span>
                        {t("sa_support_view_blueprint")}
                    </button>
                </div>
            );
        } catch (e) {}
    }

    if (sec.title === 'System Log History') {
        const historyLines = sec.content.split('\n').filter(l => l.trim() !== '');
        return (
            <div className="flex flex-col w-full theme-glass-inner rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-2 gap-1 overflow-y-auto max-h-[300px] custom-scrollbar">
                {historyLines.map((line, i) => {
                    const match = line.match(/^\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/);
                    if (match) {
                        const [, timestamp, type, msg] = match;
                        const date = new Date(timestamp);
                        let typeColor = "text-[var(--text)]";
                        let bgTypeColor = "bg-[var(--text)]/10 border-[var(--text)]/20";
                        const tLower = type.toLowerCase();
                        if (tLower === 'error') { typeColor = "text-rose-400"; bgTypeColor = "bg-rose-500/20 border-rose-500/30"; }
                        else if (tLower === 'success') { typeColor = "text-emerald-400"; bgTypeColor = "bg-emerald-500/20 border-emerald-500/30"; }
                        else if (tLower === 'warning') { typeColor = "text-amber-400"; bgTypeColor = "bg-amber-500/20 border-amber-500/30"; }
                        else if (tLower === 'info') { typeColor = "text-blue-400"; bgTypeColor = "bg-blue-500/20 border-blue-500/30"; }

                        const knownIcons = ['check_circle', 'warning', 'error', 'info', 'sync', 'flight_takeoff', 'radar', 'terminal', 'bug_report', 'extension', 'block', 'update', 'done', 'download', 'delete', 'close', 'add', 'verified', 'new_releases', 'local_fire_department', 'health_and_safety', 'folder_open', 'inventory_2', 'account_tree', 'priority_high'];
                        const firstWord = msg.split(' ')[0];
                        let logIcon = '';
                        let displayMessage = msg;
                        if (knownIcons.includes(firstWord)) {
                            logIcon = firstWord;
                            displayMessage = msg.substring(firstWord.length).trim();
                        }

                        return (
                            <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-black/20 border border-transparent hover:border-white/5 transition-all group">
                                <div className={`flex flex-col items-end shrink-0 w-[80px] pt-0.5`}>
                                    <span className="text-[10px] font-black tracking-wider text-[var(--text)] opacity-80">{date.toLocaleTimeString()}</span>
                                    <span className="text-[8px] font-bold tracking-widest uppercase text-[var(--subtext)] opacity-60 group-hover:opacity-100 transition-opacity">{date.toLocaleDateString()}</span>
                                </div>
                                <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest shrink-0 mt-0.5 ${typeColor} ${bgTypeColor} border shadow-inner flex items-center justify-center`}>
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
                    <div className="p-8 text-center text-[10px] font-bold tracking-widest uppercase text-[var(--subtext)]">
                        {t("sa_support_no_content")}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative group">
            <div className="p-4 overflow-y-auto max-h-[300px] text-[11px] text-[var(--text)] whitespace-pre-wrap custom-scrollbar font-mono leading-relaxed selection:bg-[var(--accent)]/30 selection:text-white theme-glass-inner rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                {sec.content || t("sa_support_no_content") || "No content."}
            </div>
            {sec.content && (
               <button 
                 onClick={() => setViewingLogContent(sec.content)}
                 className="absolute top-4 right-4 px-4 py-2 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] rounded-lg font-black uppercase tracking-widest text-[9px] flex items-center gap-2 hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-all opacity-0 group-hover:opacity-100 shadow-md backdrop-blur-md"
               >
                 <span className="material-symbols-outlined !text-[14px]">{t("auto_open_in_full")}</span>
                 {t("ui_btn_expand_snippet")}
               </button>
            )}
        </div>
    );
  };

  return (
    <div className="flex flex-col w-full mt-4 gap-4">
       {/* IDE-Style Tabs */}
       <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar p-1.5 shrink-0 theme-glass-panel rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner w-full mb-4">
          {sections.map((sec, idx) => {
             const isActive = activeTab === idx;
             return (
                 <button 
                    key={idx} 
                    onClick={() => setActiveTab(idx)}
                    className={`h-8 px-4 flex items-center gap-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                        isActive 
                           ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' 
                           : 'text-[var(--subtext)] border border-transparent hover:text-[var(--text)] hover:bg-white/5 opacity-70 hover:opacity-100'
                    }`}
                 >
                   <span className={`material-symbols-outlined !text-[14px] ${isActive ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'}`}>
                       {sec.title.includes('Log') || sec.title.includes('Blueprint') ? 'description' : 'data_object'}
                   </span>
                   <span>{sec.title.endsWith('Logs') ? sec.title.slice(0, -1) : sec.title.replace(' (OS)', '')}</span>
                 </button>
             );
          })}
       </div>

       {/* Content Area */}
       <div className="w-full">
           {renderContent(sections[activeTab])}
       </div>

       {blueprintJson && (
          <SidePanel
            isOpen={!!blueprintJson}
            onClose={() => setBlueprintJson(null)}
            title={t("sa_support_attached_blueprint")}
            subtitle={blueprintJson.name || t("sa_support_import_load_order") || "Import Load Order"}
            icon={t("ui_icon_map")}
            iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
            widthClass="w-full md:w-[550px]"
          >
             <div className="flex flex-col h-full gap-4 relative">
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] px-2">{t("sa_support_mods_list")} ({(blueprintJson.mods?.length || 0)})</div>
                    {blueprintJson.mods?.map((m: string, i: number) => (
                        <div key={i} className="theme-glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-3 rounded-xl flex items-center gap-3">
                            <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)]">{t("ui_icon_extension")}</span>
                            <span className="text-[11px] font-bold text-[var(--text)] truncate">{m.split(/[\\/]/).pop()?.replace(/\.(package|ts4script)$/i, '').replace(/[-_]/g, ' ') || m.replace(/[-_]/g, ' ')}</span>
                        </div>
                    ))}
                </div>
                
                <div className="pt-4 border-t border-white/10 mt-auto shrink-0 pb-6">
                    <button 
                        onClick={handleImportBlueprint}
                        className="w-full h-14 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] rounded-2xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(var(--success-rgb),0.2)]"
                    >
                        <span className="material-symbols-outlined !text-[18px]">{t("ui_icon_download")}</span>
                        {t("sa_support_import_library")}
                    </button>
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
