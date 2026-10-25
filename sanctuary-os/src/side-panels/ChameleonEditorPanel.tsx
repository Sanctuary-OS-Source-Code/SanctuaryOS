import React from 'react';
import { SidePanel } from '../shared';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import { ChameleonControlDashboard } from '../chameleon-components/ChameleonControlDashboard';
import { ChameleonSandboxPreview } from '../chameleon-components/ChameleonSandboxPreview';

export function ChameleonEditorPanel({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { t } = useLexicon();
  const { currentTheme, activeThemeId, updateActiveTheme, renameTheme } = useTheme();

  const handleUpdateTheme = (updates: any) => {
    updateActiveTheme(updates);
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("ui_theme_editor", "Chameleon Editor")}
      subtitle={t("ui_system_theme", "Live Liquid Glass Theme Forge")}
      icon={t("icon_palette", "palette")}
      iconColorClass="theme-text-accent"
      isResizable={true}
      defaultWidth={1400}
      noPadding={true}
      noScroll={true}
    >
      <div className="flex-1 flex flex-col lg:flex-row w-full h-full overflow-hidden">
        <ChameleonControlDashboard
          currentTheme={currentTheme}
          handleUpdateTheme={handleUpdateTheme}
          editingThemeId={activeThemeId}
          renameTheme={renameTheme}
        />
        <ChameleonSandboxPreview
          currentTheme={currentTheme}
        />
      </div>
    </SidePanel>
  );
}
