import { invoke } from "@tauri-apps/api/core";
import { SidePanel } from "../shared";
import { useLexicon } from "../LexiconContext";
import { standardButtonClass, standardAccentGlassButtonClass } from "../shared";

export function DnaMatchQueueSidePanel({
  dnaMatchQueue,
  setDnaMatchQueue,
  ignoredHashesRef,
  runRadarSweep,
  setPlaySets,
  activePlaySetIndex,
  setStatus
}: any) {
  const { t } = useLexicon();

  return (
    <SidePanel
      isOpen={dnaMatchQueue.length > 0}
      onClose={() => setDnaMatchQueue([])}
      backdropZ="z-[115000]"
      panelZ="z-[115001]"
      title={t("overlay_dna_match_title")}
      subtitle={t("overlay_dna_match_desc")}
      icon="difference"
      widthClass="w-[550px]"
      footer={
        dnaMatchQueue.length > 1 ? (
          <div className="flex justify-center items-center gap-4 w-full">
            <button
              onClick={async () => {
                const queueCopy = [...dnaMatchQueue];
                setDnaMatchQueue([]);
                for (const match of queueCopy) {
                  try {
                    ignoredHashesRef.current.add(match.hash || match.path);
                    await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "ignore" });
                  } catch(e) {}
                }
                if (queueCopy.length > 0) runRadarSweep(true);
              }}
              className={standardButtonClass}
            >
              <span className="material-symbols-outlined !text-[18px]">{t("icon_delete")}</span>
              {t("btn_keep_all_old")}
            </button>
            <button
              onClick={async () => {
                const queueCopy = [...dnaMatchQueue];
                setDnaMatchQueue([]);
                for (const match of queueCopy) {
                  try {
                    await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "replace" });
                    if (match.existing_name) {
                      const oldName = match.existing_name.split(/[/\\]/).pop();
                      const newName = match.path.split(/[/\\]/).pop();
                      if (oldName && newName && oldName !== newName && setPlaySets) {
                        setPlaySets((prev: any) => prev.map((s: any, idx: number) => {
                          if (idx === activePlaySetIndex) {
                            return { ...s, mods: s.mods.filter((m: string) => m !== oldName) };
                          }
                          return s;
                        }));
                      }
                    }
                  } catch(e) {}
                }
                if (queueCopy.length > 0) runRadarSweep(true);
              }}
              className={standardAccentGlassButtonClass}
            >
              <span className="material-symbols-outlined !text-[18px]">{t("icon_merge")}</span>
              {t("btn_replace_all")}
            </button>
          </div>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {dnaMatchQueue.map((match: any, index: number) => (
          <div key={index} className="w-full theme-glass-inner border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl p-5 flex flex-col gap-4 shadow-inner text-left hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all">
             <div className="flex flex-col gap-1">
               <span className="text-[9px] font-black theme-text-accent uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_call_received")}</span>
                  {t("overlay_dna_incoming")}
               </span>
               <span className="text-sm font-black text-[var(--text)] truncate opacity-90">{match.path?.split(/[\\/]/).pop()?.replace('.tmp_sanctuary_conflict', '')}</span>
             </div>
             
             <div className="flex flex-col gap-1">
               <span className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[14px]">{t("icon_inventory_2")}</span>
                  {t("overlay_dna_existing")}
               </span>
               <span className="text-sm font-medium text-[var(--subtext)] opacity-80 truncate">{match.existing_name ? match.existing_name.split(/[\\/]/).pop() : 'Unknown'}</span>
             </div>
             <div className="flex justify-center items-center gap-3 w-full mt-4">
               <button
                 onClick={async () => {
                   try {
                     ignoredHashesRef.current.add(match.hash || match.path);
                     await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "ignore" });
                     if (dnaMatchQueue.length === 1 && match.source_action === "radar_sweep") runRadarSweep(true);
                   } catch (e: any) { console.error("Error ignoring:", e); }
                   setDnaMatchQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                 }}
                 className={standardButtonClass}
               >
                 <span className="material-symbols-outlined !text-[16px]">{t("icon_delete")}</span>
                 {t("btn_keep_old")}
               </button>
               <button
                 onClick={async () => {
                   try {
                     await invoke("resolve_dna_match", { path: match.path, existingName: match.existing_name, action: "replace" });
                     if (dnaMatchQueue.length === 1) runRadarSweep(true);
                   } catch (e: any) { setStatus(`Error replacing file: ${e}`); }
                   setDnaMatchQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));
                 }}
                 className={standardAccentGlassButtonClass}
               >
                 <span className="material-symbols-outlined !text-[16px]">{t("icon_merge")}</span>
                 {t("btn_replace")}
               </button>
             </div>
          </div>
        ))}
      </div>
    </SidePanel>
  );
}
