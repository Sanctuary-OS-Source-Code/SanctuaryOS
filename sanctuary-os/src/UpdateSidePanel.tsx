import React, { useState, useRef } from "react";
import { SidePanel } from "./shared";
import { useModalStore } from "./store/modalStore";
import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { relaunch } from "@tauri-apps/plugin-process";
import ReactMarkdown from "react-markdown";

function SectionHeader({ icon, title, glowColor }: { icon: string, title: string, glowColor: string }) {
  return (
    <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--subtext)] opacity-60 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-2 flex items-center gap-2">
      <span className="material-symbols-outlined !text-[14px]" style={{ color: glowColor }}>{icon}</span>
      <span className="drop-shadow-sm">{title}</span>
    </h3>
  );
}

export function UpdateSidePanel() {
  const { t } = useLexicon();
  const { updatePayload, setUpdatePayload, isUpdatePanelOpen, setIsUpdatePanelOpen } = useModalStore();
  const setStatus = useStore((state) => state.setStatus);
  const [isInstalling, setIsInstalling] = useState(false);
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  if (!updatePayload) return null;

  return (
    <SidePanel
      isOpen={isUpdatePanelOpen}
      onClose={() => setIsUpdatePanelOpen(false)}
      title={t("update_panel_title")}
      subtitle={t("update_panel_subtitle")}
      icon="system_update"
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[550px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-8 relative">
        
        {/* Update Banner */}
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out relative z-10">
          <SectionHeader icon="system_update_alt" title={t("update_panel_ready")} glowColor="rgba(56,189,248,0.8)" />
          
          <div 
            ref={boxRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="theme-glass-inner p-8 rounded-xl border flex flex-col items-center justify-center gap-4 transition-all duration-300 relative overflow-hidden group theme-border-accent bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:shadow-[0_4px_20px_rgba(var(--accent-rgb),0.1)] text-center"
          >
            {/* Spotlight Effect */}
            <div 
              className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-0 mix-blend-screen"
              style={{
                opacity: isHovered ? 1 : 0,
                background: `radial-gradient(150px circle at ${mousePos.x}px ${mousePos.y}px, rgba(56,189,248,0.15), transparent 80%)`
              }}
            />
            
            {/* Base Shimmer Sweep */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none z-0" />
            
            <div className="w-20 h-20 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center relative z-10 mb-2 transition-transform duration-500 group-hover:scale-110">
              <span className={`material-symbols-outlined !text-[40px] text-[var(--accent)] drop-shadow-sm ${isInstalling ? 'animate-pulse' : 'animate-bounce'}`}>{t("ui_icon_downloading")}</span>
            </div>
            
            <h3 className="text-3xl font-black uppercase tracking-tighter drop-shadow-sm relative z-10 transition-colors theme-text-accent">
              V{updatePayload.version}
            </h3>
            
            {updatePayload.date && (
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)] opacity-60 relative z-10 mt-1">
                {new Date(updatePayload.date).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* Release Notes */}
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150 ease-out fill-mode-both relative z-10 flex-1 min-h-0">
          <SectionHeader icon="subject" title={t("update_panel_notes")} glowColor="rgba(255,255,255,0.8)" />
          
          <div className="theme-glass-inner p-6 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:shadow-lg relative overflow-hidden group flex-1 flex flex-col">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />
            
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
        </div>
        
        {/* Action Button */}
        <div className="pt-2 shrink-0 relative z-10 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300 ease-out fill-mode-both">
          <button
            disabled={isInstalling}
            onClick={async () => {
              setIsInstalling(true);
              setStatus(t("status_downloading_update"));
              try {
                await updatePayload.downloadAndInstall((event: any) => {
                   if (event.event === 'Progress') {
                      // We could update a progress bar here
                   }
                });
                setStatus(t("status_restarting"));
                await relaunch();
              } catch (e) {
                setStatus("UPDATE FAILED: " + e);
                setIsInstalling(false);
              }
            }}
            className="w-full h-14 rounded-xl font-black uppercase tracking-[0.2em] transition-all theme-glass-inner theme-border-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_4px_20px_rgba(var(--accent-rgb),0.15)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 theme-text-accent"
          >
            {isInstalling ? (
              <>
                <span className="material-symbols-outlined !text-[20px] animate-spin">{t("ui_icon_refresh")}</span>
                {t("update_panel_installing")}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined !text-[20px] transition-transform duration-500 group-hover:scale-110">{t("ui_icon_system_update_alt")}</span>
                {t("update_panel_install")}
              </>
            )}
          </button>
        </div>

      </div>
    </SidePanel>
  );
}
