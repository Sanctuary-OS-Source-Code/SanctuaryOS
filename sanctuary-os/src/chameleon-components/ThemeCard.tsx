import React from 'react';
import { useLexicon } from '../LexiconContext';
import { getLuminance } from './ChameleonShared';
import { UniversalCard } from '../components/universal/UniversalCard';

export function DynamicThemePreviewBanner({
  data,
  heightClass = 'h-32',
  children,
}: {
  data: any;
  heightClass?: string;
  children?: React.ReactNode;
}) {
  const bgHex = data?.bg && data.bg !== 'transparent' ? data.bg : '#060b14';
  const sidebarHex = data?.sidebar && data.sidebar !== 'transparent' ? data.sidebar : bgHex;
  const accentHex = data?.accent || '#38bdf8';
  const textHex = data?.text || '#f8fafc';
  const subtextHex = data?.subtext || '#94a3b8';
  const successHex = data?.success || '#10b981';
  const isLight = getLuminance(bgHex) >= 0.5;
  const radiusVal = data?.radius || '1.25rem';

  const hasCustomPreview = Boolean(data?.previewImage && String(data.previewImage).trim() !== '');
  const bgImageUrl = hasCustomPreview
    ? data.previewImage
    : data?.bgImage && String(data.bgImage).trim() !== ''
      ? data.bgImage
      : null;
  const bgGradient =
    !bgImageUrl && data?.bgGradient && data.bgGradient !== 'none' && data.bgGradient !== 'transparent'
      ? data.bgGradient
      : undefined;

  const glassFill = isLight ? 'rgba(255, 255, 255, 0.52)' : 'rgba(15, 23, 42, 0.46)';
  const glassBorder = isLight ? 'rgba(255, 255, 255, 0.68)' : 'rgba(255, 255, 255, 0.20)';

  return (
    <div
      className={`w-full ${heightClass} relative overflow-hidden select-none transition-transform duration-500 group-hover/card:scale-[1.02]`}
      style={{
        backgroundColor: bgHex,
        backgroundImage: bgGradient,
        fontFamily: data?.fontFamily || 'Inter, sans-serif',
      }}
    >
      {bgImageUrl && (
        <img
          src={bgImageUrl}
          alt={data?.name || 'Theme Preview'}
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="lazy"
        />
      )}

      {/* Subtle ambient vignette so overlaid badges & mini-OS chrome pop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isLight
            ? 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(15,23,42,0.14) 100%)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.48) 100%)',
        }}
      />

      {/* Procedural Mini Sanctuary OS Window Preview (Always rendered unless a custom screenshot is uploaded) */}
      {!hasCustomPreview && (
        <div className="absolute inset-x-3 top-9 bottom-2.5 flex gap-2 pointer-events-none z-10">
          {/* Mini Floating Sidebar */}
          <div
            className="w-11 h-full flex flex-col justify-between p-1.5 backdrop-blur-md"
            style={{
              backgroundColor: isLight ? 'rgba(255,255,255,0.58)' : `${sidebarHex}cc`,
              borderRadius: `calc(${radiusVal} * 0.55)`,
              border: `1px solid ${glassBorder}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 14px rgba(0,0,0,0.22)',
            }}
          >
            <div className="flex flex-col gap-1">
              <div className="w-5 h-1.5 rounded-full opacity-90" style={{ backgroundColor: textHex }} />
              <div
                className="w-full h-3 rounded-md flex items-center px-1 gap-1 mt-0.5"
                style={{
                  backgroundColor: `${accentHex}28`,
                  border: `1px solid ${accentHex}66`,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accentHex }} />
                <div className="w-4 h-1 rounded-full opacity-90" style={{ backgroundColor: textHex }} />
              </div>
              <div className="w-6 h-1 rounded-full opacity-40 ml-0.5 mt-0.5" style={{ backgroundColor: subtextHex }} />
              <div className="w-5 h-1 rounded-full opacity-30 ml-0.5" style={{ backgroundColor: subtextHex }} />
            </div>
            <div
              className="w-full h-2.5 rounded-md opacity-85"
              style={{
                backgroundColor: `${successHex}26`,
                border: `1px solid ${successHex}66`,
              }}
            />
          </div>

          {/* Mini Main Workspace Area */}
          <div className="flex-1 h-full flex flex-col gap-1.5 min-w-0">
            {/* Mini Top Stat Tiles Row */}
            <div className="grid grid-cols-2 gap-1.5">
              <div
                className="px-2 py-1.5 flex items-center gap-1.5 backdrop-blur-md"
                style={{
                  backgroundColor: glassFill,
                  borderRadius: `calc(${radiusVal} * 0.45)`,
                  border: `1px solid ${glassBorder}`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.30)',
                }}
              >
                <div className="w-2.5 h-2.5 rounded-md shrink-0" style={{ backgroundColor: accentHex }} />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="w-6 h-1 rounded-full opacity-55" style={{ backgroundColor: subtextHex }} />
                  <div className="w-4 h-1.5 rounded-full" style={{ backgroundColor: textHex }} />
                </div>
              </div>
              <div
                className="px-2 py-1.5 flex items-center gap-1.5 backdrop-blur-md"
                style={{
                  backgroundColor: glassFill,
                  borderRadius: `calc(${radiusVal} * 0.45)`,
                  border: `1px solid ${glassBorder}`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.30)',
                }}
              >
                <div className="w-2.5 h-2.5 rounded-md shrink-0" style={{ backgroundColor: successHex }} />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="w-6 h-1 rounded-full opacity-55" style={{ backgroundColor: subtextHex }} />
                  <div className="w-5 h-1.5 rounded-full" style={{ backgroundColor: textHex }} />
                </div>
              </div>
            </div>

            {/* Mini Liquid Glass Content Card */}
            <div
              className="flex-1 px-2.5 py-1.5 flex items-center justify-between gap-2 backdrop-blur-md"
              style={{
                backgroundColor: glassFill,
                borderRadius: `calc(${radiusVal} * 0.55)`,
                border: `1px solid ${glassBorder}`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), 0 8px 18px rgba(0,0,0,0.18)',
              }}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="w-14 h-1.5 rounded-full" style={{ backgroundColor: textHex }} />
                <div className="w-10 h-1 rounded-full opacity-65" style={{ backgroundColor: subtextHex }} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {[bgHex, accentHex, textHex, successHex].map((swatch, idx) => (
                  <span
                    key={idx}
                    className="w-3 h-3 rounded-full border border-white/30 shadow-sm"
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

export function ThemeCard({ id, data, isDev = false, isFav = false, activeThemeId, setActiveThemeId, CORE_THEMES, handleOpenThemeEditor, handleUpdateTheme, toggleFavoriteTheme, handleExportTheme, setNewThemeName, setEditingThemeId, editingThemeId, newThemeName, renameTheme, confirmDelete, setConfirmDelete, deleteTheme }: any) {
  const { t } = useLexicon();
  if (!data) return null;
  const isActive = activeThemeId === id;

  const getThemeBadge = (themeId: string, themeData: any) => {
    if (themeData.badgeKey) return t(themeData.badgeKey, "Community");
    if (themeData.badge) return themeData.badge;
    if (CORE_THEMES && CORE_THEMES[themeId]) return t("badge_sanctuary", "Sanctuary");
    return isDev ? t("badge_sandbox", "Sandbox") : t("badge_custom", "Custom");
  };

  const getThemeMode = (themeData: any) => {
    return getLuminance(themeData.bg) < 0.5 ? t("mode_dark", "Dark") : t("mode_light", "Light");
  };

  const titleNode = editingThemeId === id ? (
    <input
      autoFocus
      value={newThemeName}
      onChange={e => setNewThemeName(e.target.value)}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          if (newThemeName.trim() !== "" && newThemeName !== data.name) renameTheme(id, newThemeName.trim());
          setEditingThemeId(null);
        } else if (e.key === 'Escape') {
          setEditingThemeId(null);
        }
      }}
      onBlur={() => {
        if (newThemeName.trim() !== "" && newThemeName !== data.name) renameTheme(id, newThemeName.trim());
        setEditingThemeId(null);
      }}
      className="w-full bg-[color-mix(in_srgb,var(--text)_5%,var(--bg))] border border-[color-mix(in_srgb,var(--text)_20%,transparent)] rounded-lg px-2 py-1 text-xs font-black tracking-wide outline-none shadow-inner transition-all text-[var(--text)] focus:border-[var(--accent)]"
    />
  ) : (
    data.name
  );

  return (
    <UniversalCard
      layout="vertical"
      title={titleNode}
      subtitle={`${getThemeBadge(id, data)} • ${getThemeMode(data)}`}
      isActive={isActive}
      onClick={() => setActiveThemeId(id)}
      imageOverlay={
        <div className="absolute inset-0 z-20">
          <DynamicThemePreviewBanner data={data} heightClass="h-full">
            <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between gap-2 z-20">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isActive && (
                <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--accent)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                  <span className="material-symbols-outlined !text-[11px]">{t("icon_check_circle", "check_circle")}</span>
                  {t("active", "Active")}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                  {data.previewImage ? t("icon_image", "image") : t("icon_auto_awesome", "auto_awesome")}
                </span>
                {data.previewImage
                  ? t("theme_preview_custom_badge", "Custom Cover")
                  : t("theme_preview_live_badge", "Dynamic Preview")}
              </span>
            </div>

            <div className="flex items-center gap-1 opacity-90 group-hover/card:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              {!isDev && toggleFavoriteTheme && (
                <button
                  onClick={e => { e.stopPropagation(); toggleFavoriteTheme(id, e); }}
                  className={`relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] cursor-pointer shadow-sm ${isFav ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)]'}`}
                >
                  <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}>{t("icon_star", "star")}</span>
                </button>
              )}
              {handleExportTheme && (
                <button
                  onClick={e => { e.stopPropagation(); handleExportTheme(e, data, isDev); }}
                  className="relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] hover:text-[var(--text)] text-[var(--subtext)] cursor-pointer shadow-sm"
                >
                  <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_save", "save")}</span>
                </button>
              )}
              {handleOpenThemeEditor && (
                <button
                  onClick={e => { e.stopPropagation(); handleOpenThemeEditor(e, id, data); }}
                  className="relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] theme-text-accent cursor-pointer shadow-sm"
                >
                  <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_tune", "tune")}</span>
                </button>
              )}
              {(!CORE_THEMES || !CORE_THEMES[id]) && (
                <>
                  {setNewThemeName && setEditingThemeId && (
                    <button
                      onClick={e => { e.stopPropagation(); setNewThemeName(data.name); setEditingThemeId(id); }}
                      className="relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)] hover:text-[var(--text)] text-[var(--subtext)] cursor-pointer shadow-sm"
                    >
                      <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{t("icon_edit", "edit")}</span>
                    </button>
                  )}
                  {deleteTheme && setConfirmDelete && (
                    <button
                      onClick={e => { e.stopPropagation(); if (confirmDelete === id) { deleteTheme(id); setConfirmDelete(false); } else setConfirmDelete(id); }}
                      onMouseLeave={() => setConfirmDelete(false)}
                      className={`relative w-7 h-7 rounded-lg transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_15%,transparent)] cursor-pointer shadow-sm ${confirmDelete === id ? 'border-[var(--danger)] text-[var(--danger)] scale-105' : 'hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] theme-text-danger'}`}
                    >
                      <span className="material-symbols-outlined !text-[14px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{confirmDelete === id ? t("icon_warning", "warning") : t("icon_delete", "delete")}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          </DynamicThemePreviewBanner>
        </div>
      }
    />
  );
}
