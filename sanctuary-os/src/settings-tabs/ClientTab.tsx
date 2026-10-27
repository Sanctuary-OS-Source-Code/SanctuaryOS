import { useState, useEffect } from 'react';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useModalStore } from '../store/modalStore';
import { getActiveGameClient } from '../supabase';
import { HoverTooltip } from '../shared';
import { isDesktop } from '../utils/envUtils';
import { TabContainer, SettingsGrid, SettingsToggle, CustomSettingsDropdown } from './shared';
import { UniversalCard } from '../components/universal/UniversalCard';

export default function ClientTab({ config, updateConfig }: any) {
  const { t } = useLexicon();
  const showImages = useStore((state) => state.showImages);
  const setShowImages = useStore((state) => state.setShowImages);
  const useInternalBrowser = useModalStore((state) => state.useInternalBrowser);
  const setUseInternalBrowser = useModalStore((state) => state.setUseInternalBrowser);

  const [localOnly, setLocalOnly] = useState(localStorage.getItem("sanctuary_local_only") === "true");
  const [shareMalwareReports, setShareMalwareReports] = useState(localStorage.getItem("sanctuary_share_malware_reports") === "true");
  const [ingestFileMode, setIngestFileMode] = useState<"copy" | "move">(() => {
    const saved = localStorage.getItem("sanctuary_ingest_file_mode");
    if (saved === "move" || saved === "copy") return saved;
    if (config?.ingest_file_mode === "move" || config?.ingest_file_mode === "copy") {
      return config.ingest_file_mode;
    }
    return "copy";
  });

  useEffect(() => {
    if (config?.ingest_file_mode && !localStorage.getItem("sanctuary_ingest_file_mode")) {
      const mode = config.ingest_file_mode === "move" ? "move" : "copy";
      setIngestFileMode(mode);
      localStorage.setItem("sanctuary_ingest_file_mode", mode);
    }
  }, [config?.ingest_file_mode]);

  const handleIngestFileModeChange = (val: "copy" | "move") => {
    const mode = val === "move" ? "move" : "copy";
    setIngestFileMode(mode);
    localStorage.setItem("sanctuary_ingest_file_mode", mode);
    if (typeof updateConfig === "function") {
      updateConfig("ingest_file_mode", mode);
    }
  };

  const session = useStore((state) => state.session);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState("");

  useEffect(() => {
    const gameClient = getActiveGameClient();
    if (session?.user?.id && gameClient) {
       gameClient.from('profiles').select('is_comm_banned, comm_blacklist_reason').eq('id', session.user.id).maybeSingle()
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
    <TabContainer title={t("tab_preferences", "Preferences")} icon={t("icon_tune", "tune")}>
      <SettingsGrid>
        <UniversalCard
          title={t("settings_ingest_file_mode_title", "Drag & Drop File Behavior")}
          subtitle={t(
            "settings_ingest_file_mode_desc",
            "Choose whether dragged and dropped {mod} files and archives are copied into your {Vault} or moved (automatically cleaning up the original source file after import)."
          )}
          icon={t("icon_drive_file_move", "drive_file_move")}
        >
          <CustomSettingsDropdown
            value={ingestFileMode}
            onChange={(val: any) => handleIngestFileModeChange(val)}
            options={[
              {
                id: "copy",
                label: t("settings_ingest_mode_copy", "Copy Original (Keep Source File)"),
              },
              {
                id: "move",
                label: t("settings_ingest_mode_move", "Move Original (Auto-Clean Source)"),
              },
            ]}
          />
        </UniversalCard>

        <UniversalCard 
          title={t("local_only", "Local Network Only")} 
          subtitle={t("local_only_desc", "Block external uploads/downloads. Strict offline mode.")} 
          icon={t("icon_wifi_off", "wifi_off")}
          onClick={toggleLocalOnly}
          actions={<SettingsToggle checked={localOnly} />}
        />
        
        <UniversalCard 
          title={t("show_images", "Show {Mod} Images")} 
          subtitle={t("show_images_desc", "Display cover images on {mod} cards and profiles.")} 
          icon="image"
          onClick={() => setShowImages(!showImages)}
          actions={<SettingsToggle checked={showImages} />}
        />
        
        {isDesktop() && (
          <UniversalCard 
            title={t("settings_use_internal_browser", "Use the Sanctuary Browser")} 
            subtitle={`${t("use_internal_browser_desc", "Use Sanctuary's built-in web browser for supported {Mod} download pages.")} ${t("use_internal_browser_desc2", "Disable this to use your normal browser, extensions, adblockers, and download workflow.")}`} 
            icon="language"
            onClick={() => setUseInternalBrowser(!useInternalBrowser)}
            actions={<SettingsToggle checked={useInternalBrowser} />}
          />
        )}

        <div className="relative group/malware">
          <UniversalCard 
            title={t("malware_share_title", "Share Malware Reports")} 
            subtitle={`${t("malware_share_desc", "Send your local quarantine manifests to the Admins for analysis and malware activity updates.")} ${t("malware_share_desc2", "All manifests are strickly metadata only and contain no personal or any identifying information.")}`} 
            icon="security"
            onClick={() => {
              if (!session || isBanned) return;
              const val = !shareMalwareReports;
              setShareMalwareReports(val);
              localStorage.setItem("sanctuary_share_malware_reports", val.toString());
            }}
            actions={
              <div className={`${!session || isBanned ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}>
                <SettingsToggle checked={shareMalwareReports} />
              </div>
            }
          />
          {(!session || isBanned) && (
            <HoverTooltip
              title={t("access_denied", "Access Denied")}
              subtitle={isBanned ? `Communications Ban: ${banReason}` : t("auto_guest_mode_active_45", "Guest Mode Active")}
              variant="danger"
              className="group-hover/malware:flex group-hover/malware:opacity-100"
            />
          )}
        </div>

        <UniversalCard 
          title={t("btn_reset_all_local", "Reset All Local Overrides")} 
          subtitle={t("reset_all_local_desc", "Permanently clear all locally saved metadata overrides for all {mods}.")} 
          icon="delete_forever"
          statusColor="border-red-500"
          onClick={() => {
            localStorage.removeItem('sanctuary_local_overrides');
            useStore.getState().pushStatus(t("local_overrides_cleared", "All local metadata overrides have been cleared."));
          }}
          actions={
            <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] flex items-center justify-center transition-all shadow-inner backdrop-blur-md">
              <span className="material-symbols-outlined !text-[20px]">warning</span>
            </div>
          }
        />
      </SettingsGrid>
    </TabContainer>
  );
}


