import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { isDesktop } from "../utils/envUtils";
import { UniversalGroup } from "./universal/UniversalLayout";
import { ActionButton, VAULT_CHIP_CLASS } from "../shared";

interface DetectedExternalManager {
  manager_kind: string;
  label: string;
  source_dir: string;
  estimated_mod_count: number;
  profile_count: number;
}

export function CartographerMigrationWizardSection({
  vaultPath,
  livePath,
  docsPath,
}: {
  vaultPath: string;
  livePath: string;
  docsPath: string;
}) {
  const { t } = useLexicon();
  const [detectedManagers, setDetectedManagers] = useState<DetectedExternalManager[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [migratingDir, setMigratingDir] = useState<string | null>(null);
  const [migratedSummary, setMigratedSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    setIsScanning(true);
    invoke<DetectedExternalManager[]>("detect_external_mod_managers", {
      livePath: livePath || null,
      docsPath: docsPath || null,
    })
      .then((res) => {
        if (!cancelled && Array.isArray(res)) {
          setDetectedManagers(res);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [livePath, docsPath]);

  if (!isDesktop()) return null;

  const runMigrationFromDir = async (sourceDir: string) => {
    if (!vaultPath.trim()) {
      useStore
        .getState()
        .pushStatus(
          t("status_vault_required", "Configure your {Vault} folder before migrating external {mods}."),
          "warning"
        );
      return;
    }
    setMigratingDir(sourceDir);
    try {
      const report = await invoke<{
        detected_manager: string;
        hardlinked_count: number;
        copied_count: number;
        blueprints: Array<{ name: string; mods: string[]; load_order: string[] }>;
      }>("import_external_mod_manager", {
        sourceDir,
        vaultPath,
        zeroCopyHardlink: true,
      });

      const incomingBps = Array.isArray(report?.blueprints) ? report.blueprints : [];
      if (incomingBps.length > 0) {
        const currentSets = useStore.getState().playSets || [];
        const nextList = [...currentSets];
        for (const bp of incomingBps) {
          const base = String(bp?.name || t("exodus_default_bp_name", "Migrated {Blueprint}")).trim();
          let finalName = base;
          let idx = 1;
          while (nextList.some((s: any) => String(s?.name || "").toLowerCase() === finalName.toLowerCase())) {
            finalName = `${base} (${idx})`;
            idx++;
          }
          nextList.push({
            name: finalName,
            mods: Array.isArray(bp?.mods) ? bp.mods : [],
            loadOrder: Array.isArray(bp?.load_order) ? bp.load_order : [],
          });
        }
        useStore.getState().setPlaySets(nextList);
      }

      window.dispatchEvent(new CustomEvent("sanctuary-trigger-radar-sweep"));
      const totalImported = (report?.hardlinked_count || 0) + (report?.copied_count || 0);
      const summary = `${totalImported} ${t("term_mods", "{Mods}")} (${report?.hardlinked_count || 0} ${t("exodus_hardlinked_label", "zero-copy links")}, ${incomingBps.length} ${t("term_blueprints", "{Blueprints}")})`;
      setMigratedSummary(summary);
      useStore
        .getState()
        .pushStatus(`${t("exodus_import_done", "Migrated external manager:")} ${summary}`, "success");
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(`${t("alert_import_failed", "Import Failed:")} ${String(err?.message || err)}`, "error");
    } finally {
      setMigratingDir(null);
    }
  };

  const handleBrowseAndMigrate = async () => {
    try {
      const picked = await open({ directory: true, multiple: false });
      if (picked && typeof picked === "string") {
        await runMigrationFromDir(picked);
      }
    } catch {}
  };

  return (
    <UniversalGroup
      title={t("cartographer_migration_title", "Migrate External Mod Manager (Optional Zero-Copy)")}
      icon={t("icon_drive_file_move", "drive_file_move")}
      headerAction={
        <div className="flex items-center gap-2 ml-auto">
          {migratedSummary && (
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {t("icon_check_circle", "check_circle")}
              </span>
              <span className="text-[var(--success)]">{migratedSummary}</span>
            </span>
          )}
          <ActionButton
            type="button"
            variant="glass"
            disabled={Boolean(migratingDir)}
            icon={t("icon_folder_open", "folder_open")}
            label={t("btn_browse", "Browse")}
            onClick={() => void handleBrowseAndMigrate()}
          />
        </div>
      }
    >
      <span className="text-[11px] font-medium text-[var(--subtext)] opacity-85">
        {t(
          "cartographer_migration_desc",
          "Import existing profiles and downloads from Mod Organizer 2, Vortex, r2modman, or LSX managers via zero-copy NTFS hardlinks without duplicating disk space."
        )}
      </span>

      {isScanning ? (
        <div className="text-[11px] font-semibold text-[var(--subtext)] flex items-center gap-2 py-1">
          <span className="material-symbols-outlined !text-[14px] animate-spin text-[var(--accent)]">
            {t("icon_sync", "sync")}
          </span>
          <span>{t("loading", "Loading...")}</span>
        </div>
      ) : detectedManagers.length > 0 ? (
        <div className="flex flex-col gap-2">
          {detectedManagers.slice(0, 4).map((mgr) => {
            const isMigrating = migratingDir === mgr.source_dir;
            return (
              <div
                key={mgr.source_dir}
                className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold text-[var(--text)] truncate">{mgr.label}</span>
                  <span className="text-[10px] font-mono text-[var(--subtext)] truncate">
                    {mgr.source_dir}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_deployed_code", "deployed_code")}
                    </span>
                    <span>
                      {mgr.estimated_mod_count} {t("term_mods", "{Mods}")}
                    </span>
                  </span>
                  <ActionButton
                    type="button"
                    variant="accent"
                    disabled={Boolean(migratingDir) || !vaultPath.trim()}
                    icon={isMigrating ? t("icon_progress_activity", "progress_activity") : t("icon_drive_file_move", "drive_file_move")}
                    label={t("btn_migrate_now", "Migrate")}
                    onClick={() => void runMigrationFromDir(mgr.source_dir)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </UniversalGroup>
  );
}
