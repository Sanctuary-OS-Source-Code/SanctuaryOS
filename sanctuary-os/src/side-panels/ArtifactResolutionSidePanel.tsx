import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
} from "../shared";
import { useStore } from "../store";
import { invoke } from "@tauri-apps/api/core";
import { usePlaySetLogic } from "../hooks/usePlaySetLogic";

export default function ArtifactResolutionSidePanel({
  isOpen,
  onClose,
  type,
  offendingMods,
}: {
  isOpen: boolean;
  onClose: () => void;
  type: "vault" | "blueprint" | null;
  offendingMods: any[];
}) {
  const { t } = useLexicon();
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const activeSet = useStore((state) => state.playSets[state.activePlaySetIndex]);
  const modList = useStore((state) => state.modList);
  const setModList = useStore((state) => state.setModList);
  const { toggleInActiveSet } = usePlaySetLogic();

  useEffect(() => {
    if (!isOpen || !offendingMods || offendingMods.length === 0) return;

    const checkDependencies = async () => {
      setLoading(true);
      const modIds = offendingMods.map((m) => m.id).filter(Boolean);
      if (modIds.length > 0) {
        const { data: deps } = await supabase
          .from("mod_dependencies")
          .select("parent_id")
          .in("child_id", modIds);

        if (deps && deps.length > 0) {
          const parentIds = [...new Set(deps.map((d) => d.parent_id))];
          const localParents = modList.filter((m) => parentIds.includes(m.id));

          if (activeSet?.mods) {
            const activeModsSet = new Set(activeSet.mods);
            const activeDeps = localParents.filter((p) => activeModsSet.has(p.name));
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
      if (type === "blueprint") {
        for (const mod of offendingMods) {
          toggleInActiveSet(mod.origName, true, true, false);
        }
        useStore
          .getState()
          .pushStatus(
            `Resolved Blueprint Lock by removing ${offendingMods.length} artifacts.`,
            "success"
          );
        onClose();
      } else if (type === "vault") {
        let removedCount = 0;
        const failedMods: string[] = [];
        let updatedList = [...modList];

        const config: any = await invoke("get_saved_coordinates");
        const vaultPath = config.vault_path;
        const separator = vaultPath.includes("\\") ? "\\" : "/";
        const isModsDir =
          vaultPath.toLowerCase().endsWith("mods") ||
          vaultPath.toLowerCase().endsWith(`mods${separator}`);
        const baseVaultPath = isModsDir ? vaultPath : vaultPath + separator + "Mods";
        const cleanVaultPath = baseVaultPath.endsWith(separator)
          ? baseVaultPath
          : baseVaultPath + separator;

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
              if (
                e === "Path does not exist" ||
                (typeof e === "string" && e.includes("Path does not exist"))
              ) {
                // File is already gone
              } else {
                console.warn("Failed to delete file", fullPath, e);
                allSuccess = false;
              }
            }
          }

          if (allSuccess) {
            toggleInActiveSet(fileName, true, true, false);
            updatedList = updatedList.filter((m) => m.id !== mod.id && m.name !== fileName);
          } else {
            failedMods.push(fileName);
          }
        }

        setModList(updatedList);
        window.dispatchEvent(new Event("refreshVault"));

        if (failedMods.length > 0) {
          useStore
            .getState()
            .pushStatus(
              `Failed to purge ${failedMods.length} artifacts. Please close the game or any programs using the files.`,
              "error"
            );
        } else {
          useStore
            .getState()
            .pushStatus(`Resolved Vault Lock by purging ${removedCount} files.`, "success");
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

  const title =
    type === "vault"
      ? t("support_vault_lock", "Vault Lock Engaged")
      : t("support_adult_mods", "Blueprint Lock Engaged");
  const desc =
    type === "vault"
      ? t(
          "resolve_vault_desc",
          "Purging these artifacts will permanently move them to your recycle bin and remove them from your active blueprint."
        )
      : t(
          "resolve_blueprint_desc",
          "Removing these artifacts will take them out of your active blueprint."
        );
  const panelIcon = type === "vault" ? t("icon_block", "block") : t("icon_warning", "warning");
  const actionLabel =
    type === "vault"
      ? t("purge_from_vault", "Purge from Vault")
      : t("remove_from_blueprint", "Remove from Blueprint");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={t("resolve_alerts", "Resolve Alerts")}
      icon={panelIcon}
      iconColorClass="text-[var(--danger)]"
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ="z-[110000]"
      panelZ="z-[110001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={resolving ? t("icon_sync", "sync") : t("icon_delete", "delete")}
            tooltip={actionLabel}
            variant="error"
            className={resolving ? "animate-spin" : ""}
            onClick={resolveAlerts}
            disabled={resolving || loading}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={panelIcon}
          overline={t("resolve_alerts", "Resolve Alerts")}
          title={title}
          description={desc}
          badge={`${(offendingMods || []).length} ${t("items", "Items")}`}
          badgeIcon={panelIcon}
          variant="danger"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <StatBox
              label={t("offending_artifacts", "Offending Artifacts")}
              value={(offendingMods || []).length}
              icon={t("icon_extension", "extension")}
              iconColorClass="text-[var(--danger)]"
            />
            <StatBox
              label={t("affected_dependencies", "Affected Dependencies")}
              value={dependencies.length}
              icon={t("icon_link", "link")}
              iconColorClass={
                dependencies.length > 0 ? "text-[var(--warning)]" : "text-[var(--success)]"
              }
            />
          </div>

          <ActionButton
            variant="glass"
            icon={resolving ? t("icon_sync", "sync") : t("icon_delete", "delete")}
            label={actionLabel}
            disabled={resolving || loading}
            onClick={resolveAlerts}
            className="w-full"
          />
        </SidePanelHeroCard>

        <UniversalGroup
          title={`${t("offending_artifacts", "Offending Artifacts")} (${(offendingMods || []).length})`}
          icon={t("icon_extension", "extension")}
        >
          <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto custom-scrollbar">
            {(offendingMods || []).map((mod, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_extension", "extension")}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-bold text-[var(--text)] truncate">
                      {mod.name}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--subtext)] opacity-75 truncate">
                      {(mod.path || mod.origName)?.split(/[\\/]/).pop()}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--danger)] shrink-0">
                  {t("icon_block", "Restricted")}
                </span>
              </div>
            ))}
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={`${t("affected_dependencies", "Affected Dependencies")} (${dependencies.length})`}
          icon={t("icon_link", "link")}
        >
          {loading ? (
            <div className="flex items-center gap-2 text-[var(--subtext)] text-xs font-bold p-4 glass-surface rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="material-symbols-outlined animate-spin">
                {t("icon_sync", "sync")}
              </span>
              <span>
                {t(
                  "scanning_dependencies",
                  "Scanning Blueprint for Symbiotic Dependencies..."
                )}
              </span>
            </div>
          ) : dependencies.length > 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "affected_deps_desc",
                  "The following artifacts are currently active in your blueprint and depend on the offending artifacts. They may become unstable or broken if you proceed."
                )}
              </p>
              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto custom-scrollbar">
                {dependencies.map((dep, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[var(--warning)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_link", "link")}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[var(--text)] truncate">
                        {dep.displayName || dep.name}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--warning)] shrink-0">
                      {t("bp_status_unstable", "Dependent")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <div className="w-9 h-9 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--success)_40%,transparent)] text-[var(--success)] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_check_circle", "check_circle")}
                </span>
              </div>
              <span className="text-xs font-bold text-[var(--text)]">
                {t(
                  "no_affected_deps",
                  "No other artifacts in the active blueprint depend on these."
                )}
              </span>
            </div>
          )}
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
