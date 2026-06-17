import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { GameVersionMultiSelect, SidePanel, standardAccentGlassButtonClass, standardSuccessButtonClass, standardDangerButtonClass, ModSearchDropdown } from "./shared";

interface ModLineageTreeProps {
  targetMod: any;
  cloudMods: any[];
  onRefresh?: () => void;
}

// Extracted sub-component with isolated hooks
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
        .eq('dna_hash', version.dna_hash);
      
      if (error) {
        console.error('Supabase update error:', error);
        alert(`Failed to update: ${error.message}`);
      } else {
        onUpdate(); // Refresh parent data
      }
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
      onUpdate(); // Refresh parent data
    } catch (err) {
      console.error('Failed to update game version:', err);
    }
  };

  const handleDelete = async () => {
    if (confirm(t("lineage_confirm_delete") || "Are you sure you want to delete this version?")) {
      try {
        const { error } = await supabase.from('mod_versions').delete().eq('dna_hash', version.dna_hash);
        if (error) {
          alert(`Failed to delete: ${error.message}`);
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
      const { error } = await supabase.from('mod_versions').update({ mod_id: mod.id }).eq('dna_hash', version.dna_hash);
      if (error) {
         alert(`Failed to reassign: ${error.message}`);
      } else {
         setIsReassigning(false);
         onUpdate();
      }
    } catch (err) {
      console.error('Reassign error', err);
    }
  };

  return (
    <div className="group flex items-start gap-4 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-white/5 rounded-2xl p-5 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)]/30 hover:shadow-lg transition-all relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      {/* Timeline connector (Neon Track) */}
      {index < totalCount - 1 && (
        <div className="absolute left-[35px] top-[60px] w-[2px] h-[calc(100%+20px)] bg-gradient-to-b from-[var(--accent)] via-[var(--accent)]/40 to-[var(--text)]/10 shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)] z-0" />
      )}
      
      {/* Version indicator */}
      <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/50 flex items-center justify-center shrink-0 z-10 shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)] group-hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.6)] group-hover:scale-110 transition-all">
        <span className="text-xs font-black text-[var(--accent)] drop-shadow-md">
          {index === 0 ? '★' : totalCount - index}
        </span>
      </div>

      <div className="flex flex-col min-w-0 flex-1 gap-2 relative z-10">
        {/* Editable Version Label */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={editingLabel}
            onChange={(e) => setEditingLabel(e.target.value)}
            onBlur={handleSaveLabel}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveLabel()}
            placeholder={`Version ${totalCount - index}`}
            className="text-sm font-black text-[var(--text)] uppercase bg-transparent border-b-2 border-transparent outline-none focus:border-[var(--accent)] hover:border-white/20 transition-colors px-1 py-1 w-full"
          />
          {index === 0 && (
            <span className="px-3 py-1 bg-[var(--accent)]/20 border border-[var(--accent)]/40 rounded-full text-[9px] font-black uppercase text-[var(--accent)] shrink-0 tracking-widest shadow-sm">
              {t("lineage_latest")}
            </span>
          )}
        </div>

        {/* Editable Game Version - Using GameVersionMultiSelect */}
        <div className="relative z-[9999] pointer-events-auto mt-1">
          <GameVersionMultiSelect
            selectedVersions={
              typeof version.game_version === 'string'
                ? version.game_version.split(',').map((s: string) => s.trim()).filter(Boolean)
                : (Array.isArray(version.game_version) ? version.game_version : [])
            }
            onChange={async (newVals: string[]) => {
              console.log('ModLineageTree onChange called with:', newVals);
              const newVersion = newVals.join(', ');
              try {
                const { data, error } = await supabase
                  .from('mod_versions')
                  .update({ game_version: newVersion })
                  .eq('dna_hash', version.dna_hash)
                  .select();
                
                if (error) {
                  console.error('Supabase update error:', error);
                  alert(`Failed to update: ${error.message}`);
                } else {
                  console.log('Supabase update success:', data);
                  onUpdate(); // Refresh the list
                }
              } catch (err) {
                console.error('Failed to update game version:', err);
                alert(`Error: ${err}`);
              }
            }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-2">
             <span className="material-symbols-outlined !text-[12px] opacity-40 text-[var(--subtext)]">{t("ui_icon_fingerprint") || "fingerprint"}</span>
             <span className="text-[9px] font-bold text-[var(--subtext)] opacity-50 truncate tracking-widest font-mono">
               {version.dna_hash}
             </span>
          </div>
          
          <div className="flex items-center gap-2">
            {isReassigning ? (
              <div className="flex items-center gap-2 bg-black/20 p-2 rounded-xl z-[9999] relative">
                 <div className="w-48">
                    <ModSearchDropdown
                      modList={cloudMods || []}
                      onSelect={handleReassign}
                      selectedItem={null}
                      onClear={() => {}}
                      placeholder={t("lineage_reassign_ph") || "Select artifact..."}
                    />
                 </div>
                 <button onClick={() => setIsReassigning(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-[var(--subtext)] shrink-0">
                   <span className="material-symbols-outlined !text-[16px]">close</span>
                 </button>
              </div>
            ) : (
              <>
                <button onClick={() => setIsReassigning(true)} className="px-3 py-1.5 rounded-lg border border-[var(--accent)]/30 text-[var(--accent)] text-[9px] font-black uppercase hover:bg-[var(--accent)]/10 transition-colors flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[12px]">move_up</span>
                  {t("lineage_btn_reassign") || "Reassign"}
                </button>
                <button onClick={handleDelete} className="px-3 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] text-[9px] font-black uppercase hover:bg-[var(--danger)]/10 transition-colors flex items-center gap-1">
                  <span className="material-symbols-outlined !text-[12px]">delete</span>
                  {t("lineage_btn_delete") || "Delete"}
                </button>
              </>
            )}
          </div>
        </div>
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
        alert('DNA hash is required to create a version entry');
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
        alert(`Failed to add version: ${error.message}`);
        return;
      }

      console.log('Version added successfully:', data);
      
      setShowAddModal(false);
      setNewVersionLabel('');
      setNewGameVersion('');
      setNewDnaHash('');
      fetchVersionHistory();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to add new version:', err);
      alert(`Failed to add version: ${err}`);
    }
  };

  if (!targetMod) return null;

  return (
    <>
    <div className="theme-glass-panel rounded-[2.5rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/5 backdrop-blur-3xl flex flex-col gap-6 relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-64 h-64 bg-[var(--accent)] opacity-[0.03] blur-[80px] pointer-events-none rounded-full group-hover:opacity-[0.05] transition-opacity duration-1000" />
      
      <div className="flex justify-between items-start border-b border-white/10 pb-6 relative z-10">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] flex items-center gap-2">
            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)]">{t("ui_icon_timeline") || "timeline"}</span>
            {t("lineage_version_history")}
          </h3>
          <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2">
            {t("lineage_timeline_desc")}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-6 py-3 rounded-2xl theme-glass-inner text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:theme-border-accent hover:scale-[1.02] active:scale-95 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
        >
          <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">{t("ui_icon_add") || "add"}</span>
          {t("lineage_add_version")}
        </button>
      </div>

      {versionHistory.length === 0 ? (
        <div className="py-12 text-center text-[10px] font-black uppercase tracking-[0.3em] opacity-30 border border-dashed border-white/10 rounded-2xl">
          {t("lineage_no_history")}
        </div>
      ) : (
        <div className="flex flex-col gap-4 relative z-10">
          {versionHistory.map((version, index) => (
            <EditableVersionRow
              key={version.dna_hash}
              version={version}
              index={index}
              totalCount={versionHistory.length}
              onUpdate={fetchVersionHistory}
              cloudMods={cloudMods}
            />
          ))}
        </div>
      )}
    </div>

    {/* Add Version SidePanel */}
    <SidePanel
      isOpen={showAddModal}
      onClose={() => { setShowAddModal(false); setNewVersionLabel(''); setNewGameVersion(''); setNewDnaHash(''); }}
      title={t("lineage_add_version_modal_title")}
      icon="add_box"
      footer={
        <div className="flex justify-end gap-4 w-full">
          <button
            onClick={() => { setShowAddModal(false); setNewVersionLabel(''); setNewGameVersion(''); setNewDnaHash(''); }}
            className="px-6 py-3 rounded-2xl bg-[var(--text)]/5 border border-white/5 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:border-white/20 hover:bg-[var(--text)]/10 transition-all active:scale-95"
          >
            {t("lineage_cancel")}
          </button>
          <button
            onClick={handleAddVersion}
            disabled={!newVersionLabel.trim() || !newDnaHash.trim()}
            className="px-6 py-3 rounded-2xl bg-[var(--accent)]/20 border border-[var(--accent)]/50 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:bg-[var(--accent)]/30 hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
          >
            <span className="material-symbols-outlined !text-[16px]">{t("ui_icon_save") || "save"}</span>
            {t("lineage_add_version_btn")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-[var(--subtext)] uppercase tracking-[0.2em]">{t("lineage_version_label")}</label>
          <input
            autoFocus
            type="text"
            value={newVersionLabel}
            onChange={(e) => setNewVersionLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddVersion()}
            placeholder="e.g. v1.1, v2.0"
            className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 focus:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all text-[var(--text)] shadow-inner"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-[var(--subtext)] uppercase tracking-[0.2em]">{t("lineage_game_version")}</label>
          <input
            type="text"
            value={newGameVersion}
            onChange={(e) => setNewGameVersion(e.target.value)}
            placeholder="e.g. 1.108.329.1020"
            className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:border-[var(--accent)]/50 focus:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all text-[var(--text)] shadow-inner"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-black text-[var(--subtext)] uppercase tracking-[0.2em]">DNA HASH (REQUIRED)</label>
          <input
            type="text"
            value={newDnaHash}
            onChange={(e) => setNewDnaHash(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddVersion()}
            placeholder="Enter the unique file hash"
            className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[var(--accent)]/30 rounded-2xl px-5 py-4 text-sm font-mono font-bold focus:outline-none focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-all text-[var(--text)] shadow-inner"
          />
        </div>
        
        <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded-2xl p-4 flex items-start gap-3 mt-2">
          <span className="material-symbols-outlined text-[var(--accent)] !text-[18px] mt-0.5">{t("ui_icon_info") || "info"}</span>
          <p className="text-[10px] font-bold text-[var(--text)] opacity-80 uppercase tracking-widest leading-relaxed">
            {t("lineage_add_version_note")}
          </p>
        </div>
      </div>
    </SidePanel>
    </>
  );
}
