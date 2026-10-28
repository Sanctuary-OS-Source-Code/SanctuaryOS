import { useState, useEffect } from 'react';
import { supabase, supabaseAuth } from './supabase';
import { useLexicon } from './LexiconContext';
import { EmptyState, SidePanel, StatBox, VAULT_CHIP_CLASS } from './shared';
import { SidePanelHeroCard, SidePanelTitleInput } from './components/layouts/ElevatedHubLayout';
import { UniversalGroup, UniversalInput, UniversalTextArea } from './components/universal/UniversalLayout';
import { UniversalCard } from './components/universal/UniversalCard';

export function HeuristicsReadOnlyList({
  onEditClick,
  search,
  scope = "spoke",
  readOnly = false
}: {
  onEditClick?: (sig: any) => void;
  search: string;
  scope?: "spoke" | "core";
  readOnly?: boolean;
}) {
  const { t } = useLexicon();
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectingSig, setInspectingSig] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const query = scope === "core"
        ? supabaseAuth.from('keeper_heuristic_signatures').select('*').order('created_at', { ascending: true })
        : supabase.from('heuristic_signatures').select('*').order('created_at', { ascending: true });
      const { data, error } = await query;
      if (error) {
        console.error("Error fetching heuristics:", error);
      } else {
        setSignatures(data || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const handleRefresh = () => load();
    window.addEventListener('force-heuristics-refresh', handleRefresh);
    return () => window.removeEventListener('force-heuristics-refresh', handleRefresh);
  }, [scope]);

  const filteredSignatures = signatures.filter(sig =>
    !search ||
    sig.signature?.toLowerCase().includes(search.toLowerCase()) ||
    sig.match_type?.toLowerCase().includes(search.toLowerCase()) ||
    sig.notes?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {readOnly && scope === "core" && (
        <div className="glass-surface px-5 py-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
            {t("icon_shield_lock", "shield_lock")}
          </span>
          <span className="text-[11px] font-bold text-[var(--subtext)] tracking-wide">
            {t("core_heuristics_readonly_notice", "Core OS heuristic definitions are governed globally by Keepers Core and are read-only at the Spoke level.")}
          </span>
        </div>
      )}

      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">
          {t("auto_loading_signatures", "Loading Signatures...")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredSignatures.map(sig => {
            return (
              <UniversalCard
                key={sig.id}
                layout="vertical"
                className={!sig.enabled ? 'opacity-55' : ''}
                icon={scope === "core" ? t("icon_shield_lock", "shield_lock") : t("icon_bug_report", "bug_report")}
                subtitle={`${sig.severity || "rule"} • ${sig.match_type || "pattern"}`}
                title={sig.signature}
                description={sig.notes || undefined}
                bannerTopLabel={scope === "core" ? t("core_os_badge", "Core OS") : t("spoke_badge", "Spoke")}
                bannerBottomLabel={sig.match_type || sig.severity}
                badges={
                  <div className="flex items-center gap-1.5">
                    <span className={VAULT_CHIP_CLASS}>
                      <span className={`material-symbols-rounded !text-[12px] shrink-0 ${scope === "core" ? "text-[var(--accent)]" : "text-[var(--warning)]"}`}>
                        {scope === "core" ? t("icon_shield_lock", "shield_lock") : t("icon_bug_report", "bug_report")}
                      </span>
                      <span>{scope === "core" ? t("core_os_badge", "Core OS") : t("spoke_badge", "Spoke")}</span>
                    </span>
                    <span className={VAULT_CHIP_CLASS}>
                      <span className={`material-symbols-rounded !text-[12px] shrink-0 ${sig.enabled ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                        {sig.enabled ? t("icon_verified", "verified") : t("icon_block", "block")}
                      </span>
                      <span>{sig.enabled ? t("status_active", "Active") : t("status_disabled", "Disabled")}</span>
                    </span>
                  </div>
                }
                onClick={() => {
                  if (readOnly || !onEditClick) {
                    setInspectingSig(sig);
                  } else {
                    onEditClick(sig);
                  }
                }}
                footer={
                  <div className="flex items-center justify-between w-full text-[10px] font-bold">
                    <span className="text-[var(--subtext)] opacity-60 font-mono flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[12px]">{t("icon_fingerprint", "fingerprint")}</span>
                      {sig.id?.substring(0, 8) || "GLOBAL"}
                    </span>
                    <span className="text-[var(--text)] opacity-80 group-hover/card:text-[var(--accent)] group-hover/card:opacity-100 transition-colors flex items-center gap-1.5 font-black uppercase tracking-widest">
                      <span className="material-symbols-outlined !text-[14px]">
                        {readOnly ? t("icon_visibility", "visibility") : t("icon_edit", "edit")}
                      </span>
                      {t("btn_inspect", "Inspect {Mod}")}
                    </span>
                  </div>
                }
              />
            );
          })}
          {filteredSignatures.length === 0 && (
            <EmptyState icon={t("ui_icon_find_in_page", "find_in_page")} title={t("comp_no_heuristics", "No Heuristics Found")} className="col-span-full py-16" />
          )}
        </div>
      )}

      <SidePanel
        isOpen={!!inspectingSig}
        onClose={() => setInspectingSig(null)}
        title={t("inspect_core_heuristic", "Inspect Core Heuristic")}
        subtitle={inspectingSig ? `ID: ${inspectingSig.id}` : undefined}
        icon={t("icon_shield_lock", "shield_lock")}
        widthClass="w-[540px]"
      >
        {inspectingSig && (
          <div className="flex flex-col gap-6">
            <SidePanelHeroCard
              title={inspectingSig.signature || t("inspect_core_heuristic", "Inspect Core Heuristic")}
              subtitle={t(
                "core_heuristics_readonly_notice",
                "Core OS heuristic definitions are governed globally by Keepers Core and are read-only at the Spoke level."
              )}
              label={
                scope === "core"
                  ? t("core_os_badge", "Core OS")
                  : t("spoke_badge", "Spoke")
              }
              icon={
                scope === "core"
                  ? t("icon_shield_lock", "shield_lock")
                  : t("icon_bug_report", "bug_report")
              }
              variant={
                inspectingSig.severity === "malware"
                  ? "danger"
                  : inspectingSig.severity === "explicit"
                    ? "warning"
                    : "accent"
              }
              badges={[
                {
                  icon: inspectingSig.enabled ? t("icon_verified", "verified") : t("icon_block", "block"),
                  label: inspectingSig.enabled
                    ? t("status_active", "Active")
                    : t("status_disabled", "Disabled"),
                  colorClass: inspectingSig.enabled
                    ? "text-[var(--success)]"
                    : "text-[var(--danger)]",
                },
              ]}
            >
              <div className="grid grid-cols-2 gap-3 w-full">
                <StatBox
                  label={t("comp_match_type", "Match Type")}
                  value={inspectingSig.match_type || "--"}
                  icon={t("icon_account_tree", "account_tree")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("label_severity", "Severity")}
                  value={inspectingSig.severity || "--"}
                  icon={t("icon_shield_lock", "shield_lock")}
                  iconColorClass={
                    inspectingSig.severity === "malware"
                      ? "text-[var(--danger)]"
                      : inspectingSig.severity === "explicit"
                        ? "text-[var(--warning)]"
                        : "text-[var(--accent)]"
                  }
                />
              </div>
            </SidePanelHeroCard>

            <SidePanelTitleInput
              value={inspectingSig.signature || ""}
              readOnly={true}
            />

            <UniversalGroup title={t("core_heuristics_tab", "Core Heuristics")} icon={t("icon_memory", "memory")}>
              <UniversalInput
                label={t("auto_file_signature", "File Signature")}
                value={inspectingSig.signature || ""}
                onChange={() => {}}
                readOnly={true}
              />
              <UniversalInput
                label={t("comp_match_type", "Match Type")}
                value={inspectingSig.match_type || ""}
                onChange={() => {}}
                readOnly={true}
              />
              <UniversalTextArea
                label={t("reason", "Reason / Notes")}
                value={inspectingSig.notes || ""}
                onChange={() => {}}
                readOnly={true}
                rows={4}
              />
            </UniversalGroup>
          </div>
        )}
      </SidePanel>
    </>
  );
}
