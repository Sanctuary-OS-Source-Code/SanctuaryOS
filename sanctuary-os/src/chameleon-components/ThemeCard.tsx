import React, { useState } from 'react';
import { useLexicon } from '../LexiconContext';
import { UniversalCard } from '../components/universal/UniversalCard';

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

  const label = isCloud 
    ? (t("ui_master_theme") || "Master Theme")
    : isDev 
      ? (t("ui_active_workspace") || "Active Workspace")
      : (t("ui_personal_theme") || "Personal Theme");

  const customIcon = (
    <div className={`w-12 h-12 rounded-[var(--radius)] shrink-0 overflow-hidden relative border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-md transition-colors z-10 mx-auto`}>
      <div className="absolute inset-0" style={{ backgroundColor: theme.bg || '#000' }} />
      <div className="absolute top-0 left-0 bottom-0 w-3" style={{ backgroundColor: theme.sidebar || '#000' }} />
      <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.accent || '#fff' }} />
    </div>
  );

  const removeAction = onDelete ? (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (confirmDeleteState === id) { onDelete(id); setConfirmDeleteState(false); }
        else { setConfirmDeleteState(id); }
      }}
      onMouseLeave={() => setConfirmDeleteState(false)}
      className={`w-8 h-8 rounded-[var(--radius)] flex items-center justify-center transition-all backdrop-blur-xl z-20 ${confirmDeleteState === id ? 'bg-red-500/[15%] border border-[var(--danger)] text-[var(--danger)] shadow-md hover:bg-red-500/[25%] hover:scale-110' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-red-500/[10%] hover:border-red-500/[30%] hover:scale-110'}`}
    >
      <span className="material-symbols-outlined !text-[14px]">{confirmDeleteState === id ? 'warning' : 'delete'}</span>
    </button>
  ) : undefined;

  return (
    <UniversalCard
      layout="horizontal"
      isActive={isActive || isDev}
      onClick={onClick}
      title={theme.name}
      subtitle={label}
      customIcon={customIcon}
      actions={removeAction}
      statusColor={isDev || isCloud ? 'var(--accent)' : undefined}
    />
  );
}
