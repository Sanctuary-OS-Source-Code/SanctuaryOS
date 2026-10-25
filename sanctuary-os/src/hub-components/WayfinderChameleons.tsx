
import { useState, useEffect } from 'react';
import { SidePanel, EmptyState, ActionButton, PanelHeaderGroup, PanelHeaderButton } from '../shared';
import { ElevatedHubLayout, HubOverviewLanding, HubOverviewSection } from "../components/layouts/ElevatedHubLayout";
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';

import { ThemeCard } from '../chameleon-components/ThemeCard';
import { ChameleonControlDashboard } from '../chameleon-components/ChameleonControlDashboard';
import { ChameleonSandboxPreview } from '../chameleon-components/ChameleonSandboxPreview';
import { standardButtonClass } from '../shared';

export function WayfinderChameleons({ isKeepers = false }: { isKeepers?: boolean }) {
  const { t } = useLexicon();
  const pushStatus = useStore((state: any) => state.pushStatus);
  const { activeThemeId, setActiveThemeId, setCoreThemes } = useTheme();

  const [cloudThemes, setCloudThemes] = useState<Record<string, any>>({});
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // When editing, we work on a copy so we can discard if we close without saving
  const [activeEditingTheme, setActiveEditingTheme] = useState<any>(null);
  const [originalThemeId, setOriginalThemeId] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    setLoading(true);
    try {
      const client = isKeepers ? (await import('../supabase')).supabase : (await import('../supabase')).getActiveGameClient();
      const { data, error } = await client.from('sanctuary_themes').select('*');
      if (error) throw error;

      const themesMap: Record<string, any> = {};
      data?.forEach((row: any) => {
        themesMap[row.id] = { ...row.theme_data, id: row.id };
      });
      setCloudThemes(themesMap);
    } catch (err: any) {
      console.error(err);
      pushStatus(`Failed to fetch themes: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTheme = (updates: any) => {
    setHasChanges(true);
    setActiveEditingTheme((prev: any) => ({ ...prev, ...updates }));
    
    if (editingThemeId) {
      setCoreThemes((prevCore: any) => {
        const baseTheme = prevCore[editingThemeId] || activeEditingTheme;
        return {
          ...prevCore,
          [editingThemeId]: { ...baseTheme, ...updates }
        };
      });
    }
  };

  const saveToCloud = async () => {
    if (!editingThemeId || !activeEditingTheme) return;
    setIsSaving(true);
    try {
      const payload = {
        id: editingThemeId,
        name: activeEditingTheme.name || editingThemeId,
        theme_data: activeEditingTheme,
        updated_at: new Date().toISOString()
      };

      const { supabase } = await import('../supabase');
      const token = useStore.getState().session?.access_token;

      if (!isKeepers && token) {
        const { error } = await supabase.rpc('secure_upsert_cloud_file', {
          p_token: token,
          p_target: 'sanctuary_themes',
          p_payload: payload
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sanctuary_themes').upsert(payload);
        if (error) throw error;
      }

      pushStatus("Master Theme saved to cloud.", "success");
      setHasChanges(false);
      setCloudThemes(prev => ({ ...prev, [editingThemeId]: activeEditingTheme }));
    } catch (err: any) {
      console.error(err);
      pushStatus(`Error saving: ${err.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const openEditor = (id: string) => {
    setEditingThemeId(id);
    setActiveEditingTheme(cloudThemes[id]);
    setOriginalThemeId(activeThemeId);
    setHasChanges(false);
    if (livePreview) {
      setCoreThemes((prev: any) => ({ ...prev, [id]: cloudThemes[id] }));
      setActiveThemeId(id);
    }
  };

  const closeEditor = () => {
    setEditingThemeId(null);
    setActiveEditingTheme(null);
    setHasChanges(false);
    if (originalThemeId) {
      setActiveThemeId(originalThemeId);
    }
  };

  const renameTheme = (id: string, newName: string) => {
    setHasChanges(true);
    setActiveEditingTheme((prev: any) => ({ ...prev, name: newName }));
  };

  const createNewTheme = () => {
    const id = `theme_${Date.now()}`;
    const newTheme = {
      name: "NEW SIGNATURE", bg: "#0f172a", sidebar: "#0f172a", sidebartext: "#ffffff", accent: "#ffffff",
      text: "#ffffff", subtext: "#666666", success: "#00ff41", warning: "#ffea00", danger: "#ff003c",
      panelTint: "#ffffff", headerText: "#ffffff", fontFamily: "Inter, sans-serif", fontSizeBase: "16px", glassOpacity: "3%", glassBlur: "16px", radius: "1.5rem", bgGradient: "none"
    };
    setEditingThemeId(id);
    setActiveEditingTheme(newTheme);
    setOriginalThemeId(activeThemeId);
    setHasChanges(true);
    if (livePreview) {
      setCoreThemes((prev: any) => ({ ...prev, [id]: newTheme }));
      setActiveThemeId(id);
    }
  };

  return (
    <ElevatedHubLayout
      headerTitle={t("ui_chameleons") || "Chameleons"}
      headerSubtitle={t("ui_chameleons_subtitle") || "Manage application themes"}
      headerIcon="palette"
      headerIconColorClass="theme-text-accent"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("ui_search_chameleons") as string}
      hideSearch={activeTab === 'overview'}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={[
        { id: 'overview', label: t("landing_overview") || "Overview", icon: "dashboard", number: Object.keys(cloudThemes).length.toString() },
        { id: 'active', label: t("status_active") || "Active", icon: "check_circle", number: Object.values(cloudThemes).filter((th: any) => th.is_active !== false).length.toString() },
        { id: 'inactive', label: t("status_inactive") || "Inactive", icon: "cancel", number: Object.values(cloudThemes).filter((th: any) => th.is_active === false).length.toString() }
      ]}
      actions={
        activeTab !== 'overview' ? [
          {
            id: "create",
            icon: "add",
            label: t("auto_create") || "Create",
            onClick: createNewTheme
          },
          {
            id: "refresh",
            icon: "refresh",
            label: t("btn_refresh") || "Refresh",
            onClick: fetchThemes
          }
        ] : undefined
      }
    >
        {loading && Object.keys(cloudThemes).length === 0 ? (
          <div className="w-full h-full flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : activeTab === 'overview' ? (
          <HubOverviewLanding>
            <HubOverviewSection
              icon="check_circle"
              iconColorClass="text-[var(--success)]"
              title={t("status_active") || "Active Themes"}
              isEmpty={Object.entries(cloudThemes).filter(([, th]: any) => th.is_active !== false).length === 0}
              emptyIcon="palette"
              emptyTitle={t("no_themes") || "No Active Themes"}
            >
              {Object.entries(cloudThemes).filter(([, th]: any) => th.is_active !== false).slice(0, 4).map(([id, theme]: any) => (
                <ThemeCard key={id} id={id} theme={theme} isCloud={true} onClick={() => openEditor(id)} />
              ))}
            </HubOverviewSection>
            <HubOverviewSection
              icon="cancel"
              iconColorClass="text-[var(--warning)]"
              title={t("status_inactive") || "Inactive Themes"}
              isEmpty={Object.entries(cloudThemes).filter(([, th]: any) => th.is_active === false).length === 0}
              emptyIcon="palette"
              emptyTitle={t("no_themes") || "No Inactive Themes"}
            >
              {Object.entries(cloudThemes).filter(([, th]: any) => th.is_active === false).slice(0, 4).map(([id, theme]: any) => (
                <ThemeCard key={id} id={id} theme={theme} isCloud={true} onClick={() => openEditor(id)} />
              ))}
            </HubOverviewSection>
          </HubOverviewLanding>
        ) : Object.keys(cloudThemes).length === 0 ? (
          <EmptyState icon="palette" title={t("no_themes") || "No Cloud Themes"} className="py-20" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 w-full">
            {Object.entries(cloudThemes).filter(([id, theme]: any) => {
              if (searchQuery && !theme.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
              if (activeTab === 'active' && theme.is_active === false) return false;
              if (activeTab === 'inactive' && theme.is_active !== false) return false;
              return true;
            }).map(([id, theme]: any) => (
              <ThemeCard
                key={id}
                id={id}
                theme={theme}
                isCloud={true}
                onClick={() => openEditor(id)}
              />
            ))}
          </div>
        )}

      <SidePanel
        isOpen={!!editingThemeId}
        onClose={closeEditor}
        title={t("ui_theme_editor")}
        subtitle={t("wf_master_theme_edit")}
        icon="cloud"
        iconColorClass="theme-text-accent"
        isResizable={true}
        defaultWidth={1400}
        noPadding={true}
        noScroll={true}
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={livePreview ? 'visibility' : 'visibility_off'}
              tooltip={livePreview ? (t("ui_os_preview_on")) : (t("ui_os_preview_off"))}
              variant={livePreview ? "success" : "default"}
              onClick={() => {
                if (livePreview) {
                  if (originalThemeId) setActiveThemeId(originalThemeId);
                } else {
                  if (editingThemeId) {
                    if (activeEditingTheme) {
                      setCoreThemes((prev: any) => ({ ...prev, [editingThemeId]: activeEditingTheme }));
                    }
                    setActiveThemeId(editingThemeId);
                  }
                }
                setLivePreview(!livePreview);
              }}
            />
            <PanelHeaderButton
              icon="refresh"
              tooltip={t("btn_reset")}
              onClick={() => {
                if (originalThemeId) setActiveThemeId(originalThemeId);
                pushStatus(t("ui_theme_reset"), "success");
              }}
            />
            <PanelHeaderButton
              icon="check_circle"
              tooltip={t("ui_btn_apply")}
              variant="success"
              onClick={() => {
                if (editingThemeId) {
                  setActiveThemeId(editingThemeId);
                  setOriginalThemeId(editingThemeId);
                  setEditingThemeId(null);
                  pushStatus(t("ui_theme_applied"), "success");
                }
              }}
            />
            <PanelHeaderButton
              icon="cloud_upload"
              tooltip={t("btn_publish")}
              onClick={saveToCloud}
              disabled={isSaving || !hasChanges}
              variant="accent"
            />
          </PanelHeaderGroup>
        }
      >
        {activeEditingTheme && (
          <div className="flex-1 flex w-full h-full overflow-hidden">
            <ChameleonControlDashboard
              currentTheme={activeEditingTheme}
              handleUpdateTheme={handleUpdateTheme}
              editingThemeId={editingThemeId}
              renameTheme={renameTheme}
            />
            <ChameleonSandboxPreview
              currentTheme={activeEditingTheme}
            />
          </div>
        )}
      </SidePanel>
    </ElevatedHubLayout>
  );
}



