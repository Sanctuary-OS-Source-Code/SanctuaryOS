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
  layout?: "horizontal" | "vertical";
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
  setConfirmDelete,
  layout = "horizontal"
}: ThemeCardProps) {
  const { t } = useLexicon();
  const [localConfirmDelete, setLocalConfirmDelete] = useState<string | false>(false);

  const confirmDeleteState = confirmDelete !== undefined ? confirmDelete : localConfirmDelete;
  const setConfirmDeleteState = setConfirmDelete || setLocalConfirmDelete;

  const label = isCloud 
    ? (t("ui_master_theme"))
    : isDev 
      ? (t("ui_active_workspace"))
      : (t("ui_personal_theme"));

  const customIcon = (
    <div className={`w-12 h-12 rounded-2xl shrink-0 overflow-hidden relative border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-md transition-colors z-10`}>
      <div className="absolute inset-0 rounded-[inherit]" style={{ backgroundColor: theme.bg || '#000' }} />
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
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all backdrop-blur-xl z-20 ${confirmDeleteState === id ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[var(--danger)] text-[var(--danger)] shadow-md hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:scale-110' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:scale-110'}`}
    >
      <span className="material-symbols-outlined !text-[14px]">{confirmDeleteState === id ? 'warning' : 'delete'}</span>
    </button>
  ) : undefined;

  return (
    <UniversalCard
      onClick={onClick}
      layout={layout}
      customIcon={customIcon}
      title={theme.name}
      subtitle={label}
      statusColor={isActive || isDev ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)]" : undefined}
      badges={isActive || isDev ? [
        <span key="active" className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest capitalize border shadow-inner shrink-0 transition-colors bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] theme-text-accent border-[color-mix(in_srgb,var(--accent)_20%,transparent)]">
          {t("status_active")}
        </span>
      ] : []}
      actions={removeAction}
    />
  );
}



