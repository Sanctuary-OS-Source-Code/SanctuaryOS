import { useState, useEffect, useRef } from "react";
import { tauriBridge } from "../lib/tauri-bridge";

export function useVaultIntake(handleDroppedFiles: (paths: string[]) => void) {
  const [isDropzoneOpen, setIsDropzoneOpen] = useState(false);
  const [dropzoneState, setDropzoneState] = useState<"awaiting" | "received">("awaiting");
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [dnaMatchQueue, setDnaMatchQueue] = useState<any[]>([]);
  const ignoredHashesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    tauriBridge.setupDragDrop(
      () => setIsDragging(true),
      () => setIsDragging(false),
      (paths) => {
        setIsDragging(false);
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
    isDropzoneOpen, setIsDropzoneOpen,
    dropzoneState, setDropzoneState,
    isDragging,
    droppedFiles,
    dnaMatchQueue, setDnaMatchQueue,
    ignoredHashesRef
  };
}
