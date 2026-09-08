import React, { useState, useRef, useEffect } from "react";
import { SidePanel, SidePanelActionFooter, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";
import { useModalStore } from "../store/modalStore";
import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";
import { relaunch } from "@tauri-apps/plugin-process";
import ReactMarkdown from "react-markdown";
import { openUrl } from '@tauri-apps/plugin-opener';
import remarkGfm from 'remark-gfm';
import MarkdownRenderer from "../MarkdownRenderer";

export function UpdateSidePanel() {
  const { t } = useLexicon();
  const { updatePayload, setUpdatePayload, isUpdatePanelOpen, setIsUpdatePanelOpen } = useModalStore();
  const setStatus = useStore((state) => state.setStatus);
  const [isInstalling, setIsInstalling] = useState(false);

  const [liveReleaseNotes, setLiveReleaseNotes] = useState<string | null>(null);

  useEffect(() => {
    if (updatePayload && isUpdatePanelOpen) {
      const version = updatePayload.version;
      const tag = version.startsWith('v') ? version : `v${version}`;
      fetch(`https://api.github.com/repos/Sanctuary-OS-Source-Code/SanctuaryOS/releases/tags/${tag}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.body) {
            setLiveReleaseNotes(data.body);
          }
        })
        .catch(err => console.error("Failed to fetch live release notes:", err));
    }
  }, [updatePayload, isUpdatePanelOpen]);



  if (!updatePayload) return null;

  return (
    <SidePanel
      isOpen={isUpdatePanelOpen}
      onClose={() => setIsUpdatePanelOpen(false)}
      title={t("update_panel_title")}
      subtitle={t("update_panel_subtitle")}
      icon="system_update_alt"
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[550px]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={isInstalling ? "sync" : "system_update_alt"}
            tooltip={isInstalling ? t("update_panel_installing") : t("update_panel_install")}
            variant="accent"
            disabled={isInstalling}
            className={isInstalling ? "animate-pulse" : ""}
            onClick={async () => {
              setIsInstalling(true);
              setStatus(t("status_downloading_update"));
              try {
                await updatePayload.downloadAndInstall((event: any) => {
                  if (event.event === 'Progress') {
                  }
                });
                setStatus(t("status_restarting"));
                await relaunch();
              } catch (e) {
                setStatus("UPDATE FAILED: " + e);
                setIsInstalling(false);
              }
            }}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-8 relative">

        <UniversalGroup
          className="animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out relative z-10"
          title={t("update_panel_ready")}
          icon="system_update_alt"
          headerColorClass="text-[rgba(56,189,248,0.8)]"
          innerClassName=""
        >
          <div className="flex items-center gap-4 group">
            <div className="w-12 h-12 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center relative z-10 transition-transform duration-500 group-hover:scale-110">
              <span className={`material-symbols-outlined !text-[24px] text-[var(--accent)] drop-shadow-sm ${isInstalling ? 'animate-pulse' : 'animate-bounce'}`}>{t("icon_downloading")}</span>
            </div>
            
            <div className="flex flex-col">
              <h3 className="text-2xl font-black capitalize tracking-tighter drop-shadow-sm relative z-10 transition-colors theme-text-accent leading-none">
                V{updatePayload.version}
              </h3>
              
              {updatePayload.date && (
                <p className="text-[10px] font-black capitalize tracking-[0.2em] text-[var(--accent)] opacity-60 relative z-10 mt-1.5 leading-none">
                  {new Date(updatePayload.date).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </UniversalGroup>

        <UniversalGroup
          className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150 ease-out fill-mode-both relative z-10 flex-1 min-h-0 flex flex-col"
          title={t("update_panel_notes")}
          icon="subject"
          headerColorClass="text-[rgba(255,255,255,0.8)]"
          innerClassName="flex-1 min-h-0 flex flex-col"
        >
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 relative z-10 markdown-body">
            {(liveReleaseNotes && liveReleaseNotes !== "See the assets to download this version and install.") || (updatePayload.body && updatePayload.body !== "See the assets to download this version and install.") ? (
              <MarkdownRenderer content={liveReleaseNotes || updatePayload.body} />
            ) : (
              <div className="text-center py-12 opacity-50 font-bold capitalize text-[10px] tracking-widest flex flex-col items-center gap-2">
                <span className="material-symbols-outlined !text-[24px]">{t("icon_visibility_off")}</span>
                {t("update_panel_no_notes")}
              </div>
            )}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
