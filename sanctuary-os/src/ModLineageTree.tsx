import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { GameVersionMultiSelect, SidePanel, standardAccentGlassButtonClass, standardSuccessButtonClass, standardDangerButtonClass, ModSearchDropdown, ActionButton, HoverTooltip } from "./shared";
import { useStore } from './store';

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
  cloudMods
}: { 
  version: any; 
  index: number; 
  totalCount: number; 
  onUpdate: () => void;
  cloudMods: any[];
}) {
  const { t } = useLexicon();
  const [editingLabel, setEditingLabel] = useState(version.version_label || '');
  const [editingGameVersion, setEditingGameVersion] = useState(version.game_version || '');
  const [isReassigning, setIsReassigning] = useState(false);

  useEffect(() => {
    setEditingLabel(version.version_label || '');
    setEditingGameVersion(version.game_version || '');
  }, [version.version_label, version.game_version]);

  const handleSaveLabel = async () => {
    if (editingLabel === version.version_label) return;
    try {
      const { error } = await supabase
        .from('mod_versions')
        .update({ version_label: editingLabel })
        .eq('dna_hash', version.dna_hash)
        .select()
        .single();
      
      if (error) {
        console.error('Supabase update error:', error);
        useStore.getState().pushStatus(`Failed to update: ${error.message}`);
        return;
      }
      onUpdate();
    } catch (err) {
      console.error('Failed to update version label:', err);
    }
  };

  const handleSaveGameVersion = async () => {
    if (editingGameVersion === version.game_version) return;
    try {
      await invoke('update_mod_history_entry', { 
        historyId: version.id || version.dna_hash, 
        label: version.version_label, 
        gameVersion: editingGameVersion 
      });
      onUpdate(); 
    } catch (err) {
      console.error('Failed to update game version:', err);
    }
  };

  const handleDelete = async () => {
    if (confirm(t("lineage_confirm_delete"))) {
      try {
        const { error } = await supabase.from('mod_versions').delete().eq('dna_hash', version.dna_hash);
        if (error) {
          useStore.getState().pushStatus(`Failed to delete: ${error.message}`);
        } else {
          onUpdate();
        }
      } catch (err) {
        console.error('Delete error', err);
      }
    }
  };

  const handleReassign = async (mod: any) => {
    if (!mod) return;
    try {
      const { data, error } = await supabase.from('mod_versions').update({ mod_id: mod.id }).eq('dna_hash', version.dna_hash).select().single();
      if (error) throw error;
      setIsReassigning(false);
      onUpdate();
    } catch (err) {
      console.error('Reassign error', err);
    }
  };

  return (
    <div className="relative group/item flex flex-col p-5 rounded-3xl glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_10px_30px_rgba(var(--accent-rgb),0.15)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] transition-all duration-300 isolate">
      <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity pointer-events-none rounded-3xl" />
      
      {/* Top Row: Icon + Badge */}
      <div className="flex items-start justify-start gap-3 mb-4 relative z-10">
        <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
          <span className="text-[16px] font-black text-[var(--accent)] drop-shadow-md">
            {index === 0 ? '★' : totalCount - index}
          </span>
        </div>
        {index === 0 && (
          <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[9px] font-black capitalize tracking-widest text-[var(--accent)] shadow-[inset_0_0_10px_rgba(var(--accent-rgb),0.1)] mt-1">
            {t("lineage_latest")}
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
          onKeyDown={(e) => e.key === 'Enter' && handleSaveLabel()}
          placeholder={`Version ${totalCount - index}`}
          className="text-[14px] font-black text-[var(--text)] capitalize bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-b-2 border-transparent outline-none focus:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all px-3 py-2 w-full truncate rounded-t-xl shadow-inner placeholder:text-[color-mix(in_srgb,var(--text)_30%,transparent)] placeholder:tracking-widest"
        />
        <div className="relative z-[9999] pointer-events-auto">
          <GameVersionMultiSelect
            selectedVersions={
              typeof version.game_version === 'string'
                ? version.game_version.split(',').map((s: string) => s.trim()).filter(Boolean)
                : (Array.isArray(version.game_version) ? version.game_version : [])
            }
            onChange={async (newVals: string[]) => {
              const newVersion = newVals.join(', ');
              if (newVersion === version.game_version) return;
              try {
                const { error } = await supabase
                  .from('mod_versions')
                  .update({ game_version: newVersion })
                  .eq('dna_hash', version.dna_hash)
                  .select()
                  .single();
                
                if (error) {
                  useStore.getState().pushStatus(`Failed to update: ${error.message}`);
                  return;
                }
                onUpdate(); 
              } catch (err) {
                console.error('Failed to update game version:', err);
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
                placeholder={t("lineage_reassign_ph")}
              />
            </div>
            <button onClick={() => setIsReassigning(false)} className="group relative w-8 h-8 flex items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] transition-all shrink-0">
              <HoverTooltip title={t("icon_close")} />
              <span className="material-symbols-outlined !text-[16px]">{t("icon_close")}</span>
            </button>
          </div>
        ) : (
          <>
            <button onClick={() => setIsReassigning(true)} className="group relative flex-1 px-3 py-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] text-[9px] font-black capitalize hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:text-[var(--accent)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)] transition-all flex items-center justify-center gap-1.5">
              <HoverTooltip title={t("lineage_btn_reassign")} />
              <span className="material-symbols-outlined !text-[14px]">{t("icon_move_up")}</span> {t("lineage_btn_reassign")}
            </button>
            <button onClick={handleDelete} className="group relative px-3 py-2 shrink-0 rounded-xl flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[color-mix(in_srgb,var(--text)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] hover:text-[var(--danger)] hover:shadow-[0_0_15px_rgba(var(--danger-rgb),0.2)] transition-all">
              <HoverTooltip title={t("lineage_btn_delete")} variant="danger" />
              <span className="material-symbols-outlined !text-[16px]">delete</span>
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
  const [newVersionLabel, setNewVersionLabel] = useState('');
  const [newGameVersion, setNewGameVersion] = useState('');
  const [newDnaHash, setNewDnaHash] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchVersionHistory = async () => {
    if (!targetMod) {
      setVersionHistory([]);
      return;
    }

    const { data: versions } = await supabase
      .from('mod_versions')
      .select('*')
      .eq('mod_id', targetMod.id)
      .order('created_at', { ascending: false });

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
        useStore.getState().pushStatus(t("auto_dna_hash_is_45"));
        return;
      }

      const { data, error } = await supabase
        .from('mod_versions')
        .insert({
          mod_id: targetMod.id,
          dna_hash: newDnaHash.trim(),
          version_label: newVersionLabel.trim(),
          game_version: newGameVersion.trim() || null
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase insert error:', error);
        useStore.getState().pushStatus(`Failed to add version: ${error.message}`);
        return;
      }

      setVersionHistory([data, ...versionHistory]);
      setShowAddModal(false);
      setNewVersionLabel('');
      setNewGameVersion('');
      setNewDnaHash('');
      setIsAdding(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to add new version:', err);
      useStore.getState().pushStatus(`Failed to add version: ${err}`);
    }
  };

  if (!targetMod) return null;

  return (
    <>
    <div className="w-full h-full glass-panel rounded-[32px] p-6 md:p-8 border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-md backdrop-blur-3xl [transform:translateZ(0)] [backface-visibility:hidden]">
      
      {/* Hero Background Effects */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full blur-[60px] pointer-events-none translate-y-1/3 -translate-x-1/3" />

      <div className="flex justify-start items-end pb-4 mb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative z-10 mt-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-[13px] font-black capitalize tracking-[0.2em] text-[var(--text)] flex items-center gap-2">
            <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] drop-shadow-md">{t("icon_timeline")}</span>
            {t("lineage_version_history")}
          </h3>
          <p className="text-[9px] font-bold text-[var(--subtext)] opacity-70 capitalize tracking-widest">
            {t("lineage_timeline_desc")}
          </p>
        </div>
        <ActionButton
          onClick={() => setShowAddModal(true)}
          icon="add"
          label={t("lineage_add_version")}
          className="!px-5 !py-2 !h-9 !text-[9px] !rounded-lg"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 relative z-10 flex-1 overflow-y-auto accent-scrollbar p-2 content-start">
        {versionHistory.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 opacity-40 border border-dashed border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl bg-[color-mix(in_srgb,var(--bg)_40%,transparent)]">
             <span className="material-symbols-outlined ">{t("icon_timeline")}</span>
             <span className="text-[10px] font-black capitalize tracking-[0.2em]">{t("no_links")}</span>
          </div>
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
      onClose={() => { setShowAddModal(false); setNewVersionLabel(''); setNewGameVersion(''); setNewDnaHash(''); }}
      title={t("lineage_add_version_modal_title")}
      icon="add_box"
      footer={
        <div className="flex justify-end gap-4 w-full">
          <ActionButton
            onClick={() => { setShowAddModal(false); setNewVersionLabel(''); setNewGameVersion(''); setNewDnaHash(''); }} label={t("nav_cancel")}
          >
            
          </ActionButton>
          <ActionButton
            onClick={handleAddVersion}
            disabled={!newVersionLabel.trim() || !newDnaHash.trim()} label={t("lineage_add_version")} icon={t("icon_save")}
          >
            
            
          </ActionButton>
        </div>
      }
    >
      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-[var(--subtext)] capitalize tracking-[0.2em]">{t("lineage_version_label")}</label>
          <input
            autoFocus
            type="text"
            value={newVersionLabel}
            onChange={(e) => setNewVersionLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddVersion()}
            placeholder={t("ph_version")}
            className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] focus:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all text-[var(--text)] shadow-inner"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-[var(--subtext)] capitalize tracking-[0.2em]">{t("lineage_game_version")}</label>
          <input
            type="text"
            value={newGameVersion}
            onChange={(e) => setNewGameVersion(e.target.value)}
            placeholder={t("ph_game_version")}
            className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] focus:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all text-[var(--text)] shadow-inner"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-[var(--subtext)] capitalize tracking-[0.2em]">{t("label_dna_hash")}</label>
          <input
            type="text"
            value={newDnaHash}
            onChange={(e) => setNewDnaHash(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddVersion()}
            placeholder={t("ph_dna_hash")}
            className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-2xl px-5 py-4 text-sm font-mono font-bold focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all text-[var(--text)] shadow-inner"
          />
        </div>
        
        <div className="bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] rounded-2xl p-4 flex items-start gap-3 mt-2">
          <span className="material-symbols-outlined text-[var(--accent)] !text-[18px] mt-0.5">{t("icon_info")}</span>
          <p className="text-[10px] font-bold text-[var(--text)] opacity-80 capitalize tracking-widest leading-relaxed">
            {t("lineage_add_version_note")}
          </p>
        </div>
      </div>
    </SidePanel>
    </>
  );
}
