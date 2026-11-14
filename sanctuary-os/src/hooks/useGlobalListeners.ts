import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { tauriBridge } from "../lib/tauri-bridge";

export function useGlobalListeners(
  fetchBackups: () => void,
  _askCustom: any,
  _t: (k: string, fallback?: string) => string,
  _triggerPrePatchSnapshot: () => void,
  _triggerFullEngineBackup: () => void,
  ignoredHashesRef?: { current: Set<string> }
) {
  const { setScanProgress, setBackupProgress } = useStore(
    useShallow((s) => ({
      setScanProgress: s.setScanProgress,
      setBackupProgress: s.setBackupProgress,
    }))
  );
  const setDnaMatchQueue = useModalStore((s) => s.setDnaMatchQueue);

  useEffect(() => {
    let cancelled = false;
    let unlisten: any = null;
    let vaultTimeout: any = null;
    const accumulatedPaths: Set<string> = new Set();

    tauriBridge.listenToVaultChanges((path?: string) => {
      if (
        typeof localStorage !== "undefined" &&
        localStorage.getItem("sanctuary_live_vault_watcher_enabled") === "false"
      ) {
        return;
      }
      const modalState = useModalStore.getState();
      if (modalState.isScanning || modalState.isSilentScanning) {
        return;
      }

      if (path) {
        const normalized = path.replace(/\\/g, '/');
        const lower = normalized.toLowerCase();
        if (
          lower.endsWith('.json') ||
          lower.endsWith('.db') ||
          lower.endsWith('.db-journal') ||
          lower.endsWith('.db-wal') ||
          lower.endsWith('.db-shm') ||
          lower.includes('/blueprints/') ||
          lower.includes('/quarantine/') ||
          lower.includes('/.sanctuary_quarantine/') ||
          lower.includes('/data/') ||
          lower.includes('/backups/')
        ) {
          return;
        }
        accumulatedPaths.add(normalized);
      }

      if (vaultTimeout) {
        clearTimeout(vaultTimeout);
      }
      vaultTimeout = setTimeout(() => {
        const currentModalState = useModalStore.getState();
        if (currentModalState.isScanning || currentModalState.isSilentScanning) {
          accumulatedPaths.clear();
          return;
        }

        if (accumulatedPaths.size > 0) {
          const pathsToUpdate = new Set(accumulatedPaths);
          accumulatedPaths.clear();

          useStore.setState(state => ({
            modList: state.modList.map(m => {
              const normalizedModPath = (m.physical_path || m.name)?.replace(/\\/g, '/').toLowerCase();
              if (normalizedModPath && Array.from(pathsToUpdate).some((p: string) => p.toLowerCase().endsWith('/' + normalizedModPath) || p.toLowerCase() === normalizedModPath)) {
                return { ...m, hasUpdate: undefined, newVersion: undefined, newGameVersion: undefined, download_url: undefined };
              }
              return m;
            })
          }));
        }

        fetchBackups();
        window.dispatchEvent(new Event('force-radar-sweep'));
      }, 800);
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (vaultTimeout) clearTimeout(vaultTimeout);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: any = null;
    tauriBridge.listenToScanProgress((payload: any) => {
      if (!payload) return;
      if (useModalStore.getState().isSilentScanning) return;
      const pct =
        payload.total > 0
          ? Math.min(50, Math.max(1, Math.round((payload.current / payload.total) * 50)))
          : 1;
      const prev = useStore.getState().scanProgress;
      if (prev && prev.current > pct && prev.current < 100) {
        return;
      }
      setScanProgress({
        current: pct,
        total: 100,
        message: payload.message || prev?.message || "",
      });
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [setScanProgress]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: any = null;
    tauriBridge.listenToBackupProgress((payload: any) => {
      setBackupProgress(payload);
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [setBackupProgress]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: any = null;
    tauriBridge.listenToDnaMatch((payload: any) => {
      if (!payload) return;
      const { hash, path } = payload;
      if (hash && ignoredHashesRef?.current?.has(hash)) return;
      if (!hash && path && ignoredHashesRef?.current?.has(path)) return;

      setDnaMatchQueue((prev: any[]) => {
        const isDuplicate = prev.some((m) => (hash ? m.hash === hash : m.path === path));
        if (isDuplicate) return prev;
        return [...prev, payload];
      });
      useModalStore.setState((state) => {
        const already = state.dnaMatches.some((m: any) =>
          hash ? m.hash === hash : m.path === path
        );
        return {
          dnaMatches: already ? state.dnaMatches : [...state.dnaMatches, payload],
          isDnaModalOpen: true,
        };
      });
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [setDnaMatchQueue, ignoredHashesRef]);
}
