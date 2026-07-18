import React, { useState } from 'react';
import { useLexicon } from '../LexiconContext';

interface ThemeCardProps {
  id: string;
  theme: any;
  isActive?: boolean;
  isDev?: boolean;
  isCloud?: boolean;
  onClick: () => void;
  onDelete?: (id: string) => void;
  confirmDelete?: string | false;
  setConfirmDelete?: (val: string | false) => void;
}

export function ThemeCard({ 
  id, 
  theme, 
  isActive, 
  isDev, 
  isCloud,
  onClick, 
  onDelete, 
  confirmDelete, 
  setConfirmDelete 
}: ThemeCardProps) {
  const { t } = useLexicon();
  const [localConfirmDelete, setLocalConfirmDelete] = useState<string | false>(false);

  const confirmDeleteState = confirmDelete !== undefined ? confirmDelete : localConfirmDelete;
  const setConfirmDeleteState = setConfirmDelete || setLocalConfirmDelete;

  const bgClass = isDev 
    ? "bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
    : "group-hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]";

  const label = isCloud 
    ? (t("ui_master_theme") || "Master Theme")
    : isDev 
      ? (t("ui_active_workspace") || "Active Workspace")
      : (t("ui_personal_theme") || "Personal Theme");

  return (
    <div onClick={onClick} className={`w-full text-left p-6 rounded-[var(--radius)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col gap-4 relative group cursor-pointer ${bgClass}`}>
      <div className={`absolute inset-0 rounded-[var(--radius)] bg-gradient-to-br ${isDev ? 'from-[var(--accent)]/15' : 'from-[var(--accent)]/10'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />
      
      <div className={`w-14 h-14 rounded-2xl shrink-0 overflow-hidden relative border ${isDev ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)] group-hover:border-[var(--accent)]/60' : 'border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--text)_10%,transparent)] group-hover:border-[var(--accent)]/50'} transition-colors z-10`}>
        <div className="absolute inset-0" style={{ backgroundColor: theme.bg || '#000' }} />
        <div className="absolute top-0 left-0 bottom-0 w-4" style={{ backgroundColor: theme.sidebar || '#000' }} />
        <div className="absolute top-2 right-2 w-3 h-3 rounded-full" style={{ backgroundColor: theme.accent || '#fff' }} />
      </div>
      
      <div className="flex flex-col gap-1 z-10 pr-10 text-left">
        <span className="text-sm font-black text-[var(--text)] tracking-wider truncate block">{theme.name}</span>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${isDev || isCloud ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'} opacity-${isDev || isCloud ? '80' : '60'} block`}>{label}</span>
      </div>
      
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirmDeleteState === id) { onDelete(id); setConfirmDeleteState(false); }
            else { setConfirmDeleteState(id); }
          }}
          onMouseLeave={() => setConfirmDeleteState(false)}
          className={`absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-xl z-20 ${confirmDeleteState === id ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[var(--danger)] text-[var(--danger)] shadow-[0_0_20px_color-mix(in_srgb,var(--danger)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:scale-110' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:scale-110'}`}
        >
          <span className="material-symbols-outlined !text-[14px]">{confirmDeleteState === id ? 'warning' : 'delete'}</span>
        </button>
      )}
    </div>
  );
}
