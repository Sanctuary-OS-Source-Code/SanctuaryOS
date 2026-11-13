import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  GameVersionMultiSelect,
  CustomDatePicker,
  CustomDropdown,
  CustomComplianceDropdown,
  CustomClassificationDropdown,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  SidePanelTitleInput,
  SidePanelPillToggle,
  UniversalGroup,
  toHighlanderSlotSlug,
} from "../shared";
import { CustomStatusDropdown, CustomMasonDropdown } from "../ArchitectHub";
import { logArchitectAction, computeAuditDiff } from "../lib/audit";

export function SharedMetadataEditorSidePanel({
  isOpen,
  onClose,
  activeMod,
  initialModId,
  masonsList,
  onModUpdated,
  isOversight = true,
}: {
  isOpen: boolean;
  onClose: () => void;
  activeMod?: any;
  initialModId?: string;
  masonsList?: any[];
  onModUpdated?: () => void;
  isOversight?: boolean;
}) {
  const { t } = useLexicon();
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const userRole = useStore((state) => state.userRole);
  const canFinalizeCompliance =
    isOversight &&
    ["oversight", "wayfinder", "admin", "keeper"].includes(
      String(userRole || "").toLowerCase()
    );
  const [modForm, setModForm] = useState<any>(null);
  const [originalMod, setOriginalMod] = useState<any>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [localMasonsList, setLocalMasonsList] = useState<any[]>(
    masonsList || []
  );
  const [highlanderSlots, setHighlanderSlots] = useState<any[]>([]);

  useEffect(() => {
    if (activeMod) {
      if (!isOversight && Number(activeMod?.compliance_tier || 0) > 0) {
        setModForm({ _error: true, id: activeMod.id });
        return;
      }
      const cloned = JSON.parse(JSON.stringify(activeMod));
      setOriginalMod(cloned);
      setModForm({ ...cloned });
    } else if (initialModId && isOpen) {
      const fetchMod = async () => {
        let modId = initialModId;
        if (initialModId.length === 64) {
          const { data: mvData } = await supabase
            .from("mod_versions")
            .select("mod_id")
            .eq("dna_hash", initialModId)
            .single();
          if (mvData && mvData.mod_id) {
            modId = mvData.mod_id;
          } else {
            setModForm({ _error: true, id: initialModId });
            return;
          }
        }

        const { data } = await supabase
          .from("mods")
          .select("*")
          .eq("id", modId)
          .single();
        if (data && (isOversight || Number(data?.compliance_tier || 0) === 0)) {
          const cloned = JSON.parse(JSON.stringify(data));
          setOriginalMod(cloned);
          setModForm({ ...cloned });
        } else {
          setModForm({ _error: true, id: initialModId });
        }
      };
      fetchMod();
    } else if (!isOpen) {
      setModForm(null);
      setOriginalMod(null);
    }
  }, [activeMod, initialModId, isOpen, isOversight]);

  useEffect(() => {
    if (!masonsList && isOpen) {
      supabase
        .from("masons")
        .select("id, name")
        .then(({ data }) => {
          if (data) setLocalMasonsList(data);
        });
    } else if (masonsList) {
      setLocalMasonsList(masonsList);
    }
    if (isOpen) {
      supabase
        .from("flavor_groups")
        .select("id, name, slug")
        .order("name")
        .then(async ({ data, error }) => {
          if (!error && data) {
            setHighlanderSlots(data);
          } else {
            const fb = await supabase
              .from("flavor_groups")
              .select("id, name")
              .order("name");
            if (fb.data) setHighlanderSlots(fb.data);
          }
        });
    }
  }, [masonsList, isOpen]);

  const handleCommitChanges = async () => {
    if (!modForm) return;
    setIsCommitting(true);
    try {
      const targetTier = Number(modForm.compliance_tier || 0);
      const shouldRoutePending = !canFinalizeCompliance && targetTier >= 1;
      const rawReason = String(modForm.status_reason || "").trim();
      const cleanedReason =
        (modForm.status === "stable" || modForm.status === "verified") &&
        /^\[ARCHITECT\b/i.test(rawReason)
          ? null
          : rawReason || null;
      const updatedPayload = {
        name: modForm.name,
        category_override: modForm.category_override,
        sub_type: modForm.sub_type,
        file_extension: modForm.file_extension,
        status: shouldRoutePending ? "pending" : modForm.status,
        status_reason: shouldRoutePending
          ? `[ARCHITECT METADATA EDITOR] Flagged Tier ${Math.min(4, targetTier)} for Oversight Compliance review`
          : cleanedReason,
        url: modForm.url,
        image_url: modForm.image_url,
        latest_version: modForm.latest_version,
        description: modForm.description,
        compatible_versions: modForm.compatible_versions,
        family_slug: modForm.family_slug,
        mason_id: modForm.mason_id,
        compliance_tier: shouldRoutePending ? Math.min(4, targetTier) : targetTier,
        folder_structure: modForm.folder_structure || [],
        is_paid: modForm.is_paid || false,
        is_early_access: modForm.is_early_access || false,
        highlander_group_id: modForm.highlander_group_id || null,
        updated_at: new Date().toISOString(),
      };
      await supabase
        .from("mods")
        .update(updatedPayload)
        .eq("id", modForm.id);
      await logArchitectAction(
        shouldRoutePending ? "Flagged Mod for Oversight Compliance" : "Updated Mod Metadata",
        "mods",
        modForm.name || modForm.id,
        shouldRoutePending ? `Flagged Tier ${Math.min(4, targetTier)} (Pending)` : undefined,
        canFinalizeCompliance ? "Oversight Command" : "Architect Console",
        false,
        computeAuditDiff(originalMod || activeMod, updatedPayload)
      );
      if (shouldRoutePending) {
        useStore
          .getState()
          .pushStatus(
            t(
              "nexus_mod_flagged_compliance_toast",
              "{Mod} flagged for Oversight Compliance review (Pending)."
            ),
            "warning"
          );
      }
      if (onModUpdated) onModUpdated();
    } catch (err) {
      console.error(err);
    }
    setIsCommitting(false);
    onClose();
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      panelZ="z-[60000]"
      backdropZ="z-[59999]"
      widthClass="w-[90vw] md:w-[680px]"
      title={t("ui_edit_metadata", "Edit Metadata")}
      subtitle={`UUID: ${modForm?.id || initialModId || ""}`}
      icon={t("icon_inventory_2", "inventory_2")}
      iconColorClass="theme-text-accent"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_save", "save")}
            tooltip={
              isCommitting
                ? t("dossier_btn_saving", "Saving...")
                : t("ui_btn_commit", "Commit Changes")
            }
            variant="accent"
            disabled={isCommitting}
            onClick={handleCommitChanges}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        {!modForm ? (
          <div className="glass-panel rounded-2xl p-12 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined animate-spin !text-[24px] text-[var(--accent)]">
              {t("icon_sync", "sync")}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--subtext)]">
              {t("ui_loading", "Loading...")}
            </span>
          </div>
        ) : modForm._error ? (
          <SidePanelHeroCard
            icon={t("icon_error", "error")}
            overline={t("err_load_meta", "Failed to load {Mod} Metadata.")}
            title={t("err_load_meta", "Failed to load {Mod} Metadata.")}
            description={`ID: ${modForm.id || "Unknown"}`}
            variant="danger"
          />
        ) : (
          <>
            <SidePanelHeroCard
              icon={t("icon_inventory_2", "inventory_2")}
              overline={t("ui_edit_metadata", "Registry Metadata")}
              title={modForm.name || t("registry_label_name", "Artifact")}
              description={`UUID: ${modForm.id}`}
              badge={String(modForm.status || "unverified").toUpperCase()}
              badgeIcon={t("icon_verified", "verified")}
              variant="accent"
            />

            <SidePanelTitleInput
              label={t("registry_label_name", "Artifact Name")}
              value={modForm?.name || ""}
              onChange={(val) => setModForm({ ...modForm, name: val })}
              placeholder={t("registry_label_name", "Artifact Name")}
            />

            <UniversalGroup
              title={t("section_classification_creator", "Classification & {Mason}")}
              icon={t("icon_info", "info")}
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("mason", "{Mason}")}
                </label>
                <CustomMasonDropdown
                  value={modForm.mason_id}
                  onChange={(val: string) =>
                    setModForm({ ...modForm, mason_id: val })
                  }
                  options={localMasonsList}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("category", "Category")}
                  </label>
                  <CustomClassificationDropdown
                    value={modForm.category_override || "Script"}
                    onChange={(newType: string) =>
                      setModForm({ ...modForm, category_override: newType })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("label_file_ext", "File Extension")}
                  </label>
                  <input
                    value={modForm.file_extension || ""}
                    onChange={(e) =>
                      setModForm({ ...modForm, file_extension: e.target.value })
                    }
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={activeGameSchema?.extensions?.supported?.[0] || t("ph_file_ext", "e.g. .bin, .dll")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("registry_col_subcat", "Subcategory")}
                  </label>
                  <input
                    value={modForm.sub_type || ""}
                    onChange={(e) =>
                      setModForm({ ...modForm, sub_type: e.target.value })
                    }
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("auto_e_g_tuning_26", "e.g. Tuning")}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("highlander_exclusive_slot", "Exclusive Slot")}
                </label>
                <CustomDropdown
                  disableTint={true}
                  searchable={true}
                  searchPlaceholder={t(
                    "highlander_search_slots_ph",
                    "Search Exclusive Slots..."
                  )}
                  value={modForm.highlander_group_id || "__none__"}
                  options={[
                    {
                      id: "__none__",
                      label: t("highlander_slot_none", "None (Coexists Freely)"),
                    },
                    ...highlanderSlots.map((fg: any) => ({
                      id: String(fg.id),
                      label: fg.name,
                      badge: fg.slug || toHighlanderSlotSlug(fg.name),
                      searchText: `${fg.name || ""} ${fg.slug || ""}`,
                    })),
                  ]}
                  onChange={(v: string[]) => {
                    const picked = v[0];
                    setModForm({
                      ...modForm,
                      highlander_group_id:
                        !picked || picked === "__none__" ? null : picked,
                    });
                  }}
                />
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("resources", "Resources & Description")}
              icon={t("icon_link", "link")}
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("upload_desc", "Description")}
                </label>
                <textarea
                  value={modForm.description || ""}
                  onChange={(e) =>
                    setModForm({ ...modForm, description: e.target.value })
                  }
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold min-h-[96px] resize-y border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] custom-scrollbar"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("cc_cover_url", "Cover Image URL")}
                </label>
                <input
                  value={modForm.image_url || ""}
                  onChange={(e) =>
                    setModForm({ ...modForm, image_url: e.target.value })
                  }
                  className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder={t("auto_https", "https://...")}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("label_mason_version", "{Mason} Version")}
                  </label>
                  <input
                    value={modForm.latest_version || ""}
                    onChange={(e) =>
                      setModForm({ ...modForm, latest_version: e.target.value })
                    }
                    placeholder={t("ph_mod_version", "v1.0.0")}
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("ui_url", "Source URL")}
                  </label>
                  <input
                    value={modForm.url || ""}
                    onChange={(e) =>
                      setModForm({ ...modForm, url: e.target.value })
                    }
                    className="w-full glass-surface rounded-xl px-4 py-3 text-[var(--accent)] text-sm font-bold border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={t("auto_https", "https://...")}
                  />
                </div>
              </div>
            </UniversalGroup>

            <UniversalGroup
              title={t("section_status_safety_dates", "Status, Safety & Dates")}
              icon={t("icon_verified", "verified")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <SidePanelPillToggle
                  checked={modForm.is_paid || false}
                  onChange={(checked) =>
                    setModForm({ ...modForm, is_paid: checked })
                  }
                  label={t("label_is_paid", "Paid {Mod}")}
                  icon={t("icon_monetization_on", "monetization_on")}
                  variant="warning"
                />
                <SidePanelPillToggle
                  checked={modForm.is_early_access || false}
                  onChange={(checked) =>
                    setModForm({ ...modForm, is_early_access: checked })
                  }
                  label={t("badge_early_access", "Early Access")}
                  icon={t("icon_science", "science")}
                  variant="accent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("registry_label_status", "Verification Status")}
                  </label>
                  <CustomStatusDropdown
                    value={modForm.status || "unverified"}
                    onChange={(newStatus: string) =>
                      setModForm({ ...modForm, status: newStatus })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("registry_col_safety", "Safety Tier")}
                  </label>
                  <CustomComplianceDropdown
                    value={modForm.compliance_tier || 0}
                    onChange={(newTier: number) =>
                      setModForm({ ...modForm, compliance_tier: newTier })
                    }
                    maxTier={4}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  className={`text-[10px] font-black uppercase tracking-widest px-1 flex items-center gap-1.5 ${
                    modForm.status === "corrupted" || modForm.status === "broken"
                      ? "text-[var(--danger)]"
                      : modForm.status === "unstable"
                        ? "text-[var(--warning)]"
                        : "text-[var(--subtext)] opacity-75"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[13px]">
                    {t("icon_report_problem", "report_problem")}
                  </span>
                  {t(
                    "label_status_issue_details",
                    "Issue & Cause Details (Corrupted / Unstable)"
                  )}
                </label>
                <textarea
                  value={
                    /^\[ARCHITECT\b/i.test(String(modForm.status_reason || "").trim())
                      ? ""
                      : modForm.status_reason || ""
                  }
                  onChange={(e) =>
                    setModForm({ ...modForm, status_reason: e.target.value })
                  }
                  placeholder={t(
                    "ph_status_issue_details",
                    "Explain what the issue is and what is causing it (shown on {Citizen} Alerts & {Mod} Dossier)..."
                  )}
                  className={`w-full glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-xs font-semibold min-h-[76px] resize-y border focus:outline-none custom-scrollbar ${
                    modForm.status === "corrupted" || modForm.status === "broken"
                      ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] focus:border-[var(--danger)]"
                      : modForm.status === "unstable"
                        ? "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] focus:border-[var(--warning)]"
                        : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)]"
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("uploaded_date", "Uploaded Date")}
                  </label>
                  <CustomDatePicker
                    value={modForm.created_at || null}
                    onChange={(date: any) =>
                      setModForm({ ...modForm, created_at: date })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                    {t("updated_date", "Updated Date")}
                  </label>
                  <CustomDatePicker
                    value={modForm.updated_at || null}
                    onChange={(date: any) =>
                      setModForm({ ...modForm, updated_at: date })
                    }
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest px-1">
                  {t("game_versions", "Compatible Game Versions")}
                </label>
                <GameVersionMultiSelect
                  selectedVersions={modForm.compatible_versions || []}
                  onChange={(v: string[]) =>
                    setModForm({ ...modForm, compatible_versions: v })
                  }
                />
              </div>
            </UniversalGroup>
          </>
        )}
      </div>
    </SidePanel>
  );
}
