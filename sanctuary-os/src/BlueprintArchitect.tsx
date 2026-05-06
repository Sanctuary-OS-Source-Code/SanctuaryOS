import { useState } from "react";
import { formatDisplayName, ViewHeader } from "./shared";
import { useLexicon } from "./LexiconContext";

export default function BlueprintArchitect({ isOpen, onClose, playSet, modList, toggleInActiveSet, allow_write, onCloudUpload }: any) {
  const { t } = useLexicon();
  const [localQuery, setLocalQuery] = useState("");

  if (!isOpen || !playSet) return null;

  // 🚀 FIX: Search Local Mod List instead of Cloud
  const searchResults = modList.filter((mod: any) => {
    if (!mod || mod.isVirtual) return false; // Ignore folders, only show equippable items
    
    const q = localQuery.toLowerCase();
    const matchName = (mod.displayName || mod.name || "").toLowerCase().includes(q);
    const matchAuthor = (mod.author || "").toLowerCase().includes(q);
    
    return matchName || matchAuthor;
  }).slice(0, 50); // Keep it snappy to prevent lag

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 lg:p-12 animate-in fade-in duration-500">
      <div className="absolute inset-0 bg-[var(--bg)]/40 backdrop-blur-2xl" onClick={onClose} />
      <div className="relative w-full h-full max-w-7xl border border-white/10 rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col animate-in zoom-in-95" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'var(--sidebar)' }}>
        
        <div className="p-10 border-b border-white/5 bg-black/20">
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
          {/* LEFT SIDE: EQUIPPED MODS */}
          <div className="w-1/2 border-r border-white/5 flex flex-col bg-black/10">
            <div className="p-8 border-b border-white/5">
              <h3 className="text-xs font-black text-[var(--text)]/40 uppercase tracking-widest">{t("bp_active_specs")} ({playSet.mods.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-3 custom-scrollbar">
              {playSet.mods.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 italic space-y-4">
                  <span className="text-5xl">🗄️</span>
                  <p>{t("bp_empty_manifest")}</p>
                </div>
              )}
              {playSet.mods.map((modName: string) => {
                const isInstalled = modList.some((m: any) => m.name === modName);
                return (
                  <div key={modName} className="group bg-white/5 border border-white/5 p-5 rounded-3xl flex justify-between items-center hover:bg-white/10 transition-all">
                    <div className="min-w-0 pr-4">
                      <p className="text-[var(--text)] font-bold truncate text-sm uppercase tracking-tight">{formatDisplayName(modName)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${isInstalled ? 'theme-bg-success' : 'theme-bg-warning animate-pulse'}`} />
                        <span className={`text-[9px] font-black uppercase tracking-widest ${isInstalled ? 'theme-text-success opacity-60' : 'theme-text-warning opacity-60'}`}>
                          {isInstalled ? t("bp_status_linked") : t("bp_status_phantom")}
                        </span>
                      </div>
                    </div>
                    {allow_write && (
                      <button onClick={() => toggleInActiveSet(modName)} className="w-10 h-10 rounded-xl theme-panel-danger theme-btn-danger transition-all font-black border">✕</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT SIDE: LOCAL BUNKER SEARCH */}
          <div className="w-1/2 flex flex-col bg-white/5">
            <div className="p-8 border-b border-white/5 space-y-4">
              <h3 className="text-xs font-black theme-text-accent opacity-60 uppercase tracking-widest">{t("bp_search_title")}</h3>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={localQuery} 
                  onChange={(e) => setLocalQuery(e.target.value)} 
                  placeholder={t("bp_search_placeholder")} 
                  className="flex-1 bg-black/40 border border-white/10 p-5 rounded-2xl text-[var(--text)] outline-none focus:theme-border-accent transition-all font-bold placeholder:text-[var(--text)]/20" 
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-3 custom-scrollbar">
              {searchResults.length > 0 ? (
                searchResults.map((mod: any) => {
                  const isInSet = playSet.mods.includes(mod.name);
                  return (
                    <div key={mod.hash || mod.name} className="bg-black/20 border border-white/5 p-5 rounded-3xl flex justify-between items-center hover:bg-black/40 transition-all">
                      <div className="min-w-0 pr-4">
                        <p className="text-[var(--text)] font-bold truncate text-sm uppercase tracking-tight">{mod.displayName || mod.name}</p>
                        <p className="text-[9px] font-black theme-text-accent opacity-40 uppercase tracking-widest mt-1">{t("bp_creator")} {mod.author || t("bp_unknown_creator")}</p>
                      </div>
                      {allow_write && (
                        <button 
                          onClick={() => toggleInActiveSet(mod.name)} 
                          className={`px-6 py-3 rounded-xl font-black text-[10px] tracking-widest transition-all border ${isInSet ? 'theme-panel-danger theme-btn-danger' : 'theme-panel-success theme-btn-success'}`}
                        >
                          {isInSet ? t("bp_btn_remove") : t("bp_btn_add")}
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-10 space-y-4">
                  <span className="text-6xl">📦</span>
                  <p className="uppercase font-black tracking-widest">{t("bp_no_matches")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}