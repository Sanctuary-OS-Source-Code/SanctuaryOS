import { useLexicon } from "../LexiconContext";
import { ActionButton } from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export const BlueprintRadarCard = ({
  playSet,
  cache,
  isActive,
  isScanning,
  onClick,
  onSweep,
  onView,
  onTabNavigate,
}: {
  playSet: any;
  cache: any;
  isActive: boolean;
  isScanning: boolean;
  onClick: () => void;
  onSweep: () => void;
  onView: () => void;
  onTabNavigate: (tab: string) => void;
}) => {
  const { t } = useLexicon();
  const pkgCount = playSet.mods?.length || 0;

  const actionsNode = (
    <div onClick={(e) => e.stopPropagation()}>
      <ActionButton
        label={isScanning ? t("scanning", "Scanning...") : t("btn_refresh", "Refresh")}
        onClick={onSweep}
        disabled={isScanning}
        className="!px-4 !py-1.5 !text-[9px] !rounded-xl"
      />
    </div>
  );

  const customIcon = (
    <span
      className={`material-symbols-outlined text-[20px] ${
        isActive ? "text-[var(--accent)]" : "text-[var(--subtext)]"
      } opacity-80 group-hover:text-[var(--accent)] transition-colors ${
        isScanning ? "animate-spin" : ""
      }`}
    >
      {isScanning ? t("icon_autorenew", "autorenew") : t("icon_account_tree", "account_tree")}
    </span>
  );

  const badgesNode = (
    <>
      <div className={VAULT_CHIP_CLASS}>
        <span
          className={`material-symbols-outlined !text-[12px] ${
            isActive ? "text-[var(--success)]" : "text-[var(--subtext)]"
          }`}
        >
          {isActive ? t("icon_verified", "verified") : t("icon_map", "map")}
        </span>
        <span>
          {isActive ? t("status_active", "Active") : t("term_blueprint", "{Blueprint}")}
        </span>
      </div>
      <div className={VAULT_CHIP_CLASS}>
        <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
          {t("icon_inventory_2", "inventory_2")}
        </span>
        <span className="text-[var(--subtext)]">
          {pkgCount} {t("tab_mods", "{Mods}")}
        </span>
      </div>
    </>
  );

  const statsGrid = cache?.hasScanned ? (
    <div className="grid grid-cols-4 gap-2 mt-2 w-full">
      <div
        onClick={(e) => {
          e.stopPropagation();
          onTabNavigate("fatal");
        }}
        className="flex flex-col items-center p-2 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] transition-all cursor-pointer"
      >
        <span className="text-[var(--danger)] font-black text-lg">
          {cache.fatal?.length || 0}
        </span>
        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--danger)] flex items-center gap-1">
          <span className="material-symbols-outlined !text-[12px]">
            {t("icon_crisis_alert", "crisis_alert")}
          </span>
          <span>{t("fatal", "Fatal")}</span>
        </span>
      </div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onTabNavigate("tuning");
        }}
        className="flex flex-col items-center p-2 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] hover:border-[var(--warning)] transition-all cursor-pointer"
      >
        <span className="text-[var(--warning)] font-black text-lg">
          {cache.tuning?.length || 0}
        </span>
        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--warning)] flex items-center gap-1">
          <span className="material-symbols-outlined !text-[12px]">
            {t("icon_tune", "tune")}
          </span>
          <span>{t("class_dd_tuning", "Tuning")}</span>
        </span>
      </div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onTabNavigate("clones");
        }}
        className="flex flex-col items-center p-2 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)] transition-all cursor-pointer"
      >
        <span className="text-[var(--accent)] font-black text-lg">
          {cache.clones?.length || 0}
        </span>
        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--accent)] flex items-center gap-1">
          <span className="material-symbols-outlined !text-[12px]">
            {t("icon_content_copy", "content_copy")}
          </span>
          <span>{t("radar_label_clones", "Clones")}</span>
        </span>
      </div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onTabNavigate("soft");
        }}
        className="flex flex-col items-center p-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] transition-all cursor-pointer"
      >
        <span className="text-[var(--text)] font-black text-lg">
          {cache.soft?.length || 0}
        </span>
        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] flex items-center gap-1">
          <span className="material-symbols-outlined !text-[12px]">
            {t("icon_info", "info")}
          </span>
          <span>{t("radar_label_soft", "Soft")}</span>
        </span>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-center p-3 mt-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] w-full gap-1.5">
      <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
        {t("icon_track_changes", "track_changes")}
      </span>
      <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)]">
        {t("radar_no_scan", "No Scan Data")}
      </span>
    </div>
  );

  const viewButton = cache?.hasScanned && (
    <div className="mt-2 w-full">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onView();
        }}
        disabled={!cache?.hasScanned}
        className={`w-full py-2.5 rounded-xl font-black uppercase tracking-wider text-[10px] transition-all flex items-center justify-center gap-2 border bg-transparent ${
          isActive
            ? "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[var(--accent)]"
            : "text-[var(--subtext)] hover:text-[var(--text)] border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span>{t("view_details", "View Details")}</span>
        <span className="material-symbols-outlined !text-[14px]">
          {t("icon_arrow_forward", "arrow_forward")}
        </span>
      </button>
    </div>
  );

  return (
    <UniversalCard
      layout="compact"
      isActive={isActive}
      onClick={onClick}
      title={playSet.name}
      subtitle={isScanning ? t("scanning", "Scanning...") : `${pkgCount} ${t("tab_mods", "{Mods}")}`}
      customIcon={customIcon}
      badges={badgesNode}
      actions={actionsNode}
      className="p-2"
    >
      {statsGrid}
      {viewButton}
    </UniversalCard>
  );
};
