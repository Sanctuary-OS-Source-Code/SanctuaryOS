import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  GameVersionMultiSelect,
  CustomDatePicker,
  CustomComplianceDropdown,
  CustomClassificationDropdown,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  SidePanelHeroCard,
  SidePanelTitleInput,
  SidePanelPillToggle,
  UniversalGroup,
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
}: {
  isOpen: boolean;
  onClose: () => void;
  activeMod?: any;
  initialModId?: string;
  masonsList?: any[];
  onModUpdated?: () => void;
}) {
  const { t } = useLexicon();
  const [modForm, setModForm] = useState<any>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [localMasonsList, setLocalMasonsList] = useState<any[]>(
    masonsList || []
  );

  useEffect(() => {
    if (activeMod) {
      setModForm({ ...activeMod });
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
        if (data) {
          setModForm(data);
        } else {
          setModForm({ _error: true, id: initialModId });
        }
      };
      fetchMod();
    } else if (!isOpen) {
      setModForm(null);
    }
  }, [activeMod, initialModId, isOpen]);

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
  }, [masonsList, isOpen]);

  const handleCommitChanges = async () => {
    if (!modForm) return;
    setIsCommitting(true);
    try {
      await supabase
        .from("mods")
        .update({
          name: modForm.name,
          category_override: modForm.category_override,
          sub_type: modForm.sub_type,
          file_extension: modForm.file_extension,
          status: modForm.status,
          url: modForm.url,
          image_url: modForm.image_url,
          latest_version: modForm.latest_version,
          description: modForm.description,
          compatible_versions: modForm.compatible_versions,
          family_slug: modForm.family_slug,
          mason_id: modForm.mason_id,
          compliance_tier: modForm.compliance_tier,
          folder_structure: modForm.folder_structure || [],
          is_paid: modForm.is_paid || false,
          is_early_access: modForm.is_early_access || false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", modForm.id);
      await logArchitectAction(
        "Updated Mod Metadata",
        "mods",
        modForm.name || modForm.id,
        undefined,
        "Architect Console",
        false,
        computeAuditDiff(activeMod, modForm)
      );
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
              title={t("btn_view", "Classification & Creator")}
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
                    placeholder={t("ph_file_ext", ".package")}
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
              title={t("compliance_tier", "Status, Safety & Dates")}
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
