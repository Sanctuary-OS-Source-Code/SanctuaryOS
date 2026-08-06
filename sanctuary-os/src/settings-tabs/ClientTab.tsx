import { useState, useEffect } from 'react';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useModalStore } from '../store/modalStore';
import { supabase } from '../supabase';
import { HoverTooltip } from '../shared';
import { TabContainer, SettingsGrid, SettingCard, SettingsToggle } from './shared';

export default function ClientTab() {
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
    <TabContainer title={t("tab_preferences") || "Preferences"} icon="tune">
      <SettingsGrid>
        <SettingCard 
          title={t("local_only")} 
          description={t("local_only_desc")} 
          icon="wifi_off"
          onClick={toggleLocalOnly}
          action={<SettingsToggle checked={localOnly} />}
        />
        
        <SettingCard 
          title={t("show_images")} 
          description={t("show_images_desc")} 
          icon="image"
          onClick={() => setShowImages(!showImages)}
          action={<SettingsToggle checked={showImages} />}
        />
        
        <SettingCard 
          title={t("settings_use_internal_browser") || "Internal Mod Browser"} 
          description={`${t("use_internal_browser_desc") || "Use Sanctuary’s built-in browser for supported artifact/download pages."} ${t("use_internal_browser_desc2") || "Disable this to use your normal browser, extensions, adblockers, and download workflow."}`} 
          icon="language"
          onClick={() => setUseInternalBrowser(!useInternalBrowser)}
          action={<SettingsToggle checked={useInternalBrowser} />}
        />

        <div className="relative group/malware">
          <SettingCard 
            title={t("malware_share_title")} 
            description={`${t("malware_share_desc")} ${t("malware_share_desc2")}`} 
            icon="security"
            onClick={() => {
              if (!session || isBanned) return;
              const val = !shareMalwareReports;
              setShareMalwareReports(val);
              localStorage.setItem("sanctuary_share_malware_reports", val.toString());
            }}
            action={
              <div className={`${!session || isBanned ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}>
                <SettingsToggle checked={shareMalwareReports} />
              </div>
            }
          />
          {(!session || isBanned) && (
            <HoverTooltip
              title={t("access_denied")}
              subtitle={isBanned ? `Communications Ban: ${banReason}` : t("auto_guest_mode_active_45")}
              variant="danger"
              className="group-hover/malware:flex group-hover/malware:opacity-100"
            />
          )}
        </div>

        <SettingCard 
          title={t("btn_reset_all_local")} 
          description={t("reset_all_local_desc")} 
          icon="delete_forever"
          danger
          onClick={() => {
            localStorage.removeItem('sanctuary_local_overrides');
            useStore.getState().pushStatus(t("local_overrides_cleared") || "All local overrides have been cleared.");
          }}
          action={
            <div className="w-10 h-10 rounded-xl bg-[var(--danger)]/10 text-[var(--danger)] flex items-center justify-center transition-all shadow-inner backdrop-blur-md">
              <span className="material-symbols-outlined !text-[20px]">warning</span>
            </div>
          }
        />
      </SettingsGrid>
    </TabContainer>
  );
}
