import { useState, useEffect } from 'react';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useModalStore } from '../store/modalStore';
import { TabContainer } from './shared';
import { HoverTooltip } from '../shared';
import { supabase } from '../supabase';

export default function NetworkTab() {
  const { t } = useLexicon();
  const showImages = useStore((state) => state.showImages);
  const setShowImages = useStore((state) => state.setShowImages);
  const useInternalBrowser = useModalStore((state) => state.useInternalBrowser);
  const setUseInternalBrowser = useModalStore((state) => state.setUseInternalBrowser);

  const [localOnly, setLocalOnly] = useState(localStorage.getItem("sanctuary_local_only") === "true");
  const [shareMalwareReports, setShareMalwareReports] = useState(localStorage.getItem("sanctuary_share_malware_reports") === "true");

  const session = useStore((state) => state.session);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState("");

  useEffect(() => {
    if (session?.user?.id) {
       supabase.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', session.user.id).single()
         .then(({ data }) => {
            if (data?.is_comm_banned) {
               setIsBanned(true);
               setBanReason(data.comm_blacklist_reason || "Communications Ban");
            }
         });
    }
  }, [session]);

  const toggleLocalOnly = () => {
    const newVal = !localOnly;
    setLocalOnly(newVal);
    localStorage.setItem("sanctuary_local_only", newVal.toString());
  };

  return (
    <TabContainer title={t("settings_tab_network")} icon="public">
      <div className="grid xl:grid-cols-2 gap-8">
        <div className="flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={toggleLocalOnly}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("local_only")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("local_only_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${localOnly ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${localOnly ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>
        <div className="flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={() => setShowImages(!showImages)}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("show_images")}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("show_images_desc")}</span>
          </div>
          <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${showImages ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${showImages ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>
        <div className="flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel hover:theme-border-accent transition-all cursor-pointer group shadow-xl hover:scale-[1.02] active:scale-95" onClick={() => setUseInternalBrowser(!useInternalBrowser)}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] group-hover:theme-text-accent transition-colors">{t("settings_use_internal_browser") || "Internal Mod Browser"}</span>
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("use_internal_browser_desc") || "Use Sanctuary’s built-in browser for supported artifact/download pages."} <br></br> {t("use_internal_browser_desc2") || "Disable this to use your normal browser, extensions, adblockers, and download workflow."}
            </span>
          </div>
          <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${useInternalBrowser ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
            <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${useInternalBrowser ? 'translate-x-8' : 'translate-x-0'}`} />
          </div>
        </div>
        <div className="relative group/malware">
          <div className={`flex items-center justify-between p-8 rounded-[var(--radius)] theme-glass-panel transition-all ${!session || isBanned ? 'opacity-40 grayscale cursor-not-allowed' : 'hover:theme-border-accent cursor-pointer shadow-xl hover:scale-[1.02] active:scale-95'}`} onClick={() => {
            if (!session || isBanned) return;
            const val = !shareMalwareReports;
            setShareMalwareReports(val);
            localStorage.setItem("sanctuary_share_malware_reports", val.toString());
          }}>
            <div className="flex flex-col gap-2">
              <span className={`text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] transition-colors ${!session || isBanned ? '' : 'group-hover/malware:theme-text-accent'}`}>{t("malware_share_title")}</span>
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest leading-relaxed">{t("malware_share_desc")} <br></br> {t("malware_share_desc2")}</span>
            </div>
            <div className={`w-16 h-8 rounded-full transition-colors flex items-center p-1 shrink-0 ${shareMalwareReports ? 'theme-bg-accent shadow-[0_0_15px_var(--accent)]' : 'bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-[color-mix(in_srgb,var(--text)_20%,transparent)]'}`}>
              <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${shareMalwareReports ? 'translate-x-8' : 'translate-x-0'}`} />
            </div>
          </div>
          {(!session || isBanned) && (
            <HoverTooltip
              title={t("access_denied")}
              subtitle={isBanned ? `Communications Ban: ${banReason}` : t("auto_guest_mode_active_uploads_and_global_fla")}
              variant="danger"
              className="group-hover/malware:flex group-hover/malware:opacity-100 !-top-20"
            />
          )}
        </div>
      </div>
    </TabContainer>
  );
}
