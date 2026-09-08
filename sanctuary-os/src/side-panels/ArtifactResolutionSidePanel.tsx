import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { SidePanel, PanelHeaderGroup, PanelHeaderButton } from "../shared";
import { useStore } from "../store";
import { invoke } from "@tauri-apps/api/core";
import { usePlaySetLogic } from "../hooks/usePlaySetLogic";

export default function ArtifactResolutionSidePanel({
  isOpen,
  onClose,
  type,
  offendingMods
}: {
  isOpen: boolean;
  onClose: () => void;
  type: 'vault' | 'blueprint' | null;
  offendingMods: any[];
}) {
  const { t } = useLexicon();
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const activeSet = useStore(state => state.playSets[state.activePlaySetIndex]);
  const modList = useStore(state => state.modList);
  const setModList = useStore(state => state.setModList);
  const { toggleInActiveSet } = usePlaySetLogic();

  useEffect(() => {
    if (!isOpen || !offendingMods || offendingMods.length === 0) return;

    const checkDependencies = async () => {
      setLoading(true);
      const modIds = offendingMods.map(m => m.id).filter(Boolean);
      if (modIds.length > 0) {
        // Query what other mods depend on these offending mods (child_id IN offendingMods)
        const { data: deps } = await supabase
          .from('mod_dependencies')
          .select('parent_id')
          .in('child_id', modIds);

        if (deps && deps.length > 0) {
          const parentIds = [...new Set(deps.map(d => d.parent_id))];
          // Get the parent mods from local list
          const localParents = modList.filter(m => parentIds.includes(m.id));

          // Only care about dependencies that are currently ACTIVE in the blueprint
          if (activeSet?.mods) {
            const activeModsSet = new Set(activeSet.mods);
            const activeDeps = localParents.filter(p => activeModsSet.has(p.name));
            setDependencies(activeDeps);
          } else {
            setDependencies([]);
          }
        } else {
          setDependencies([]);
        }
      } else {
        setDependencies([]);
      }
      setLoading(false);
    };

    checkDependencies();
  }, [isOpen, offendingMods, modList, activeSet]);

  const resolveAlerts = async () => {
    setResolving(true);
    try {
      if (type === 'blueprint') {
        for (const mod of offendingMods) {
          toggleInActiveSet(mod.origName, true, true, false);
        }
        useStore.getState().pushStatus(`Resolved Blueprint Lock by removing ${offendingMods.length} artifacts.`, "success");
        onClose();
      } else if (type === 'vault') {
        let removedCount = 0;
        let failedMods: string[] = [];
        let updatedList = [...modList];

        const config: any = await invoke("get_saved_coordinates");
        const vaultPath = config.vault_path;
        const separator = vaultPath.includes('\\') ? '\\' : '/';
        const isModsDir = vaultPath.toLowerCase().endsWith('mods') || vaultPath.toLowerCase().endsWith(`mods${separator}`);
        const baseVaultPath = isModsDir ? vaultPath : vaultPath + separator + 'Mods';
        const cleanVaultPath = baseVaultPath.endsWith(separator) ? baseVaultPath : baseVaultPath + separator;

        for (const mod of offendingMods) {
          let allSuccess = true;
          const fileName = mod.origName || mod.name;

          if (!fileName) {
            allSuccess = false;
          } else {
            const fullPath = cleanVaultPath + fileName;

            try {
              await invoke("delete_local_file", { path: fullPath });
              removedCount++;
            } catch (e: any) {
              if (e === "Path does not exist" || (typeof e === 'string' && e.includes("Path does not exist"))) {
                // File is already gone, treat as success but don't increment removedCount
              } else {
                console.warn("Failed to delete file", fullPath, e);
                allSuccess = false;
              }
            }
          }

          if (allSuccess) {
            toggleInActiveSet(fileName, true, true, false);
            updatedList = updatedList.filter(m => m.id !== mod.id && m.name !== fileName);
          } else {
            failedMods.push(fileName);
          }
        }

        setModList(updatedList);
        window.dispatchEvent(new Event("refreshVault"));

        if (failedMods.length > 0) {
          useStore.getState().pushStatus(`Failed to purge ${failedMods.length} artifacts. Please close the game or any programs using the files.`, "error");
        } else {
          useStore.getState().pushStatus(`Resolved Vault Lock by purging ${removedCount} files.`, "success");
          onClose();
        }
      }
    } catch (e) {
      console.error(e);
      useStore.getState().pushStatus(`Failed to resolve alerts.`, "error");
    } finally {
      setResolving(false);
    }
  };

  const title = type === 'vault' ? t("support_vault_lock") || "Vault Lock Engaged" : t("support_adult_mods") || "Blueprint Lock Engaged";
  const desc = type === 'vault'
    ? t("resolve_vault_desc") || `Purging these artifacts will permanently move them to your recycle bin and remove them from your active blueprint.`
    : t("resolve_blueprint_desc") || `Removing these artifacts will take them out of your active blueprint.`;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={t("resolve_alerts") || "Resolve Alerts"}
      icon={type === 'vault' ? "block" : "warning"}
      widthClass="w-[600px]"
      backdropZ="z-[110000]"
      panelZ="z-[110001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={resolving ? "sync" : "delete"}
            tooltip={type === 'vault' ? t("purge_from_vault") || "Purge from Vault" : t("remove_from_blueprint") || "Remove from Blueprint"}
            variant="error"
            className={resolving ? "animate-spin" : ""}
            onClick={resolveAlerts}
            disabled={resolving || loading}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] rounded-2xl p-5 shadow-inner">
          <p className="text-xs font-bold text-[var(--danger)] opacity-80 leading-relaxed">
            {desc}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[10px] font-black text-[var(--subtext)] capitalize tracking-widest">{t("offending_artifacts") || "Offending Artifacts"}</h3>
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
            {offendingMods.map((mod, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <span className="material-symbols-outlined !text-[20px] text-[var(--danger)]">extension</span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[var(--text)]">{mod.name}</span>
                  <span className="text-[10px] font-mono text-[var(--subtext)] opacity-70 truncate max-w-[300px]">{(mod.path || mod.origName)?.split(/[\\/]/).pop()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[var(--subtext)] text-xs font-bold p-4 opacity-50">
            <span className="material-symbols-outlined animate-spin">sync</span>
            <span>{t("scanning_dependencies") || "Scanning Blueprint for Symbiotic Dependencies..."}</span>
          </div>
        ) : dependencies.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-[10px] font-black text-[var(--warning)] capitalize tracking-widest">{t("affected_dependencies") || "Affected Dependencies"}</h3>
            <p className="text-[10px] font-bold text-[var(--subtext)] leading-relaxed mb-2">
              {t("affected_deps_desc") || "The following artifacts are currently active in your blueprint and depend on the offending artifacts. They may become unstable or broken if you proceed."}
            </p>
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto custom-scrollbar">
              {dependencies.map((dep, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)]">
                  <span className="material-symbols-outlined !text-[20px] text-[var(--warning)]">link</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[var(--warning)]">{dep.displayName || dep.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)]">
            <span className="material-symbols-outlined !text-[20px] text-[var(--accent)]">check_circle</span>
            <span className="text-xs font-bold text-[var(--accent)]">
              {t("no_affected_deps") || "No other artifacts in the active blueprint depend on these."}
            </span>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
