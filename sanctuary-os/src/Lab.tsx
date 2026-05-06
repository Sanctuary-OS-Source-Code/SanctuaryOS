import { useState } from "react";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, ModSearchDropdown } from "./shared";

export default function Lab({
  activeLabMod, setActiveLabMod, modList = [], 
  concludeTest, executeHotSwap, shelterActive, conflictTarget, setConflictTarget
}: any) {
  const { t } = useLexicon();
  const [labSearchQuery, setLabSearchQuery] = useState("");
  
  const filteredMods = modList.filter((m: any) => 
    (m.displayName || m.name || "").toLowerCase().includes(labSearchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full">
      <ViewHeader 
        title={t("lab_title")} 
        subtitle={t("lab_subtitle")} 
      />
      
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-[500px]">
        {/* Left Panel: Queue & Search */}
        <div className="flex flex-col gap-6 w-full lg:w-1/3 h-full">
          {/* LOCAL ARTIFACT SEARCH */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-[2.5rem] flex flex-col gap-4 shadow-xl flex-1 max-h-[50vh]">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-[10px] font-black text-[var(--subtext)] tracking-[0.2em] uppercase opacity-80">{t("lab_local_search")}</h3>
              <span className="text-[10px] font-black text-[var(--text)] tracking-widest">{modList.length} TOTAL</span>
            </div>
            
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent)]">{t("ui_icon_search")}</span>
              <input 
                type="text" 
                value={labSearchQuery}
                onChange={(e) => setLabSearchQuery(e.target.value)}
                placeholder="Filter DNA signatures..." 
                className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-10 pr-4 text-xs font-bold text-white outline-none focus:border-white/30 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 h-full">
              {filteredMods.map((mod: any, idx: number) => (
                <div key={`${mod.hash}-${idx}`} className="flex justify-between items-center p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all group">
                  <div className="flex flex-col gap-1 truncate pr-4">
                    <span className="text-[10px] font-black text-white uppercase truncate">{mod.displayName || mod.name.replace(/_/g, ' ')}</span>
                    <span className="text-[8px] font-bold text-[var(--subtext)] opacity-80 uppercase flex items-center gap-1">
                      <span className="text-[var(--warning)]">{t("ui_icon_collection")}</span> {mod.category || "COLLECTION"}
                    </span>
                  </div>
                  <button 
                    onClick={() => setActiveLabMod(mod)}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black tracking-widest uppercase transition-all shadow-md shrink-0 border ${activeLabMod?.hash === mod.hash ? 'theme-bg-accent text-[var(--bg)] theme-border-accent' : 'bg-white/10 border-white/10 text-[var(--subtext)] group-hover:text-[var(--text)]'}`}
                  >
                    {t("lab_stage")}
                  </button>
                </div>
              ))}
            </div>
          </div>

          </div>

        {/* Right Panel: Staging Area */}
        <div className="w-full lg:w-2/3 bg-white/5 backdrop-blur-md border border-white/10 p-10 rounded-[3rem] flex flex-col shadow-xl">
          {activeLabMod ? (
            <div className="w-full h-full flex flex-col animate-in fade-in">
              {/* Header Info */}
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-white/10 rounded text-[8px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest">{t("lab_dna_subject")}</span>
                <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 truncate max-w-sm">virtual_{activeLabMod.hash || "unknown_signature"}</span>
              </div>
              <h2 className="text-3xl font-black text-[var(--text)] uppercase tracking-tighter mb-8 leading-none">
                {activeLabMod.displayName || activeLabMod.name.replace(/_/g, ' ')}
              </h2>

              {/* Grid Content */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                {/* Associated Identities */}
                <div className="bg-black/20 border border-white/5 p-6 rounded-3xl flex flex-col h-full min-h-[250px]">
                  <h3 className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-2 mb-6">
                    <span className="text-[var(--accent)]">{t("ui_icon_dna")}</span> {t("lab_associated_identities")}
                  </h3>
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-40">
                    <span className="text-3xl text-[var(--accent)] animate-pulse">{t("ui_icon_scout")}</span>
                    <p className="text-[9px] font-black uppercase tracking-widest text-center leading-relaxed px-4 text-[var(--text)]">
                      {t("lab_no_deps")}
                    </p>
                  </div>
                </div>

                {/* Nexus Simulation */}
                <div className="bg-black/20 border border-white/5 p-6 rounded-3xl flex flex-col h-full min-h-[250px]">
                  <h3 className="text-[10px] font-black text-[var(--text)] uppercase tracking-widest flex items-center gap-2 mb-6">
                    <span className="text-[var(--warning)]">{t("ui_icon_nexus")}</span> {t("lab_nexus_sim")}
                  </h3>
                  
                  <div className="mb-6 relative">
                    <p className="text-[8px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mb-2 pl-2">{t("lab_select_conflict")}</p>
                    <div className="relative mt-2">
                      <ModSearchDropdown 
                        modList={modList.filter((m: any) => m.hash !== activeLabMod?.hash).map((m: any) => ({...m, displayName: m.displayName || m.name.replace(/_/g, ' ')}))}
                        selectedItem={conflictTarget}
                        onSelect={setConflictTarget}
                        onClear={() => setConflictTarget && setConflictTarget(null)}
                        placeholder={t("lab_select_conflict")}
                      />
                    </div>
                  </div>

                  <div className="flex-1 flex items-center justify-center opacity-40">
                    <p className="text-[9px] font-black uppercase tracking-widest text-center leading-relaxed text-[var(--text)]">
                      {t("lab_no_clash")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30">
              <div className="w-32 h-32 rounded-full border-4 border-dashed border-white/20 flex items-center justify-center text-4xl mb-6 animate-[spin_20s_linear_infinite]">
                {t("ui_icon_dna")}
              </div>
              <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-widest">{t("lab_awaiting")}</h2>
              <p className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-widest mt-2">{t("lab_stage_prompt")}</p>
            </div>
          )}
          
          {activeLabMod && (
            <div className="flex gap-4 mt-4 pt-4 w-full">
              {!shelterActive && (
                <button onClick={executeHotSwap} className="flex-1 py-4 theme-btn-standard rounded-2xl flex items-center justify-center font-black uppercase tracking-widest shadow-lg">
                  {t("lab_btn_hot_swap")}
                </button>
              )}
              {shelterActive && (
                <button onClick={concludeTest} className="flex-[2] py-4 theme-btn-standard rounded-2xl flex items-center justify-center font-black uppercase tracking-widest shadow-lg">
                  {t("lab_btn_conclude")}
                </button>
              )}
            </div>
          )}
      </div>
    </div>
  </div>
  );
}
