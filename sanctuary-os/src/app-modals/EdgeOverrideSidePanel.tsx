import React, { useState, useEffect } from 'react';
import { SidePanel } from "../shared";
import { useLexicon } from "../LexiconContext";
import { supabase } from '../supabase';

export function EdgeOverrideSidePanel({
  isOpen,
  onClose,
  data,
  modHash
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
      if (typeof data.mason_id === 'string' && data.mason_id.length === 36 && data.mason_id.includes('-')) {
        supabase.from('masons').select('name').eq('id', data.mason_id).single().then(({ data: mData }) => {
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

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      backdropZ="z-[125000]"
      panelZ="z-[125001]"
      title={t("title_edge_override_details") || "Override Manifest Details"}
      subtitle={t("desc_edge_override_details") || "Review the incoming network override settings."}
      icon="network_wifi"
      widthClass="w-[500px]"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
            <h3 className="text-[10px] font-black uppercase tracking-widest theme-text-accent mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[14px]">extension</span>
              {t("label_target_mod") || "Target Artifact"}
            </h3>
            <div className="text-base font-bold text-[var(--text)]">
              {data.artifact_id || "Unknown"}
            </div>
        </div>

        <div className="glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
            <h3 className="text-[10px] font-black uppercase tracking-widest theme-text-accent mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[14px]">person</span>
              {t("title_mason_author") || "Mason"}
            </h3>
            <div className="text-base font-bold text-[var(--text)] truncate">
              {masonName || data.mason_id || "Unknown"}
            </div>
        </div>
        
        <div className="glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
            <h3 className="text-[10px] font-black uppercase tracking-widest theme-text-accent mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[14px]">link</span>
              {t("label_manifest_source") || "Manifest Source"}
            </h3>
            <div className="text-xs opacity-80 break-all bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[color-mix(in_srgb,var(--text)_5%,transparent)] font-mono">
              {data.manifest_url || "N/A"}
            </div>
            {(modHash || data.target_hash) && (
                <div className="flex flex-col gap-1 mt-3">
                   <div className="text-[11px] flex items-center gap-2">
                      <span className="font-bold opacity-80">{t("label_verified_signature") || "Verified local signature:"}</span>
                      <span className="font-mono bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-1.5 py-0.5 rounded text-[10px]">
                         {(modHash || data.target_hash).substring(0, 8)}...{(modHash || data.target_hash).substring((modHash || data.target_hash).length - 6)}
                      </span>
                   </div>
                   <div className="text-[10px] opacity-60 italic mt-0.5 leading-snug">
                      {t("desc_override_signature_note") || "This override can manage only the matched artifact family."}
                   </div>
                </div>
            )}
        </div>

        <div className="p-4 rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] text-[var(--warning)] flex items-start gap-3">
            <span className="material-symbols-outlined !text-[18px] shrink-0 mt-0.5">warning</span>
            <div className="text-[10px] leading-relaxed">
              {t("desc_override_warning") || "Importing this override will replace locally maintained metadata and atomic logic for this artifact family with data from the linked Edge Manifest. The override can be removed and the Local Dossier restored at any time."}
            </div>
        </div>

        <div className="glass-surface p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner">
            <h3 className="text-[10px] font-black uppercase tracking-widest theme-text-accent mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-[14px]">fingerprint</span>
              {t("label_hashes_affected") || "Hashes Affected"}
            </h3>
            <div className="bg-[var(--bg-tertiary)] rounded-lg border border-[color-mix(in_srgb,var(--text)_5%,transparent)] max-h-[200px] overflow-y-auto custom-scrollbar">
              <ul className="text-[11px] opacity-80 divide-y divide-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  {(modHash || data.target_hash) && (
                    <li className="p-2 flex items-center gap-2 font-mono">
                      <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0"></span>
                      <span className="truncate">{modHash || data.target_hash}</span>
                      <span className="text-[9px] uppercase tracking-wider opacity-60 ml-auto shrink-0">{t("label_target") || "(Target)"}</span>
                    </li>
                  )}
                  {data.archive_hashes?.map((h: string, i: number) => (
                    <li key={i} className="p-2 flex items-center gap-2 font-mono">
                      <span className="w-2 h-2 rounded-full bg-[color-mix(in_srgb,var(--text)_20%,transparent)] shrink-0"></span>
                      <span className="truncate">{h}</span>
                      <span className="text-[9px] uppercase tracking-wider opacity-60 ml-auto shrink-0">{t("label_archive") || "(Archive)"}</span>
                    </li>
                  ))}
                  {!(modHash || data.target_hash) && (!data.archive_hashes || data.archive_hashes.length === 0) && (
                    <li className="p-3 text-center opacity-50 italic">{t("desc_none_specified") || "None specified"}</li>
                  )}
              </ul>
            </div>
        </div>
      </div>
    </SidePanel>
  );
}
