import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";
import { GameVersionMultiSelect } from "./shared";

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
  onUpdate 
}: { 
  version: any; 
  index: number; 
  totalCount: number; 
  onUpdate: () => void;
}) {
  const { t } = useLexicon();
  const [editingLabel, setEditingLabel] = useState(version.version_label || '');
  const [editingGameVersion, setEditingGameVersion] = useState(version.game_version || '');

  const handleSaveLabel = async () => {
    if (editingLabel === version.version_label) return;
    try {
      await invoke('update_mod_history_entry', { 
        historyId: version.id || version.dna_hash, 
        label: editingLabel, 
        gameVersion: version.game_version 
      });
      onUpdate(); // Refresh parent data
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

  return (
    <div className="flex items-center gap-3 bg-[var(--text)]/5 border border-[var(--text)]/10 rounded-xl p-3 hover:bg-[var(--text)]/10 transition-colors relative">
      {/* Timeline connector */}
      {index < totalCount - 1 && (
        <div className="absolute left-[18px] top-[48px] w-[2px] h-[12px] bg-[var(--accent)]/30" />
      )}
      
      {/* Version indicator */}
      <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 border-2 border-[var(--accent)] flex items-center justify-center shrink-0 z-10">
        <span className="text-[10px] font-black text-[var(--accent)]">
          {index === 0 ? '★' : totalCount - index}
        </span>
      </div>

      <div className="flex flex-col min-w-0 flex-1 gap-1">
        {/* Editable Version Label */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editingLabel}
            onChange={(e) => setEditingLabel(e.target.value)}
            onBlur={handleSaveLabel}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveLabel()}
            placeholder={`Version ${totalCount - index}`}
            className="text-[11px] font-black text-[var(--text)] uppercase bg-transparent border-none outline-none focus:border-b focus:border-[var(--accent)] px-1 py-0.5 w-full"
          />
          {index === 0 && (
            <span className="px-2 py-0.5 bg-[var(--accent)]/20 border border-[var(--accent)]/40 rounded text-[8px] font-black uppercase text-[var(--accent)] shrink-0">
              {t("lineage_latest")}
            </span>
          )}
        </div>

        {/* Editable Game Version - Using GameVersionMultiSelect */}
        <div className="relative z-[9999] pointer-events-auto">
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
                // Update Supabase directly instead of Tauri
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

        <span className="text-[8px] font-bold text-[var(--subtext)] opacity-40 mt-1 truncate">
          {t("lineage_hash_label")}: {version.dna_hash.substring(0, 16)}...
        </span>
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
      // Directly insert into Supabase - no Rust backend needed
      const dnaHash = prompt('Enter the DNA hash for this version:');
      if (!dnaHash || !dnaHash.trim()) {
        alert('DNA hash is required to create a version entry');
        return;
      }

      const { data, error } = await supabase
        .from('mod_versions')
        .insert({
          mod_id: targetMod.id,
          dna_hash: dnaHash.trim(),
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
    <div className="theme-glass-inner rounded-3xl p-6 border border-[var(--text)]/10 flex flex-col gap-4">
      <div className="flex justify-between items-start border-b border-[var(--text)]/10 pb-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--text)]">
            {t("ui_icon_dna")} {t("lineage_version_history")}
          </h3>
          <p className="text-[10px] font-bold text-[var(--subtext)] opacity-80 uppercase tracking-wider mt-1">
            {t("lineage_timeline_desc")}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="theme-bg-accent text-[var(--bg)] px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 transition-all"
        >
          {t("lineage_add_version")}
        </button>
      </div>

      {versionHistory.length === 0 ? (
        <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest opacity-30">
          {t("lineage_no_history")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {versionHistory.map((version, index) => (
            <EditableVersionRow
              key={version.dna_hash}
              version={version}
              index={index}
              totalCount={versionHistory.length}
              onUpdate={fetchVersionHistory}
            />
          ))}
        </div>
      )}
    </div>

    {/* Add Version Modal */}
    {showAddModal && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
        <div className="w-[400px] bg-[#1a1c23] rounded-3xl shadow-2xl border border-[var(--text)]/20 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-[var(--text)]/10 flex justify-between items-center bg-black/40">
            <h3 className="text-sm font-black uppercase tracking-widest text-white">{t("lineage_add_version_modal_title")}</h3>
            <button onClick={() => setShowAddModal(false)} className="text-xs font-black text-white opacity-50 hover:opacity-100">✕</button>
          </div>
          
          <div className="p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("lineage_version_label")}</label>
              <input
                autoFocus
                type="text"
                value={newVersionLabel}
                onChange={(e) => setNewVersionLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddVersion()}
                placeholder="e.g. v1.1, v2.0"
                className="w-full bg-black/40 border border-[var(--text)]/20 px-4 py-3 rounded-xl text-xs font-bold text-white outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">{t("lineage_game_version")}</label>
              <input
                type="text"
                value={newGameVersion}
                onChange={(e) => setNewGameVersion(e.target.value)}
                placeholder="e.g. 1.108.329.1020"
                className="w-full bg-black/40 border border-[var(--text)]/20 px-4 py-3 rounded-xl text-xs font-bold text-white outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mt-2">
              <p className="text-[9px] font-bold text-yellow-400 uppercase tracking-wider">
                {t("lineage_add_version_note")}
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
              >
                {t("lineage_cancel")}
              </button>
              <button
                onClick={handleAddVersion}
                disabled={!newVersionLabel.trim()}
                className="flex-1 py-3 theme-bg-accent text-[var(--bg)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("lineage_add_version_btn")}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
