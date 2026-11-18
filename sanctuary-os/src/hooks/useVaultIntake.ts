import { useState, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { installDroppedJsonAssets } from "../utils/jsonAssetDropInstaller";
import { invoke } from "@tauri-apps/api/core";

export function useVaultIntake(runRadarSweep: (silent?: boolean, forceDetect?: boolean) => void) {
  const [isDropzoneOpen, setIsDropzoneOpen] = useState(false);
  const [dropzoneState, setDropzoneState] = useState<"awaiting" | "received" | "ingesting">("awaiting");
  const { setStatus, pushStatus, activeGameSchema } = useStore(
    useShallow((s) => ({
      setStatus: s.setStatus,
      pushStatus: s.pushStatus,
      activeGameSchema: s.activeGameSchema,
    }))
  );
  const setIngestProgress = useModalStore((s) => s.setIngestProgress);
  const { t, importLexicon } = useLexicon();
  const { importTheme } = useTheme();
  const [isDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [dnaMatchQueue, setDnaMatchQueue] = useState<any[]>([]);
  const [edgeOverrideQueue, setEdgeOverrideQueue] = useState<any[]>([]);
  const ignoredHashesRef = useRef<Set<string>>(new Set());

  const handleDroppedFiles = async (rawPaths: string[]): Promise<boolean> => {
    const jsonResult = await installDroppedJsonAssets(rawPaths, {
      importTheme,
      importLexicon,
      t,
    });
    const paths = jsonResult.remainingPaths;

    if (paths.length === 0) {
      if (jsonResult.handledCount > 0) {
        const msg = `${t("status_os_assets_installed", "Installed:")} ${jsonResult.summaryLabels.join(", ")}`;
        setStatus(msg);
        pushStatus(msg, "success");
      }
      setIngestProgress({ active: false, current: 0, total: 0 });
      setDropzoneState("awaiting");
      setIsDropzoneOpen(false);
      return false;
    }

    const schemaFeatures = activeGameSchema?.features || { has_cc: true };
    if (!schemaFeatures.has_cc) {
      setStatus(t("status_not_supported", "Active game does not support custom content intake."));
      return false;
    }

    setDroppedFiles(paths);
    if (typeof useModalStore.getState().setDroppedFiles === "function") {
      useModalStore.getState().setDroppedFiles(paths);
    }
    setDropzoneState("ingesting");
    setStatus(
      `${t("status_mass_ingestion_prefix", "MASS INGESTION: Unifying")}${paths.length}${t("status_mass_ingestion_suffix", "unique identities...")}`,
    );
    let hasMalware = false;
    try {
      try {
        const cachedVerified: string[] = JSON.parse(
          localStorage.getItem("sanctuary_verified_hashes") || "[]"
        );
        const cachedMalware: string[] = JSON.parse(
          localStorage.getItem("sanctuary_malware_hashes") || "[]"
        );
        await invoke("sync_security_definitions", {
          malware: cachedMalware,
          tier2: cachedVerified,
        }).catch(() => {});
      } catch {}

      const moveOriginal =
        (localStorage.getItem("sanctuary_ingest_file_mode") || "copy") === "move";
      let needsSweep = false;
      
      let groupFolder: string | undefined = undefined;
      if (paths.length > 1) {
         const genericNames = ["data", "scripts", "cfg", "config", "mod", "mods"];
         const bestPath = paths.find(p => {
            const name = p.split(/[\\/]/).pop()?.toLowerCase();
            return name && !genericNames.includes(name);
         });
         const fallback = paths[0];
         const nameToUse = (bestPath || fallback).split(/[\\/]/).pop();
         if (nameToUse) {
            groupFolder = nameToUse.replace(new RegExp(`\\.(zip|rar|7z|${(activeGameSchema?.extensions?.supported || []).map((e: any) => e.replace('.', '')).join('|') || '[a-z0-9]+'})$`, 'i'), '');
         }
      }

      let successCount = 0;
      let wizardCount = 0;
      let lastError = "";

      let dnaMatchCount = 0;
      for (let i = 0; i < paths.length; i++) {
        setIngestProgress({ active: true, current: i + 1, total: paths.length });
        try {
          const resStr = await invoke<string>("ingest_dropped_file", {
            path: paths[i],
            forceReplace: false,
            targetFolder: groupFolder,
            moveOriginal,
          });
          let handledAsWizard = false;
          if (typeof resStr === "string" && resStr.trim().startsWith("{")) {
            try {
              const parsed = JSON.parse(resStr);
              if (parsed?.__fomod_wizard && parsed?.plan?.session_id) {
                useModalStore.getState().enqueueInstallerWizard(parsed.plan);
                handledAsWizard = true;
                wizardCount++;
              }
            } catch {}
          }
          if (!handledAsWizard) {
            needsSweep = true;
            successCount++;
          }
        } catch (err) {
          if (err === "DNA_MATCH" || err === "SETTINGS_CONFLICT" || err === "ZIP_DNA_MATCH") {
            dnaMatchCount++;
          } else if (err === "MALWARE") {
            hasMalware = true;
          } else {
            lastError = String(err);
          }
        }
      }
      
      if (successCount > 0) {
        setStatus(t("status_ingest_success", "{Mods} Imported Successfully!"));
      } else if (wizardCount > 0) {
        setStatus(t("fomod_wizard_awaiting_choices", "Installer wizard ready — select package options to complete import."));
      } else if (lastError) {
        setStatus(`${t("status_link_failed", "Link Failed:")}${lastError}`);
      } else if (dnaMatchCount > 0) {
        setStatus(""); 
      } else if (jsonResult.handledCount > 0) {
        setStatus(`${t("status_os_assets_installed", "Installed:")} ${jsonResult.summaryLabels.join(", ")}`);
      } else {
        setStatus(t("status_no_files_ingested", "No files were ingested.")); 
      }

      if (needsSweep) {
        runRadarSweep(true, true); 
      }
      return hasMalware;
    } catch (err) {
      setStatus(`${t("err_save_failed", "Save failed:")}${err}`);
      return hasMalware;
    }
  };



  return {
    handleDroppedFiles,
    isDropzoneOpen, setIsDropzoneOpen,
    dropzoneState, setDropzoneState,
    isDragging,
    droppedFiles,
    dnaMatchQueue, setDnaMatchQueue,
    edgeOverrideQueue, setEdgeOverrideQueue,
    ignoredHashesRef
  };
}
