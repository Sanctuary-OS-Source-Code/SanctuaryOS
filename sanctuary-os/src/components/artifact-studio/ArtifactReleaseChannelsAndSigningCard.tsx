import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { isDesktop } from "../../utils/envUtils";
import { CustomDropdown, VAULT_CHIP_CLASS } from "../../shared";
import type { MasonReleaseChannel, PatchCompatibilityEntry } from "../../utils/blueprintLockfile";

export function ArtifactReleaseChannelsAndSigningCard({
  releaseChannel,
  onChangeReleaseChannel,
  patchMatrix,
  onChangePatchMatrix,
}: {
  releaseChannel: MasonReleaseChannel;
  onChangeReleaseChannel: (next: MasonReleaseChannel) => void;
  patchMatrix: PatchCompatibilityEntry[];
  onChangePatchMatrix: (next: PatchCompatibilityEntry[]) => void;
}) {
  const { t } = useLexicon();
  const [signingPubKey, setSigningPubKey] = useState("");
  const [gameRangeInput, setGameRangeInput] = useState("");
  const [minVerInput, setMinVerInput] = useState("");
  const [matrixStatus, setMatrixStatus] = useState<"compatible" | "untested" | "incompatible">(
    "compatible"
  );

  useEffect(() => {
    if (!isDesktop()) return;
    invoke<string>("get_mason_signing_public_key")
      .then((pk) => {
        if (pk) setSigningPubKey(pk);
      })
      .catch(() => {});
  }, []);

  const handleCopyPublicKey = async () => {
    if (!signingPubKey) return;
    try {
      await navigator.clipboard.writeText(signingPubKey);
      useStore.getState().pushStatus(t("alert_copied", "Copied to clipboard!"), "success");
    } catch {}
  };

  const handleAddMatrixRow = () => {
    const cleanRange = gameRangeInput.trim();
    if (!cleanRange) return;
    const entry: PatchCompatibilityEntry = {
      game_version_range: cleanRange,
      channel: releaseChannel,
      min_mod_version: minVerInput.trim() || "1.0.0",
      status: matrixStatus,
    };
    onChangePatchMatrix([...patchMatrix, entry]);
    setGameRangeInput("");
    setMinVerInput("");
  };

  const handleRemoveMatrixRow = (idx: number) => {
    onChangePatchMatrix(patchMatrix.filter((_, i) => i !== idx));
  };

  return (
    <div className="glass-surface rounded-2xl p-5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">
              {t("icon_verified", "verified")}
            </span>
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              {t("mason_channels_signing_title", "Release Channels, Semver Matrix & Ed25519 Signing")}
            </h4>
          </div>
          <p className="text-[11px] font-semibold text-[var(--subtext)] ml-6">
            {t(
              "mason_channels_signing_desc",
              "Publish independent Stable, Beta, or Alpha branches with cryptographic Ed25519 creator manifest signatures."
            )}
          </p>
        </div>

        {signingPubKey && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {t("icon_key", "key")}
              </span>
              <span className="font-mono text-[10px] text-[var(--text)]">
                Ed25519: {signingPubKey.slice(0, 12)}...
              </span>
            </span>
            <button
              type="button"
              onClick={() => void handleCopyPublicKey()}
              className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_content_copy", "content_copy")}
              </span>
              <span>{t("copy", "Copy")}</span>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
            {t("release_notes_meta_channel", "Channel")}
          </label>
          <CustomDropdown
            disableTint={true}
            value={releaseChannel}
            onChange={(val: string[]) => {
              const picked = (val[0] || "stable") as MasonReleaseChannel;
              onChangeReleaseChannel(picked);
            }}
            options={[
              { id: "stable", label: t("status_stable", "Stable") },
              { id: "beta", label: t("rel_beta", "Beta") },
              { id: "alpha", label: t("channel_alpha", "Alpha") },
            ]}
          />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
            {t("mason_patch_matrix_add_label", "Add Game-Patch Compatibility Rule")}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={gameRangeInput}
              onChange={(e) => setGameRangeInput(e.target.value)}
              placeholder={t("mason_patch_range_ph", ">=1.10.0 <1.12.0")}
              className="h-10 flex-1 min-w-[140px] glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
            />
            <input
              value={minVerInput}
              onChange={(e) => setMinVerInput(e.target.value)}
              placeholder={t("mason_patch_min_mod_ph", "Min v1.0.0")}
              className="h-10 w-28 glass-surface rounded-xl px-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)]"
            />
            <div className="w-36">
              <CustomDropdown
                disableTint={true}
                value={matrixStatus}
                onChange={(val: string[]) => {
                  if (val[0]) setMatrixStatus(val[0] as any);
                }}
                options={[
                  { id: "compatible", label: t("patch_status_compatible", "Compatible") },
                  { id: "untested", label: t("patch_status_untested", "Untested") },
                  { id: "incompatible", label: t("patch_status_incompatible", "Incompatible") },
                ]}
              />
            </div>
            <button
              type="button"
              disabled={!gameRangeInput.trim()}
              onClick={handleAddMatrixRow}
              className="h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-[var(--text)] cursor-pointer shrink-0"
            >
              {t("add", "Add")}
            </button>
          </div>
        </div>
      </div>

      {patchMatrix.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          {patchMatrix.map((row, idx) => (
            <div
              key={`${row.game_version_range}_${row.channel}_${idx}`}
              className="px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 font-mono min-w-0">
                <span className="font-bold text-[var(--text)] truncate">
                  {row.game_version_range}
                </span>
                <span className="text-[var(--subtext)]">v{row.min_mod_version}</span>
              </div>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <span className={VAULT_CHIP_CLASS}>
                  <span>{row.channel}</span>
                </span>
                <span className={VAULT_CHIP_CLASS}>
                  <span
                    className={
                      row.status === "compatible"
                        ? "text-[var(--success)]"
                        : row.status === "incompatible"
                          ? "text-[var(--danger)]"
                          : "text-[var(--warning)]"
                    }
                  >
                    {row.status}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveMatrixRow(idx)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
