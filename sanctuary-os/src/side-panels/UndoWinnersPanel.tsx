import { useState, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  formatDisplayName,
  getFileLabel,
  getExtensionRegex,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  EmptyState,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
  VAULT_CHIP_CLASS,
  openModDossier,
} from "../shared";
import { useStore } from "../store";

interface UndoWinnersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  scanScope: string;
  onUndoComplete: () => void;
  onUndo: (fileName: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export default function UndoWinnersPanel({
  isOpen,
  onClose,
  scanScope,
  onUndoComplete,
  onUndo,
  onClearAll,
}: UndoWinnersPanelProps) {
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const { t } = useLexicon();
  const [overrides, setOverrides] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchOverrides();
    }
  }, [isOpen, scanScope]);

  const fetchOverrides = async () => {
    setLoading(true);
    try {
      const list: string[] = [];
      const playsets = useStore.getState().playSets;
      if (playsets) {
        const currentSet = playsets.find((p: any) => p.name === scanScope);
        if (currentSet && Array.isArray(currentSet.mods)) {
          const blueprintOverrides = currentSet.mods
            .map((m: any) => (typeof m === "string" ? m : m.name || m.path || ""))
            .filter(
              (m: string) =>
                m.toLowerCase().startsWith("sanctuary/") ||
                m.toLowerCase().startsWith("sanctuary\\")
            )
            .map((m: string) => m.replace(/^Sanctuary[/\\]/i, ""));
          for (const o of blueprintOverrides) {
            if (!list.includes(o)) list.push(o);
          }
        }
      }
      setOverrides(list);
    } catch (err) {
      console.error("Failed to load overrides", err);
    }
    setLoading(false);
  };

  const undoOverride = async (fileName: string) => {
    try {
      await onUndo(fileName);
      onUndoComplete();
      onClose();
    } catch (err) {
      useStore.getState().pushStatus(`Undo Error: ${err}`);
    }
  };

  const clearAllOverrides = async () => {
    try {
      await onClearAll();
      onUndoComplete();
      onClose();
    } catch (err) {
      useStore.getState().pushStatus(`Error: ${err}`);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("undo_title", "Undo Overrides")}
      subtitle={t("undo_subtitle", "Restore Default Load Order")}
      icon={t("icon_history", "history")}
      iconColorClass="text-[var(--danger)]"
      backdropZ="z-[50000]"
      panelZ="z-[50001]"
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        overrides.length > 0 ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_warning_amber", "warning_amber")}
              tooltip={t("nav_clear_all", "Clear All")}
              variant="error"
              disabled={overrides.length === 0}
              onClick={clearAllOverrides}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_history", "history")}
          overline={t("undo_title", "Undo Overrides")}
          title={scanScope || t("active", "Active")}
          description={t("undo_subtitle", "Restore Default Load Order")}
          badge={`${overrides.length} ${t("term_mods", "Items")}`}
          badgeIcon={t("icon_history", "history")}
          variant={overrides.length > 0 ? "danger" : "success"}
        >
          <div className="grid grid-cols-2 gap-3 pt-1">
            <StatBox
              label={t("winner", "WINNING {MOD}")}
              value={overrides.length}
              icon={t("icon_history", "history")}
              iconColorClass={
                overrides.length > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"
              }
            />
            <StatBox
              label={t("stat_blueprints", "Active {Blueprint}")}
              value={scanScope || t("active", "Active")}
              icon={t("icon_map", "map")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>
        </SidePanelHeroCard>

        {loading ? (
          <div className="glass-panel rounded-2xl p-12 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)]">
            <span className="material-symbols-outlined animate-spin">
              {t("icon_sync", "sync")}
            </span>
          </div>
        ) : overrides.length === 0 ? (
          <EmptyState
            icon={t("icon_check_circle", "check_circle")}
            title={t("no_overrides", "No Active Overrides")}
          />
        ) : (
          <UniversalGroup
            title={`${t("winner", "WINNING {MOD}")} (${overrides.length})`}
            icon={t("icon_history", "history")}
          >
            <div className="flex flex-col gap-3">
              {overrides.map((file) => {
                const fileLabel = getFileLabel(file, activeGameSchema);
                const isScript = String(fileLabel).toUpperCase().includes("SCRIPT") || file.toLowerCase().endsWith(".ts4script");
                return (
                <div
                  key={file}
                  onClick={() => openModDossier(file)}
                  className="flex items-center justify-between gap-3 p-4 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[20px]">
                        {isScript ? t("icon_code", "code") : t("icon_extension", "extension")}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span className="text-sm font-bold text-[var(--text)] truncate block">
                        {formatDisplayName(
                          file.replace(getExtensionRegex(activeGameSchema), "")
                        )}
                      </span>
                      <span className={`${VAULT_CHIP_CLASS} self-start`}>
                        <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                          {isScript ? t("icon_code", "code") : t("icon_extension", "extension")}
                        </span>
                        <span>{fileLabel}</span>
                      </span>
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <ActionButton
                      variant="glass"
                      icon={t("icon_undo", "undo")}
                      label={t("undo_title", "Undo")}
                      onClick={() => undoOverride(file)}
                    />
                  </div>
                </div>
                );
              })}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
