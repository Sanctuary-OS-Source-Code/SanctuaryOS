import { useLexicon } from "./LexiconContext";
import { ViewHeader } from "./shared";

export default function Blueprints({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  playSets, activeSetName, equipPlaySet, deletePlaySet, syncCode, setSyncCode, uploadBlueprintToCloud, syncBlueprintByCode,
  importPlaySet, setSnapshotModal, activePlaySetIndex, setActivePlaySetIndex, setIsBlueprintModalOpen, exportPlaySet,
  setIsDraftingSet, isDraftingSet, draftSetName, setDraftSetName, finalizeDraftSet
}: any) {
  const { t } = useLexicon();
  
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full">
      <ViewHeader title={t("playsets_title")} subtitle={t("playsets_subtitle")}>
        <div className="flex flex-col gap-3 ml-auto">
          {/* Top Row: Import & Snapshot */}
          <div className="flex gap-3 justify-end">
            <button onClick={importPlaySet} className="px-6 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-[var(--text)] font-black text-[9px] uppercase tracking-widest transition-all shadow-md flex items-center gap-2">
              <span className="text-[var(--danger)] text-sm">{t("ui_icon_import")}</span> {t("playsets_btn_import")}
            </button>
            <button onClick={() => setSnapshotModal && setSnapshotModal(true)} className="px-6 py-2.5 rounded-full bg-white/5 border border-white/10 text-[var(--text)] font-black text-[9px] uppercase tracking-widest transition-all shadow-md flex items-center gap-2 hover:bg-white/10">
              <span className="text-[var(--subtext)] opacity-60">{t("ui_icon_snapshot")}</span> {t("playsets_btn_snapshot")}
            </button>
          </div>
          
          {/* Bottom Row: Sync Code & Cloud Uplink */}
          <div className="flex gap-3 justify-end items-center">
            <div className="relative flex items-center bg-black/20 rounded-2xl border border-white/10 p-1 w-[220px] h-12">
              <input 
                type="text" 
                value={syncCode || ""} 
                onChange={(e) => setSyncCode && setSyncCode(e.target.value)} 
                placeholder={t("playsets_uplink_code")} 
                className="w-full h-full bg-transparent pl-4 pr-16 text-[9px] font-black text-[var(--text)] outline-none placeholder:text-[var(--subtext)] placeholder:opacity-60 uppercase tracking-widest"
              />
              <button onClick={() => syncBlueprintByCode && syncBlueprintByCode(syncCode)} className="absolute right-1 px-4 h-9 bg-white/10 text-[var(--text)] font-black text-[8px] tracking-widest rounded-xl hover:bg-white/20 transition-all flex items-center justify-center">
                {t("playsets_btn_sync")}
              </button>
            </div>
            <button onClick={() => activeSetName && uploadBlueprintToCloud && uploadBlueprintToCloud(activeSetName)} className="px-6 py-2.5 rounded-full bg-white/5 border border-white/10 text-[var(--text)] font-black text-[9px] uppercase tracking-widest transition-all shadow-md flex items-center gap-2 hover:bg-white/10">
              <span className="text-[var(--accent)]">{t("ui_icon_cloud")}</span> {t("playsets_btn_cloud")}
            </button>
          </div>
        </div>
      </ViewHeader>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Draft New Blueprint */}
        {isDraftingSet ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[3rem] flex flex-col gap-4 animate-in zoom-in-95 shadow-xl h-64 justify-center">
            <input 
              autoFocus 
              type="text" 
              value={draftSetName} 
              onChange={(e) => setDraftSetName && setDraftSetName(e.target.value)} 
              className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-[var(--text)] font-bold outline-none text-center" 
              placeholder={t("playsets_draft_placeholder")} 
            />
            <div className="flex gap-3 mt-4">
              <button onClick={finalizeDraftSet} className="flex-1 py-3 theme-bg-success text-[var(--bg)] font-black uppercase tracking-widest text-[10px] rounded-xl hover:opacity-90 transition-all shadow-lg">{t("playsets_btn_save")}</button>
              <button onClick={() => setIsDraftingSet && setIsDraftingSet(false)} className="flex-1 py-3 bg-white/5 text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-xl border border-white/10 hover:bg-white/10 transition-all">{t("playsets_btn_cancel")}</button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => setIsDraftingSet && setIsDraftingSet(true)} 
            className="group cursor-pointer bg-black/10 border-2 border-dashed border-white/10 hover:border-white/30 rounded-[3rem] flex flex-col items-center justify-center h-64 transition-all shadow-inner"
          >
            <div className="text-3xl text-[var(--subtext)] opacity-60 group-hover:text-[var(--text)] group-hover:opacity-100 transition-all font-light mb-2">+</div>
            <p className="text-[10px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest group-hover:text-[var(--text)] group-hover:opacity-100 transition-all">
              {t("playsets_draft_new")}
            </p>
          </div>
        )}

        {/* Playset Cards */}
        {(playSets || []).map((set: any, idx: number) => (
          <div key={set.name} className={`bg-white/5 backdrop-blur-md border p-8 rounded-[3rem] flex flex-col transition-all h-64 shadow-xl ${activeSetName === set.name ? 'border-white/30' : 'border-white/5 hover:border-white/10'}`}>
            <div className="mb-6">
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter truncate leading-none mb-2">{set.name}</h3>
              <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 tracking-widest uppercase">
                {(set.mods || []).length} {t("playsets_artifacts_linked")}
              </p>
            </div>
            
            <div className="flex flex-col gap-3 mt-auto">
              <button 
                onClick={() => equipPlaySet && equipPlaySet(set.name)} 
                className={`w-full py-4 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all shadow-md ${activeSetName === set.name ? 'theme-bg-success text-[var(--bg)]' : 'bg-white/10 border border-white/10 text-[var(--text)] hover:bg-white/20'}`}
              >
                {activeSetName === set.name ? t("playsets_btn_deployed") : t("playsets_btn_equip")}
              </button>
              
              <div className="grid grid-cols-4 gap-2">
                <button 
                  onClick={() => { if(setActivePlaySetIndex) setActivePlaySetIndex(idx); if(setIsBlueprintModalOpen) setIsBlueprintModalOpen(true); }} 
                  className="py-3 bg-black/40 border border-white/5 text-[var(--text)] rounded-xl hover:bg-white/10 transition-all flex items-center justify-center text-sm"
                  title="Edit Blueprint"
                >
                  {t("ui_icon_map")}
                </button>
                <button 
                  onClick={() => uploadBlueprintToCloud && uploadBlueprintToCloud(set.name)} 
                  className="py-3 bg-black/40 border border-white/5 text-[var(--text)] rounded-xl hover:bg-white/10 transition-all flex items-center justify-center text-sm"
                  title="Link"
                >
                  {t("ui_icon_link")}
                </button>
                <button 
                  onClick={() => exportPlaySet && exportPlaySet(set.name)} 
                  className="py-3 bg-black/40 border border-white/5 text-[var(--text)] rounded-xl hover:bg-white/10 transition-all flex items-center justify-center text-sm"
                  title="Export"
                >
                  {t("ui_icon_export")}
                </button>
                <button 
                  onClick={() => deletePlaySet && deletePlaySet(set.name)} 
                  className="py-3 bg-[var(--danger)] border border-[var(--danger)] text-white bg-opacity-20 hover:bg-opacity-40 transition-all flex items-center justify-center text-sm rounded-xl"
                  title="Delete"
                >
                  {t("ui_icon_trash")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
