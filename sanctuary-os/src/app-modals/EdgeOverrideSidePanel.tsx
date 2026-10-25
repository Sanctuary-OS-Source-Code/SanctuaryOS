import React, { useState, useEffect } from "react";
import {
  SidePanel,
  StatBox,
  SidePanelHeroCard,
  UniversalGroup,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { supabase } from "../supabase";

export function EdgeOverrideSidePanel({
  isOpen,
  onClose,
  data,
  modHash,
}: {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  modHash?: string;
}) {
  const { t } = useLexicon();
  const [masonName, setMasonName] = useState<string | null>(null);

  useEffect(() => {
    if (data?.mason_id) {
      if (
        typeof data.mason_id === "string" &&
        data.mason_id.length === 36 &&
        data.mason_id.includes("-")
      ) {
        supabase
          .from("masons")
          .select("name")
          .eq("id", data.mason_id)
          .single()
          .then(({ data: mData }) => {
            if (mData) {
              setMasonName(mData.name);
            } else {
              setMasonName(data.mason_id);
            }
          });
      } else {
        setMasonName(data.mason_id);
      }
    } else {
      setMasonName(null);
    }
  }, [data]);

  if (!data) return null;

  const activeHash = modHash || data.target_hash;
  const archiveHashes: string[] = Array.isArray(data.archive_hashes)
    ? data.archive_hashes
    : [];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      backdropZ="z-[125000]"
      panelZ="z-[125001]"
      title={t("title_edge_override_details", "Override Manifest Details")}
      subtitle={t(
        "desc_edge_override_details",
        "Review incoming network override settings"
      )}
      icon={t("icon_network_wifi", "network_wifi")}
      iconColorClass="theme-text-accent"
      widthClass="w-[90vw] md:w-[620px]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_warning", "warning")}
          overline={t("title_edge_override_details", "Edge Manifest Override")}
          description={t(
            "desc_override_warning",
            "Importing this override will replace locally maintained metadata and atomic logic for this artifact family with data from the linked Edge Manifest. The override can be removed and the Local Dossier restored at any time."
          )}
          variant="warning"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <StatBox
              icon={t("icon_extension", "extension")}
              iconColorClass="text-[var(--accent)]"
              label={t("label_target_mod", "Target Artifact")}
              value={data.artifact_id || t("unknown_label", "Unknown")}
            />
            <StatBox
              icon={t("icon_person", "person")}
              iconColorClass="text-[var(--accent)]"
              label={t("role_mason", "Mason")}
              value={masonName || data.mason_id || t("unknown_label", "Unknown")}
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={t("label_manifest_source", "Manifest Source")}
          icon={t("icon_link", "link")}
        >
          <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] font-mono text-xs text-[var(--text)] break-all">
            {data.manifest_url || t("not_available", "N/A")}
          </div>

          {activeHash && (
            <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)]">
                  {t("label_verified_signature", "Verified Local Signature")}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] font-mono text-[10px] font-bold">
                  {activeHash.substring(0, 8)}...
                  {activeHash.substring(activeHash.length - 6)}
                </span>
              </div>
              <p className="text-[11px] font-medium text-[var(--subtext)] opacity-80 m-0">
                {t(
                  "desc_override_signature_note",
                  "This override can manage only the matched artifact family."
                )}
              </p>
            </div>
          )}
        </UniversalGroup>

        <UniversalGroup
          title={t("label_hashes_affected", "Hashes Affected")}
          icon={t("icon_fingerprint", "fingerprint")}
        >
          <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
            {activeHash && (
              <div className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-between gap-2 font-mono text-xs">
                <span className="truncate text-[var(--text)]">{activeHash}</span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] shrink-0">
                  {t("label_target", "Target")}
                </span>
              </div>
            )}
            {archiveHashes.map((h: string, i: number) => (
              <div
                key={i}
                className="glass-surface rounded-xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-between gap-2 font-mono text-xs"
              >
                <span className="truncate text-[var(--subtext)]">{h}</span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-transparent border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--subtext)] shrink-0">
                  {t("label_archive", "Archive")}
                </span>
              </div>
            ))}
            {!activeHash && archiveHashes.length === 0 && (
              <div className="glass-surface rounded-xl px-4 py-3 text-center text-xs text-[var(--subtext)] opacity-60">
                {t("desc_none_specified", "None specified")}
              </div>
            )}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
