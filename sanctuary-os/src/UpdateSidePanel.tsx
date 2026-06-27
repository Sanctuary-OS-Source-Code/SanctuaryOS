import React, { useState } from "react";
import { SidePanel } from "./shared";
import { useModalStore } from "./store/modalStore";
import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { relaunch } from "@tauri-apps/plugin-process";
import ReactMarkdown from "react-markdown";

export function UpdateSidePanel() {
  const { t } = useLexicon();
  const { updatePayload, setUpdatePayload } = useModalStore();
  const setStatus = useStore((state) => state.setStatus);
  const [isInstalling, setIsInstalling] = useState(false);

  if (!updatePayload) return null;

  return (
    <SidePanel
      isOpen={true}
      onClose={() => setUpdatePayload(null)}
      title={t("update_panel_title")}
      subtitle={t("update_panel_subtitle")}
      icon="system_update"
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[550px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      ambientGlows={
        <>
          <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent)] opacity-20 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[var(--text)] opacity-10 blur-[120px] rounded-full pointer-events-none" />
        </>
      }
    >
      <div className="flex flex-col gap-8 h-full">
        {/* Update Banner */}
        <div className="theme-glass-panel border border-white/5 rounded-3xl p-8 shadow-lg relative overflow-hidden group/card shrink-0 flex flex-col items-center text-center gap-4">
           <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
           
           <div className="w-24 h-24 rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-4 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_40px_rgba(var(--accent-rgb),0.3)] flex items-center justify-center relative z-10 mb-2">
             <span className={`material-symbols-outlined !text-[48px] text-[var(--accent)] ${isInstalling ? 'animate-pulse' : 'animate-bounce'}`}>{t("ui_icon_downloading")}</span>
           </div>
           
           <h3 className="text-3xl font-black uppercase tracking-widest text-[var(--text)] drop-shadow-md relative z-10">
             {t("update_version")} {updatePayload.version}
           </h3>
           <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--subtext)] opacity-80 relative z-10">
             {t("update_panel_ready")}
           </p>
           {updatePayload.date && (
             <p className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] opacity-60 relative z-10">
               {new Date(updatePayload.date).toLocaleDateString()}
             </p>
           )}
        </div>

        {/* Release Notes */}
        <div className="theme-glass-panel border border-white/5 rounded-3xl p-8 shadow-lg relative overflow-hidden group/card flex-1 flex flex-col min-h-0">
           <div className="flex items-center gap-4 mb-6 relative z-10 shrink-0">
             <div className="w-10 h-10 rounded-[0.85rem] bg-black/20 flex items-center justify-center border border-white/10 shadow-inner text-[var(--text)]">
               <span className="material-symbols-outlined !text-[20px]">{t("ui_icon_subject")}</span>
             </div>
             <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] drop-shadow-md">{t("update_panel_notes")}</h3>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 relative z-10 prose prose-invert prose-sm max-w-none text-[var(--text)]/80 marker:text-[var(--accent)]">
             {updatePayload.body ? (
               <ReactMarkdown>{updatePayload.body}</ReactMarkdown>
             ) : (
               <div className="text-center py-12 opacity-50 font-bold uppercase text-[10px] tracking-widest flex flex-col items-center gap-2">
                 <span className="material-symbols-outlined !text-[24px]">{t("ui_icon_visibility_off")}</span>
                 {t("update_panel_no_notes")}
               </div>
             )}
           </div>
        </div>
        
        {/* Action Button */}
        <div className="pt-4 border-t border-white/5 shrink-0 relative z-10">
          <button
            disabled={isInstalling}
            onClick={async () => {
              setIsInstalling(true);
              setStatus(t("status_downloading_update"));
              try {
                await updatePayload.downloadAndInstall((event: any) => {
                   if (event.event === 'Progress') {
                      // We could update a progress bar here, but setStatus is enough for now
                   }
                });
                setStatus(t("status_restarting"));
                await relaunch();
              } catch (e) {
                setStatus("UPDATE FAILED: " + e);
                setIsInstalling(false);
              }
            }}
            className="w-full h-16 rounded-[1.5rem] font-black uppercase tracking-[0.2em] transition-all shadow-[0_10px_40px_rgba(var(--accent-rgb),0.3)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          >
            {isInstalling ? (
              <>
                <span className="material-symbols-outlined !text-[28px] animate-spin">{t("ui_icon_refresh")}</span>
                {t("update_panel_installing")}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined !text-[28px]">{t("ui_icon_system_update_alt")}</span>
                {t("update_panel_install")}
              </>
            )}
          </button>
        </div>
      </div>
    </SidePanel>
  );
}
