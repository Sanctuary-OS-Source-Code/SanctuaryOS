import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  SidePanelHeroCard,
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../shared";
import { useLexicon } from "../LexiconContext";

export function DropzoneSidePanel({
  isDropzoneOpen,
  isDragging,
  setIsDragging,
  dropzoneState,
  setIsDropzoneOpen,
  setDropzoneState,
  droppedFiles,
  setDroppedFiles,
  ingestProgress,
  handleDroppedFiles,
}: any) {
  const { t } = useLexicon();

  const safeFiles: string[] = Array.isArray(droppedFiles) ? droppedFiles : [];

  return (
    <SidePanel
      isOpen={isDropzoneOpen || isDragging}
      onClose={() => {
        setIsDragging(false);
        if (dropzoneState !== "ingesting") {
          setIsDropzoneOpen(false);
          setDropzoneState("awaiting");
          setDroppedFiles([]);
        }
      }}
      backdropZ="z-[99998]"
      panelZ="z-[99999]"
      title={
        dropzoneState === "awaiting"
          ? t("awaiting_title", "Awaiting Payload")
          : t("secured_title", "Payload Secured")
      }
      subtitle={
        dropzoneState === "awaiting" ? (
          <>
            {t("awaiting_desc1", "Drop ")}
            <span className="text-[var(--text)]">
              {t("auto_package", ".package")}
            </span>
            {t("awaiting_desc2", ", ")}
            <span className="text-[var(--text)]">
              {t("auto_ts4script", ".ts4script")}
            </span>
            {t("awaiting_desc3", ", or ")}
            <span className="text-[var(--text)]">{t("auto_zip", ".zip")}</span>
            {t("awaiting_desc4", "archives directly into this zone to ingest them into the secure {Vault}.")}
          </>
        ) : (
          <>
            {safeFiles.length > 0
              ? `${safeFiles.length}${t("secured_desc_suffix", " files staged for ingestion")}`
              : t("secured_desc_empty", "No files staged")}
          </>
        )
      }
      icon={t("icon_cloud", "cloud_upload")}
      iconColorClass={
        dropzoneState === "received"
          ? "text-[var(--success)]"
          : "theme-text-accent"
      }
      widthClass="w-[90vw] md:w-[620px]"
      headerActions={
        dropzoneState === "received" && safeFiles.length > 0 ? (
          <PanelHeaderGroup>
            <PanelHeaderButton
              onClick={() => {
                handleDroppedFiles(safeFiles);
              }}
              variant="accent"
              icon={t("icon_flight_takeoff", "flight_takeoff")}
              tooltip={t("btn_import", "Import Files")}
            />
          </PanelHeaderGroup>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={
            dropzoneState === "received"
              ? t("icon_check_circle", "check_circle")
              : t("icon_cloud", "cloud_upload")
          }
          overline={
            dropzoneState === "awaiting"
              ? t("awaiting_title", "Vault Ingestion")
              : t("secured_title", "Payload Staged")
          }
          description={
            dropzoneState === "awaiting"
              ? t(
                  "modal_drop_files",
                  "Drag and drop mod packages, scripts, or compressed archives directly into this window."
                )
              : `${safeFiles.length}${t("secured_desc_suffix", " files ready for security scan and Vault injection.")}`
          }
          badge={`${safeFiles.length} ${t("modal_files", "Files")}`}
          badgeIcon={t("icon_inventory_2", "inventory_2")}
          variant={dropzoneState === "received" ? "success" : "accent"}
        />

        {dropzoneState === "awaiting" ? (
          <div
            className={`glass-panel rounded-2xl p-12 border-2 border-dashed flex flex-col items-center justify-center gap-3 pointer-events-none transition-all min-h-[280px] ${
              isDragging
                ? "border-[var(--accent)]"
                : "border-[color-mix(in_srgb,var(--text)_18%,transparent)]"
            }`}
          >
            <div className="w-16 h-16 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center">
              <span className="material-symbols-outlined !text-[34px] animate-bounce">
                {t("icon_cloud", "cloud_upload")}
              </span>
            </div>
            <span className="text-xs font-black text-[var(--text)] uppercase tracking-widest">
              {t("modal_drop_files", "Drop Files Here")}
            </span>
          </div>
        ) : (
          <>
            {safeFiles.length > 0 && (
              <UniversalGroup
                title={`${t("modal_files", "Staged Files")} (${safeFiles.length})`}
                icon={t("icon_inventory_2", "inventory_2")}
              >
                <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                  {safeFiles.map((f: any, i: number) => (
                    <div
                      key={i}
                      className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-xs font-bold text-[var(--text)] flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--success)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[18px]">
                          {t("icon_check_circle", "check_circle")}
                        </span>
                      </div>
                      <span className="truncate">{f}</span>
                    </div>
                  ))}
                </div>
              </UniversalGroup>
            )}

            {dropzoneState === "ingesting" ? (
              <div className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--accent)_42%,transparent)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined animate-spin !text-[18px]">
                      {t("icon_sync", "sync")}
                    </span>
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                    {t("btn_importing", "Importing...")}
                  </span>
                </div>
                <span className={`${VAULT_CHIP_CLASS} font-mono`}>
                  <span className="material-symbols-rounded !text-[12px] shrink-0 text-[var(--accent)]">
                    {t("icon_inventory_2", "inventory_2")}
                  </span>
                  {ingestProgress?.current || 0} / {ingestProgress?.total || 0}{" "}
                  {t("modal_files", "Files")}
                </span>
              </div>
            ) : (
              safeFiles.length > 0 && (
                <ActionButton
                  variant="glass"
                  icon={t("icon_flight_takeoff", "flight_takeoff")}
                  label={t("btn_import", "Import Files")}
                  onClick={() => handleDroppedFiles(safeFiles)}
                  className="w-full !text-[var(--accent)] !border-[color-mix(in_srgb,var(--accent)_42%,transparent)]"
                />
              )
            )}
          </>
        )}
      </div>
    </SidePanel>
  );
}
