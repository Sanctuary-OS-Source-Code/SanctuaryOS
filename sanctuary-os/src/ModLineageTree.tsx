import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import {
  GameVersionMultiSelect,
  SidePanel,
  SidePanelHeroCard,
  SidePanelTitleInput,
  UniversalGroup,
  ModSearchDropdown,
  ActionButton,
  HoverTooltip,
  EmptyState,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "./shared";
import { useStore } from "./store";

interface ModLineageTreeProps {
  targetMod: any;
  cloudMods: any[];
  onRefresh?: () => void;
}

function EditableVersionRow({
  version,
  index,
  totalCount,
  onUpdate,
  cloudMods,
}: {
  version: any;
  index: number;
  totalCount: number;
  onUpdate: () => void;
  cloudMods: any[];
}) {
  const { t } = useLexicon();
  const [editingLabel, setEditingLabel] = useState(version.version_label || "");
  const [editingGameVersion, setEditingGameVersion] = useState(version.game_version || "");
  const [isReassigning, setIsReassigning] = useState(false);

  useEffect(() => {
    setEditingLabel(version.version_label || "");
    setEditingGameVersion(version.game_version || "");
  }, [version.version_label, version.game_version]);

  const handleSaveLabel = async () => {
    if (editingLabel === version.version_label) return;
    try {
      const { error } = await supabase
        .from("mod_versions")
        .update({ version_label: editingLabel })
        .eq("dna_hash", version.dna_hash)
        .select()
        .single();

      if (error) {
        console.error("Supabase update error:", error);
        useStore.getState().pushStatus(`Failed to update: ${error.message}`);
        return;
      }
      onUpdate();
    } catch (err) {
      console.error("Failed to update version label:", err);
    }
  };

  const handleSaveGameVersion = async () => {
    if (editingGameVersion === version.game_version) return;
    try {
      await invoke("update_mod_history_entry", {
        historyId: version.id || version.dna_hash,
        label: version.version_label,
        gameVersion: editingGameVersion,
      });
      onUpdate();
    } catch (err) {
      console.error("Failed to update game version:", err);
    }
  };

  const handleDelete = async () => {
    if (confirm(t("lineage_confirm_delete", "Delete this version entry?"))) {
      try {
        const { error } = await supabase
          .from("mod_versions")
          .delete()
          .eq("dna_hash", version.dna_hash);
        if (error) {
          useStore.getState().pushStatus(`Failed to delete: ${error.message}`);
        } else {
          onUpdate();
        }
      } catch (err) {
        console.error("Delete error", err);
      }
    }
  };

  const handleReassign = async (mod: any) => {
    if (!mod) return;
    try {
      const { error } = await supabase
        .from("mod_versions")
        .update({ mod_id: mod.id })
        .eq("dna_hash", version.dna_hash)
        .select()
        .single();
      if (error) throw error;
      setIsReassigning(false);
      onUpdate();
    } catch (err) {
      console.error("Reassign error", err);
    }
  };

  return (
    <div className="relative group/item flex flex-col p-5 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.15)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] transition-all duration-300 isolate">
      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity pointer-events-none " />

      {/* Top Row: Icon + Badge */}
      <div className="flex items-start justify-start gap-3 mb-4 relative z-10">
        <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
          <span className="text-[16px] font-black text-[var(--accent)] drop-shadow-md">
            {index === 0 ? "★" : totalCount - index}
          </span>
        </div>
        {index === 0 && (
          <span className="px-2 py-0.5 rounded-md bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[9px] font-black capitalize tracking-widest text-[var(--accent)] mt-1">
            {t("lineage_latest", "Latest")}
          </span>
        )}
      </div>

      {/* Middle Row: Name & Game Versions */}
      <div className="flex flex-col min-w-0 flex-1 justify-center relative z-10 mb-6 gap-3">
        <input
          type="text"
          value={editingLabel}
          onChange={(e) => setEditingLabel(e.target.value)}
          onBlur={handleSaveLabel}
          onKeyDown={(e) => e.key === "Enter" && handleSaveLabel()}
          placeholder={`Version ${totalCount - index}`}
          className="text-[14px] font-black text-[var(--text)] capitalize glass-surface border-b-2 border-transparent outline-none focus:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all px-3 py-2 w-full truncate rounded-t-xl shadow-inner placeholder:text-[color-mix(in_srgb,var(--text)_30%,transparent)] placeholder:tracking-widest"
        />
        <div className="relative z-[9999] pointer-events-auto">
          <GameVersionMultiSelect
            selectedVersions={
              typeof version.game_version === "string"
                ? version.game_version
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean)
                : Array.isArray(version.game_version)
                  ? version.game_version
                  : []
            }
            onChange={async (newVals: string[]) => {
              const newVersion = newVals.join(", ");
              if (newVersion === version.game_version) return;
              try {
                const { error } = await supabase
                  .from("mod_versions")
                  .update({ game_version: newVersion })
                  .eq("dna_hash", version.dna_hash)
                  .select()
                  .single();

                if (error) {
                  useStore.getState().pushStatus(`Failed to update: ${error.message}`);
                  return;
                }
                onUpdate();
              } catch (err) {
                console.error("Failed to update game version:", err);
                useStore.getState().pushStatus(`Error: ${err}`);
              }
            }}
          />
        </div>
      </div>

      {/* Bottom Row: Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-auto pt-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] relative z-10 opacity-60 group-hover/item:opacity-100 transition-opacity duration-300 min-h-[57px]">
        {isReassigning ? (
          <div className="flex items-center gap-2 w-full bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] p-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <div className="flex-1 min-w-0">
              <ModSearchDropdown
                modList={cloudMods || []}
                onSelect={handleReassign}
                selectedItem={null}
                onClear={() => {}}
                placeholder={t("lineage_reassign_ph", "Select new {mod}...")}
              />
            </div>
            <button
              onClick={() => setIsReassigning(false)}
              className="group relative w-8 h-8 flex items-center justify-center rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] transition-all shrink-0"
            >
              <HoverTooltip title={t("cancel", "Cancel")} />
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_close", "close")}
              </span>
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setIsReassigning(true)}
              className="group relative flex-1 px-3 py-2 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[9px] font-black capitalize hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:text-[var(--accent)] transition-all flex items-center justify-center gap-1.5"
            >
              <HoverTooltip title={t("lineage_btn_reassign", "Reassign {Mod}")} />
              <span className="material-symbols-outlined !text-[14px]">
                {t("icon_move_up", "move_up")}
              </span>{" "}
              {t("lineage_btn_reassign", "Reassign {Mod}")}
            </button>
            <button
              onClick={handleDelete}
              className="group relative px-3 py-2 shrink-0 rounded-xl flex items-center justify-center glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[color-mix(in_srgb,var(--text)_70%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:text-[var(--danger)] transition-all"
            >
              <HoverTooltip title={t("lineage_btn_delete", "Delete")} variant="danger" />
              <span className="material-symbols-outlined !text-[16px]">
                {t("icon_delete", "delete")}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ModLineageTree({ targetMod, cloudMods, onRefresh }: ModLineageTreeProps) {
  const { t } = useLexicon();
  const [versionHistory, setVersionHistory] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newVersionLabel, setNewVersionLabel] = useState("");
  const [newGameVersion, setNewGameVersion] = useState("");
  const [newDnaHash, setNewDnaHash] = useState("");

  const fetchVersionHistory = async () => {
    if (!targetMod) {
      setVersionHistory([]);
      return;
    }

    const { data: versions } = await supabase
      .from("mod_versions")
      .select("*")
      .eq("mod_id", targetMod.id)
      .order("created_at", { ascending: false });

    if (versions) {
      setVersionHistory(versions);
    } else {
      setVersionHistory([]);
    }
  };

  useEffect(() => {
    fetchVersionHistory();
  }, [targetMod]);

  const handleAddVersion = async () => {
    if (!newVersionLabel.trim()) return;

    try {
      if (!newDnaHash || !newDnaHash.trim()) {
        useStore.getState().pushStatus(t("auto_dna_hash_is_45", "DNA hash is required."));
        return;
      }

      const { data, error } = await supabase
        .from("mod_versions")
        .insert({
          mod_id: targetMod.id,
          dna_hash: newDnaHash.trim(),
          version_label: newVersionLabel.trim(),
          game_version: newGameVersion.trim() || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Supabase insert error:", error);
        useStore.getState().pushStatus(`Failed to add version: ${error.message}`);
        return;
      }

      setVersionHistory([data, ...versionHistory]);
      setShowAddModal(false);
      setNewVersionLabel("");
      setNewGameVersion("");
      setNewDnaHash("");
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Failed to add new version:", err);
      useStore.getState().pushStatus(`Failed to add version: ${err}`);
    }
  };

  if (!targetMod) return null;

  return (
    <>
      <div className="flex flex-col h-full w-full min-w-0 p-2">
        <div className="flex justify-between items-center pb-4 mb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-10 mt-2">
          <div className="flex flex-col gap-1">
            <h3 className="text-[13px] font-black capitalize tracking-[0.2em] text-[var(--text)] flex items-center gap-2">
              <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] drop-shadow-md">
                {t("icon_timeline", "timeline")}
              </span>
              {t("btn_timeline", "Version Lineage")}
            </h3>
            <p className="text-[9px] font-bold text-[var(--subtext)] opacity-70 capitalize tracking-widest">
              {t("lineage_timeline_desc", "Chronological release timeline for this {mod}")}
            </p>
          </div>
          <ActionButton
            onClick={() => setShowAddModal(true)}
            icon={t("icon_add", "add")}
            label={t("lineage_add_version", "Add Version")}
            className="!px-5 !py-2 !h-9 !text-[9px] !rounded-lg"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 relative z-10 flex-1 overflow-y-auto custom-scrollbar p-2 content-start">
          {versionHistory.length === 0 ? (
            <EmptyState
              icon={t("icon_timeline", "timeline")}
              title={t("no_links", "No Version History")}
              className="col-span-full py-16"
            />
          ) : (
            versionHistory.map((version, index) => (
              <EditableVersionRow
                key={version.id || version.dna_hash || index}
                version={version}
                index={index}
                totalCount={versionHistory.length}
                onUpdate={() => {
                  fetchVersionHistory();
                  if (onRefresh) onRefresh();
                }}
                cloudMods={cloudMods}
              />
            ))
          )}
        </div>
      </div>

      <SidePanel
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setNewVersionLabel("");
          setNewGameVersion("");
          setNewDnaHash("");
        }}
        title={t("lineage_add_version_modal_title", "Add Version Entry")}
        subtitle={targetMod?.name || t("btn_timeline", "Version Lineage")}
        icon={t("icon_add_box", "add_box")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              variant="accent"
              tooltip={t("lineage_add_version", "Add Version")}
              disabled={!newVersionLabel.trim() || !newDnaHash.trim()}
              onClick={handleAddVersion}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_add_box", "add_box")}
            overline={t("btn_timeline", "Version Lineage")}
            title={t("lineage_add_version_modal_title", "Register New Version")}
            description={t("lineage_add_version_note", "Note: This will prompt you to select a file hash from your {vault} after clicking \"Add Version\"")}
            badge={targetMod?.name}
            variant="accent"
          />

          <SidePanelTitleInput
            label={t("lineage_version_label", "Version Label")}
            value={newVersionLabel}
            onChange={setNewVersionLabel}
            onKeyDown={(e) => e.key === "Enter" && handleAddVersion()}
            placeholder={t("ph_version", "e.g. v1.2.0")}
          />

          <UniversalGroup
            title={t("lineage_version_label", "Version Parameters")}
            icon={t("icon_timeline", "timeline")}
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                  {t("label_game_version", "Game Version")}
                </label>
                <input
                  type="text"
                  value={newGameVersion}
                  onChange={(e) => setNewGameVersion(e.target.value)}
                  placeholder={t("ph_game_version", "e.g. 1.108.335")}
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                  {t("label_dna_hash", "DNA Hash")}
                </label>
                <input
                  type="text"
                  value={newDnaHash}
                  onChange={(e) => setNewDnaHash(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddVersion()}
                  placeholder={t("ph_dna_hash", "SHA-256 / DNA Hash")}
                  className="w-full glass-surface border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-[var(--accent)] transition-all text-[var(--text)]"
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </>
  );
}
