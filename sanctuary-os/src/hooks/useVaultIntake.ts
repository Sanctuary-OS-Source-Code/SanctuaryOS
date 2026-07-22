import { useState, useEffect, useRef } from "react";
import { tauriBridge } from "../lib/tauri-bridge";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";

export function useVaultIntake(runRadarSweep: (silent?: boolean, forceDetect?: boolean) => void) {
  const [isDropzoneOpen, setIsDropzoneOpen] = useState(false);
  const [dropzoneState, setDropzoneState] = useState<"awaiting" | "received" | "ingesting">("awaiting");
  const { setStatus, activeGameSchema } = useStore();
  const { setIngestProgress } = useModalStore();
  const { t } = useLexicon();
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [dnaMatchQueue, setDnaMatchQueue] = useState<any[]>([]);
  const ignoredHashesRef = useRef<Set<string>>(new Set());

  const handleDroppedFiles = async (paths: string[]): Promise<boolean> => {
    setDropzoneState("ingesting");
    setStatus(
      `${t("status_mass_ingestion_prefix")}${paths.length}${t("status_mass_ingestion_suffix")}`,
    );
    let hasMalware = false;
    try {
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

      for (let i = 0; i < paths.length; i++) {
        setIngestProgress({ active: true, current: i + 1, total: paths.length });
        try {
          await invoke("ingest_dropped_file", { path: paths[i], forceReplace: false, targetFolder: groupFolder });
          needsSweep = true;
        } catch (err) {
          if (err === "DNA_MATCH") {
          } else if (err === "MALWARE") {
            hasMalware = true;
          } else {
            setStatus(`${t("status_link_failed")}${err}`);
          }
        }
      }
      setStatus(t("status_ingest_success"));
      if (needsSweep) {
        runRadarSweep(true, true); 
      }
      return hasMalware;
    } catch (err) {
      setStatus(`${t("status_link_failed")}${err}`);
      return hasMalware;
    }
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    tauriBridge.setupDragDrop(
      () => setIsDragging(true),
      () => setIsDragging(false),
      (paths) => {
        setIsDragging(false);
        const schemaFeatures = activeGameSchema?.features || { has_cc: true };
        if (!schemaFeatures.has_cc) {
          setStatus(t("status_not_supported") || "Active game does not support custom content intake.");
          return;
        }
        if (paths && paths.length > 0) {
          setDroppedFiles(paths);
          setIsDropzoneOpen(true);
          setDropzoneState("received");
          handleDroppedFiles(paths);
        }
      }
    ).then(unlisten => {
      cleanup = unlisten;
    }).catch(console.error);

    return () => {
      if (cleanup) cleanup();
    };
  }, [handleDroppedFiles]);

  useEffect(() => {
    let unlisten: any;
    tauriBridge.listenToDnaMatch((payload: any) => {
      if (payload.hash && ignoredHashesRef.current.has(payload.hash)) return;
      setDnaMatchQueue((prev: any[]) => {
        if (prev.some(m => (m.hash && m.hash === payload.hash) || m.path === payload.path)) return prev;
        return [...prev, payload];
      });
    }).then((handler: any) => { unlisten = handler; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  return {
    handleDroppedFiles,
    isDropzoneOpen, setIsDropzoneOpen,
    dropzoneState, setDropzoneState,
    isDragging,
    droppedFiles,
    dnaMatchQueue, setDnaMatchQueue,
    ignoredHashesRef
  };
}
