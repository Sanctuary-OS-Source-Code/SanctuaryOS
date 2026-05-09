import { useState } from "react";
import { formatDisplayName, ViewHeader, CustomDropdown } from "./shared";
import { useLexicon } from "./LexiconContext";
import { tauriBridge } from "./lib/tauri-bridge";

export default function BlueprintArchitect({ isOpen, onClose, playSet, modList, toggleInActiveSet, allow_write, onCloudUpload, vaultPath, onRefreshMods }: any) {
  const { t } = useLexicon();
  const [localQuery, setLocalQuery] = useState("");

  if (!isOpen || !playSet) return null;

  const searchResults = modList.filter((mod: any) => {
    if (!mod) return false;
    
    const q = localQuery.toLowerCase();
    const matchName = (mod.displayName || mod.name || "").toLowerCase().includes(q);
    const matchAuthor = (mod.author || "").toLowerCase().includes(q);
    
    return matchName || matchAuthor;
  }).slice(0, 50);

  const renderMiniCard = (modData: any, isEquipped: boolean) => {
    if (!modData) return null;
    let currentPriority = "";
    if (modData.path) {
      const firstPart = modData.path.split(/[\/\\]/)[0];
      if (["!Sanctuary", "!Sanctuary2", "!Sanctuary3"].includes(firstPart)) {
        currentPriority = firstPart;
      }
    }

    return (
      <div key={modData.name} className={`group relative flex flex-col p-5 rounded-2xl border transition-all hover:scale-[1.02] hover:shadow-xl ${isEquipped ? 'bg-white/5 border-white/20' : 'bg-black/40 border-white/5 hover:border-white/10'}`}>
        <div className="flex flex-col min-w-0 pr-14 mb-2">
          <span className="text-[11px] font-bold text-[var(--text)] uppercase truncate group-hover:theme-text-accent transition-colors">
            {formatDisplayName(modData.name)}
          </span>
          <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 mt-1 uppercase tracking-widest">
            {isEquipped ? t("bp_status_linked") : (modData.version || t("dossier_vlocal"))}
          </span>
        </div>

        {isEquipped && allow_write && (
           <div className="w-full mt-auto">
             <CustomDropdown
               value={currentPriority}
               onChange={async (newPrio: string) => {
                 try {
                   await tauriBridge.moveModToPriorityFolder(vaultPath, modData.name, newPrio);
                   if (onRefreshMods) onRefreshMods();
                 } catch (e) {
                   console.error("Failed to move mod priority", e);
                 }
               }}
               options={[
                 { id: "", label: "Default (500)" },
                 { id: "!Sanctuary", label: "Sanctuary (1000)" },
                 { id: "!Sanctuary2", label: "Sanctuary 2 (1500)" },
                 { id: "!Sanctuary3", label: "Sanctuary 3 (2000)" }
               ]}
             />
           </div>
        )}

        {allow_write && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleInActiveSet(modData.name); }}
            className={`absolute top-3 right-3 w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-black transition-all hover:scale-110 active:scale-90 border ${isEquipped ? 'theme-panel-danger theme-btn-danger' : 'bg-white/5 text-[var(--text)]/40 border-white/10 hover:text-[var(--text)]'}`}
          >
            <span className="mt-[-2px]">{isEquipped ? '✕' : '+'}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 lg:p-12 animate-in fade-in duration-500">
      <div className="absolute inset-0 bg-[var(--bg)]/40 backdrop-blur-2xl" onClick={onClose} />
      <div className="relative w-full h-full max-w-7xl border border-white/10 rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col animate-in zoom-in-95" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'var(--sidebar)' }}>
        
        <div className="p-10 border-b border-white/5 bg-black/20 shrink-0">
          <ViewHeader title={t("bp_title")} subtitle={`${t("bp_subtitle")}${playSet.name}`}>
            <div className="flex items-center gap-6">
               {!allow_write && (
                 <div className="px-6 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                   <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                   <span className="text-[10px] font-black theme-text-danger uppercase tracking-widest">Read Only Mode</span>
                 </div>
               )}
               {allow_write && (
                 <button 
                   onClick={() => onCloudUpload(playSet.name)} 
                   className="px-6 py-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-3 hover:bg-blue-500/20 transition-all group"
                 >
                   <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest group-hover:text-blue-300">{t("bp_btn_cloud")}</span>
                 </button>
               )}
              <button onClick={onClose} className="px-10 py-5 theme-bg-success text-[var(--bg)] font-black rounded-3xl shadow-lg hover:opacity-90 transition-all uppercase text-xs tracking-widest">
                {allow_write ? t("bp_btn_finalize") : "Exit Preview"}
              </button>
              <button onClick={onClose} className="w-14 h-14 rounded-2xl theme-glass-panel flex items-center justify-center text-[var(--text)] hover:theme-bg-danger transition-all">✕</button>
            </div>
          </ViewHeader>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 flex flex-col bg-black/40 border-r border-white/5">
            <div className="p-8 border-b border-white/5 shrink-0 flex items-center gap-4">
              <span className="text-xl opacity-50">🔍</span>
              <input 
                type="text" 
                value={localQuery} 
                onChange={(e) => setLocalQuery(e.target.value)} 
                placeholder="Search Vault Artifacts..."
                className="w-full bg-transparent border-none text-[var(--text)] text-sm font-bold uppercase tracking-widest focus:outline-none placeholder:opacity-30" 
              />
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {searchResults.map((modData: any) => renderMiniCard(modData, playSet.mods.includes(modData.name)))}
              </div>
            </div>
          </div>
          
          <div className="w-1/2 flex flex-col bg-black/10">
            <div className="p-8 border-b border-white/5 shrink-0 flex items-center">
              <h3 className="text-xs font-black text-[var(--text)]/40 uppercase tracking-widest">{t("bp_active_specs")} ({playSet.mods.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {playSet.mods.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 italic space-y-4">
                  <span className="text-5xl">🗄️</span>
                  <p>{t("bp_empty_manifest")}</p>
                </div>
              )}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {playSet.mods.map((modName: string) => {
                  const modData = modList.find((m: any) => {
                    if (m.name === modName) return true;
                    const mBase = m.name.split(/[\\/]/).pop();
                    const targetBase = modName.split(/[\\/]/).pop();
                    return mBase && targetBase && mBase === targetBase;
                  });
                  return renderMiniCard(modData || { name: modName }, true);
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}