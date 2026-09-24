import React from 'react';
import { SidePanel } from '../shared';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import { ChameleonControlDashboard } from '../chameleon-components/ChameleonControlDashboard';
import { ChameleonSandboxPreview } from '../chameleon-components/ChameleonSandboxPreview';

export function ChameleonEditorPanel({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { t } = useLexicon();
  const { currentTheme, activeThemeId, CORE_THEMES, customThemes, updateActiveTheme, renameTheme } = useTheme();

  const allThemes = { ...CORE_THEMES, ...customThemes };
  const currentThemeData = allThemes[activeThemeId] || currentTheme;

  const handleUpdateTheme = (updates: any) => {
    updateActiveTheme(updates);
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("ui_theme_editor")}
      subtitle={t("ui_system_theme")}
      icon="palette"
      iconColorClass="theme-text-accent"
      isResizable={true}
      defaultWidth={1400}
    >
      <div className="flex-1 flex w-full h-full overflow-hidden">
        <ChameleonControlDashboard
          currentTheme={currentThemeData}
          handleUpdateTheme={handleUpdateTheme}
          editingThemeId={activeThemeId}
          renameTheme={renameTheme}
        />
        <ChameleonSandboxPreview
          currentTheme={currentThemeData}
        />
      </div>
    </SidePanel>
  );
}
