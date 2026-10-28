import { useState, useEffect, useMemo } from "react";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import {
  CustomDropdown,
  EmptyState,
  GameVersionMultiSelect,
  HoverTooltip,
} from "../../shared";
import { formatDisplayHash } from "./artifactStudioUtils";

export function EditableVersionHistoryCard({
  ver,
  idx,
  onSaveLabel,
  onSaveGameVersions,
  onDelete,
}: {
  ver: any;
  idx: number;
  totalCount: number;
  onSaveLabel: (ver: any, newLabel: string) => Promise<void>;
  onSaveGameVersions: (ver: any, newVersions: string[]) => Promise<void>;
  onDelete: (ver: any) => Promise<void>;
}) {
  const { t } = useLexicon();
  const [labelVal, setLabelVal] = useState<string>(ver.version_label || "1.0.0");

  useEffect(() => {
    setLabelVal(ver.version_label || "1.0.0");
  }, [ver.version_label]);

  const parsedGameVersions = useMemo(() => {
    if (Array.isArray(ver.game_version)) return ver.game_version;
    if (typeof ver.game_version === "string" && ver.game_version.trim()) {
      return ver.game_version
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    return [];
  }, [ver.game_version]);

  const commitLabel = async () => {
    const trimmed = labelVal.trim() || "1.0.0";
    if (trimmed !== (ver.version_label || "1.0.0")) {
      await onSaveLabel(ver, trimmed);
    }
  };

  const handleCopyHash = () => {
    if (ver.dna_hash && navigator.clipboard) {
      navigator.clipboard.writeText(ver.dna_hash);
      useStore.getState().pushStatus(t("studio_version_copied", "Hash Copied!"), "info");
    }
  };

  return (
    <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`material-symbols-outlined !text-[18px] shrink-0 ${
              idx === 0 ? "text-[var(--accent)]" : "text-[var(--subtext)]"
            }`}
          >
            {idx === 0 ? t("icon_verified", "verified") : t("icon_history", "history")}
          </span>
          <input
            type="text"
            value={labelVal}
            onChange={(e) => setLabelVal(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => e.key === "Enter" && commitLabel()}
            placeholder={t("studio_version_edit_label_ph", "Version label (e.g. 1.0.0)")}
            className="h-9 w-28 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)] outline-none px-3 text-xs font-bold text-[var(--text)] transition-all"
          />
          {idx === 0 && (
            <span className="px-2 py-0.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_6%,transparent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-widest text-[var(--accent)] shrink-0">
              {t("lineage_latest", "Latest")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {ver.dna_hash && (
            <span className="font-mono text-[10px] text-[var(--subtext)] opacity-80 truncate max-w-[160px] sm:max-w-[210px] relative group/btn cursor-default">
              {formatDisplayHash(ver.dna_hash)}
              <HoverTooltip title={ver.dna_hash} />
            </span>
          )}
          <button
            type="button"
            onClick={handleCopyHash}
            className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] transition-all cursor-pointer relative group/btn shrink-0"
          >
            <span className="material-symbols-outlined !text-[15px]">{t("icon_fingerprint", "fingerprint")}</span>
            <HoverTooltip title={t("studio_version_copy_hash", "Copy SHA-256")} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(ver)}
            className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] transition-all cursor-pointer relative group/btn shrink-0"
          >
            <span className="material-symbols-outlined !text-[15px]">{t("icon_delete", "delete")}</span>
            <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
          </button>
        </div>
      </div>

      <div className="w-full relative z-20">
        <GameVersionMultiSelect
          selectedVersions={parsedGameVersions}
          onChange={(newVals: string[]) => onSaveGameVersions(ver, newVals)}
        />
      </div>
    </div>
  );
}

export function ArtifactVersionHistorySection({
  versions,
  showAddVersionModal,
  setShowAddVersionModal,
  unlinkedSandboxVersionOptions,
  selectedSandboxVersionHash,
  setSelectedSandboxVersionHash,
  manualVersionHash,
  setManualVersionHash,
  newVersionLabel,
  setNewVersionLabel,
  onAddVersionUnified,
  onSaveVersionLabel,
  onSaveVersionGameVersions,
  onDeleteVersionEntry,
}: {
  versions: any[];
  showAddVersionModal: boolean;
  setShowAddVersionModal: (val: boolean) => void;
  unlinkedSandboxVersionOptions: Array<{ id: string; label: string }>;
  selectedSandboxVersionHash: string;
  setSelectedSandboxVersionHash: (val: string) => void;
  manualVersionHash: string;
  setManualVersionHash: (val: string) => void;
  newVersionLabel: string;
  setNewVersionLabel: (val: string) => void;
  onAddVersionUnified: () => Promise<void>;
  onSaveVersionLabel: (ver: any, newLabel: string) => Promise<void>;
  onSaveVersionGameVersions: (ver: any, newGameVers: string[]) => Promise<void>;
  onDeleteVersionEntry: (ver: any) => Promise<void>;
}) {
  const { t } = useLexicon();

  return (
    <div className="flex flex-col gap-4 pt-4 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined !text-[19px] text-[var(--accent)]">
            {t("icon_history", "history")}
          </span>
          <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
            {t("studio_versions_title", "Version History")} ({versions.length})
          </h4>
        </div>
        <button
          type="button"
          onClick={() => setShowAddVersionModal(!showAddVersionModal)}
          className="h-9 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
            {showAddVersionModal ? t("icon_close", "close") : t("icon_add", "add")}
          </span>
          {showAddVersionModal
            ? t("btn_cancel", "Cancel")
            : t("lineage_add_version", "Add Version")}
        </button>
      </div>

      {showAddVersionModal && (
        <div className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          {unlinkedSandboxVersionOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                {t("studio_version_tab_sandbox", "From Sandbox File")}
              </label>
              <CustomDropdown
                disableTint={true}
                value={selectedSandboxVersionHash}
                onChange={(val: string[]) => setSelectedSandboxVersionHash(val[0] || "")}
                options={[
                  { id: "", label: t("none", "None") },
                  ...unlinkedSandboxVersionOptions,
                ]}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
              {t("studio_version_tab_manual", "Manual SHA-256 Hash")}
            </label>
            <input
              value={manualVersionHash}
              onChange={(e) => setManualVersionHash(e.target.value)}
              placeholder={t("studio_version_manual_hash_ph", "Paste SHA-256 hash...")}
              className="h-12 glass-surface rounded-[var(--radius)] px-3.5 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newVersionLabel}
              onChange={(e) => setNewVersionLabel(e.target.value)}
              placeholder={t("studio_version_edit_label_ph", "Version (e.g. 1.0.0)")}
              className="h-12 glass-surface rounded-[var(--radius)] px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex-1 outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={onAddVersionUnified}
              className="h-12 px-4 rounded-[var(--radius)] glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                {t("icon_add", "add")}
              </span>
              {t("ql_add", "Add")}
            </button>
          </div>
        </div>
      )}

      {versions.length === 0 ? (
        <EmptyState icon="history" title={t("no_versions_found", "No Versions Registered")} className="py-6" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
          {versions.map((ver, idx) => (
            <EditableVersionHistoryCard
              key={ver.id || ver.dna_hash || idx}
              ver={ver}
              idx={idx}
              totalCount={versions.length}
              onSaveLabel={onSaveVersionLabel}
              onSaveGameVersions={onSaveVersionGameVersions}
              onDelete={onDeleteVersionEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
}

