import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { ModData } from "../shared";

export function useModActions(
  openUrl: (url: string) => void, 
  fetchVault: () => void,
  runRadarSweep: (silent?: boolean) => Promise<void>,
  activeSetName: string | null,
  equipPlaySet: (setName: string) => Promise<void>,
  setShelterActive: (active: boolean) => void
) {
  const { setStatus, activeGameSchema } = useStore();
  const { 
    useInternalBrowser, setIsSideBrowserOpen, setSideBrowserUrl, 
    setConfirmDialog
  } = useModalStore();
  const { t } = useLexicon();

  function handleSmartSearch(mod: ModData) {
    if (!mod) return;
    const cleanName = (mod.displayName || mod.name)
      .replace(/\.[^/.]+$/, "");
    const targetUrl =
      mod.url && mod.url.trim() !== ""
        ? mod.url.startsWith("http")
          ? mod.url
          : `https://${mod.url}`
        : `https://www.google.com/search?q=${encodeURIComponent(activeGameSchema?.display_name || "Mod")}+${encodeURIComponent(cleanName)}`;
    
    if (useInternalBrowser) {
      setSideBrowserUrl(targetUrl);
      setIsSideBrowserOpen(true);
    } else {
      openUrl(targetUrl);
    }
    setStatus(`${t("status_intel_request")}${cleanName}`);
  }

  async function runSanitization() {
    try {
      setStatus(t("status_sanitizing"));
      const config: any = await invoke("get_saved_coordinates");
      const msg = await invoke<string>("sanitize_vault", {
        vaultPath: config.vault_path,
      });
      setStatus(`${t("icon_check_circle")} ${t("backend_sanitize_prefix")} ${msg} ${t("backend_sanitize_suffix")}`);
      await runRadarSweep(false);
    } catch (err) {
      setStatus(`${t("status_sanitize_error")}${err}`);
    }
  }

  async function triggerShelter(active: boolean) {
    setStatus(active ? t("status_evacuating") : t("status_restoring_bunker"));
    try {
      if (active) {
        let msg = await invoke("wipe_symlinks");
        setStatus(t(msg as string) || (msg as string));
      } else {
        if (activeSetName) await equipPlaySet(activeSetName);
        setStatus(t("status_bunker_reclaimed"));
      }
      setShelterActive(active);
    } catch (err) {
      setStatus(`${t("status_shelter_error")}${err}`);
    }
  }

  async function restoreMod(filename: string) {
    await invoke("restore_quarantined_file", { filename });
    fetchVault();
    runRadarSweep(false);
  }

  function purgeMod(filename: string) {
    setConfirmDialog({
      message: `${t("action_delete")}${filename}${t("confirm_delete_file_suffix")}`,
      action: async () => {
        setConfirmDialog(null);
        await invoke("purge_quarantined_file", { filename });
        fetchVault();
      },
    });
  }

  return { handleSmartSearch, runSanitization, triggerShelter, restoreMod, purgeMod };
}
