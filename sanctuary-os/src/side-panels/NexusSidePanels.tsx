import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { CustomDropdown, standardAccentGlassButtonClass, FilterTabs, FilterTabButton, SidePanel, SidePanelActionFooter, PanelHeaderGroup, PanelHeaderButton, ViewHeader, SearchBar, HoverTooltip, FilterPopover, getNormalizedArtifactName } from "../shared";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../store";
import { UniversalCard } from "../components/universal/UniversalCard";

export function MarketUploadPanel({
  uploadState,
  setUploadState,
  marketTab,
  availableLanguages,
  submitUpload,
  backdropZ = "z-[15000]",
  panelZ = "z-[15001]"
}: any) {
  const { t } = useLexicon();
  if (!uploadState.isOpen) return null;
  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={() => setUploadState((s: any) => ({ ...s, isOpen: false }))}
        widthClass="w-[550px] max-w-[100vw]"
        backdropZ={backdropZ}
        panelZ={panelZ}
        icon="cloud_upload"
        title={marketTab === 'LEXICONS' ? (t("upload_lexicon_title") || "Upload Lexicon") : marketTab === 'TEMPLATES' ? (t("upload_template_title") || "Upload Template") : (t("upload_chameleon_title") || "Upload Chameleon")}
        subtitle={t("auto_upload_new_asset") || "Upload your custom creation"}
        headerActions={
          <>
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={uploadState.isEdit ? "save" : "cloud_upload"}
                tooltip={uploadState.isEdit ? (t("upload_btn_update") || "Update") : (t("upload_submit") || "Submit")}
                onClick={submitUpload}
                disabled={!uploadState.name || (uploadState.language === 'add_new' && !uploadState.newLanguage)}
                variant="accent"
              />
            </PanelHeaderGroup>
          </>
        }
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative z-10">
          <div className="flex flex-col gap-8 pb-8 shrink-0 relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            <div className="absolute top-0 right-0 opacity-[0.03] pointer-events-none" style={{ transform: 'translate(20%, -20%)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '300px' }}>cloud_upload</span>
            </div>
            <div className="flex items-start justify-between gap-6 relative z-10 w-full">
              <div className="flex flex-col gap-2 flex-1 min-w-0 max-w-full">
                <h1 className="text-4xl font-black capitalize tracking-tight text-[var(--text)] drop-shadow-md break-words break-all" style={{ overflowWrap: 'anywhere' }}>
                  {uploadState.name || t("new_upload") || "New Upload"}
                </h1>
                <div className="flex items-center gap-3 flex-wrap mt-2">
                  <span className="px-4 py-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-xs font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2 shadow-sm backdrop-blur-sm truncate max-w-full">
                    <span className="material-symbols-outlined !text-[16px] shrink-0">draft</span>
                    <span className="truncate">{marketTab}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 relative z-10 w-full flex-wrap">
              <div className="flex-1 min-w-[160px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-50">{t("label_version") || "Version"}</span>
                <span className="text-lg font-black flex items-center gap-2"><span className="material-symbols-outlined !text-[20px] theme-text-accent">new_releases</span> {uploadState.version || "1.0.0"}</span>
              </div>
              <div className="flex-1 min-w-[160px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-50">{t("upload_type") || "Upload Type"}</span>
                <span className="text-lg font-black flex items-center gap-2 capitalize"><span className="material-symbols-outlined !text-[20px] theme-text-accent">{uploadState.isEdit ? 'edit' : 'add_circle'}</span> {uploadState.isEdit ? 'Update' : 'New Release'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
              <label className="text-xs font-bold text-[var(--subtext)] capitalize tracking-widest">{t("upload_file")}</label>
              <div className="flex items-center gap-4">
                <div className={`flex-1 glass-surface rounded-xl px-4 py-3 text-sm font-bold truncate transition-all ${uploadState.fileName ? 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-100' : 'text-[var(--subtext)] opacity-60 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] border-dashed'}`}>
                  {uploadState.fileName || "No file selected"}
                </div>
                {!(uploadState.id && ['TEMPLATES', 'templates', 'CHAMELEONS', 'chameleons'].includes(marketTab)) && marketTab !== 'LEXICONS' && marketTab !== 'lexicons' && marketTab !== 'CHAMELEONS' && marketTab !== 'TEMPLATES' && (
                  <button onClick={async () => {
                    try {
                      const filters = [{ name: 'JSON', extensions: ['json'] }];
                      const vaultPath = useStore.getState().vaultPath;
                      const defaultPath = vaultPath ? `${vaultPath}/Data` : undefined;
                      const selected = await open({ filters, defaultPath });
                      if (!selected) return;
                      const content = await readTextFile(selected as string);
                      let parsed;
                      try { parsed = JSON.parse(content); } catch { parsed = content; }
                      let newVersion = '1.0.0';
                      if (parsed.version) newVersion = parsed.version;
                      else if (parsed._meta_version) newVersion = parsed._meta_version;
                      setUploadState((s: any) => ({ ...s, fileContent: parsed, fileName: selected as string, name: s.name || parsed.name || 'Unknown', version: newVersion }));
                    } catch (err: any) {
                      useStore.getState().pushStatus(`${t("alert_import_failed")} ${err.message || err}`);
                    }
                  }} className={`px-6 py-3 font-black text-[10px] capitalize tracking-widest rounded-xl hover:scale-105 transition-all shadow-lg whitespace-nowrap ${standardAccentGlassButtonClass}`}>
                    {uploadState.fileName ? (t("ui_btn_replace")) : (t("btn_import"))}
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-xs font-bold text-[var(--subtext)] capitalize tracking-widest">
                  {marketTab === 'LEXICONS'
                    ? (t("upload_lexicon_name"))
                    : marketTab === 'TEMPLATES'
                      ? (t("upload_template_name"))
                      : (t("upload_chameleon_name"))}
                </label>
                <input
                  type="text"
                  value={uploadState.name}
                  onChange={e => setUploadState((s: any) => ({ ...s, name: e.target.value }))}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)]"
                />
              </div>
              <div className="flex flex-col gap-2 w-32 shrink-0">
                <label className="text-xs font-bold text-[var(--subtext)] capitalize tracking-widest">{t("label_version")}</label>
                <input
                  type="text"
                  value={uploadState.version}
                  onChange={e => setUploadState((s: any) => ({ ...s, version: e.target.value }))}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)] text-center"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[var(--subtext)] capitalize tracking-widest">{t("upload_desc")}</label>
              <textarea
                value={uploadState.description}
                onChange={e => setUploadState((s: any) => ({ ...s, description: e.target.value }))}
                className="w-full glass-surface rounded-xl px-4 py-3 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[100px] text-[var(--text)]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[var(--subtext)] capitalize tracking-widest">{t("whats_new")}</label>
              <textarea
                value={uploadState.releaseNotes || ""}
                onChange={e => setUploadState((s: any) => ({ ...s, releaseNotes: e.target.value }))}
                placeholder={t("update_panel_no_notes")}
                className="w-full glass-surface rounded-xl px-4 py-3 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[80px] text-[var(--text)]"
              />
            </div>

            {marketTab === 'LEXICONS' && (
              <>
                <div className="flex flex-col gap-2 relative z-[60]">
                  <label className="text-xs font-bold text-[var(--subtext)] capitalize tracking-widest">{t("tab_lexicons")}</label>
                  <CustomDropdown disableTint={true}
                    value={uploadState.language}
                    onChange={(val: string[]) => setUploadState((s: any) => ({ ...s, language: val[0] }))}
                    options={[
                      ...(uploadState.language && uploadState.language !== 'add_new' && !availableLanguages.includes(uploadState.language) ? [{ id: uploadState.language, label: uploadState.language.toUpperCase() }] : []),
                      ...availableLanguages.map((l: any) => ({ id: l, label: l })),
                      { id: "add_new", label: t("upload_add_language") }
                    ]}
                  />
                </div>
                {uploadState.language === 'add_new' && (
                  <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-[var(--subtext)] capitalize tracking-widest">{t("upload_new_language")}</label>
                    <input
                      type="text"
                      value={uploadState.newLanguage}
                      onChange={e => setUploadState((s: any) => ({ ...s, newLanguage: e.target.value }))}
                      className="w-full glass-surface rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all border-l-4 border-l-[var(--accent)] text-[var(--text)]"
                      placeholder={t("ph_language")}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2 relative z-[50]">
                  <label className="text-xs font-bold text-[var(--subtext)] capitalize tracking-widest">{t("filter_type")}</label>
                  <CustomDropdown disableTint={true}
                    value={uploadState.lexiconType}
                    onChange={(val: string[]) => setUploadState((s: any) => ({ ...s, lexiconType: val[0] }))}
                    options={[
                      { id: "Theme", label: t("type_theme") },
                      { id: "Default", label: t("type_default") }
                    ]}
                  />
                </div>
              </>
            )}

            {marketTab === 'CHAMELEONS' && (
              <div className="flex flex-col gap-2 relative z-[60]">
                <label className="text-xs font-bold text-[var(--subtext)] capitalize tracking-widest">{t("filter_mode")}</label>
                <CustomDropdown disableTint={true}
                  value={uploadState.themeMode}
                  onChange={(val: string[]) => setUploadState((s: any) => ({ ...s, themeMode: val[0] }))}
                  options={[
                    { id: "Dark", label: t("mode_dark") },
                    { id: "Light", label: t("mode_light") }
                  ]}
                />
              </div>
            )}

          </div>
        </div>
      </SidePanel>
    </>
  );
}

export function MarketReportPanel({
  reportState,
  setReportState,
  handleReportSubmit
}: any) {
  const { t } = useLexicon();
  if (!reportState.isOpen) return null;
  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={() => setReportState({ isOpen: false, assetId: null, assetType: null, reason: '' })}
        widthClass="w-[500px] max-w-[100vw]"
        backdropZ="z-[65000]"
        panelZ="z-[65001]"
        icon="flag"
        title={t("report_title") || "Report Content"}
        subtitle={t("report_desc") || "Please describe the issue"}
        headerActions={
          <>
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon="flag"
                tooltip={t("report_submit") || "Submit Report"}
                onClick={() => handleReportSubmit({ preventDefault: () => { } } as any)}
                variant="danger"
              />
            </PanelHeaderGroup>
          </>
        }
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative z-10 pt-6">
          <div className="flex flex-col gap-8 pb-8 px-6 shrink-0 relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            <div className="absolute top-0 right-0 opacity-[0.03] pointer-events-none" style={{ transform: 'translate(20%, -20%)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '300px' }}>flag</span>
            </div>
            <div className="flex items-start justify-between gap-6 relative z-10 w-full">
              <div className="flex flex-col gap-2 flex-1 min-w-0 max-w-full">
                <h1 className="text-4xl font-black capitalize tracking-tight text-[var(--text)] drop-shadow-md break-words break-all" style={{ overflowWrap: 'anywhere' }}>
                  {t("report_content") || "Report Content"}
                </h1>
                <div className="flex items-center gap-3 flex-wrap mt-2">
                  <span className="px-4 py-2 rounded-xl bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-xs font-black theme-text-danger uppercase tracking-widest flex items-center gap-2 shadow-sm backdrop-blur-sm truncate max-w-full">
                    <span className="material-symbols-outlined !text-[16px] shrink-0">warning</span>
                    <span className="truncate">{t("action_required") || "Action Required"}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 relative z-10 w-full flex-wrap">
              <div className="flex-1 min-w-[160px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-50">{t("target_asset") || "Target Asset"}</span>
                <span className="text-lg font-black flex items-center gap-2 max-w-full min-w-0"><span className="material-symbols-outlined !text-[20px] theme-text-accent shrink-0">target</span> <span className="truncate">{reportState.assetId || "Unknown"}</span></span>
              </div>
              <div className="flex-1 min-w-[160px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-50">{t("asset_type") || "Asset Type"}</span>
                <span className="text-lg font-black flex items-center gap-2 capitalize"><span className="material-symbols-outlined !text-[20px] theme-text-accent">category</span> {reportState.assetType || "Unknown"}</span>
              </div>
            </div>
          </div>
          <div className="p-6 flex flex-col gap-6 flex-1">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 capitalize tracking-widest ml-2">{t("reason")}</label>
              <textarea
                required
                value={reportState.reason}
                placeholder={t("report_placeholder")}
                title={t("report_placeholder")}
                onChange={(e) => setReportState({ ...reportState, reason: e.target.value })}
                className="h-48 glass-surface rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold resize-none focus:outline-none focus:theme-border-accent"
              />
            </div>
          </div>
        </div>
      </SidePanel>
    </>
  );
}

export function MarketBlueprintPanel({
  selectedBlueprint,
  setSelectedBlueprint,
  onOpenDossier,
  cleanModName,
  syncBlueprintByCode,
  onDownloadSuccess
}: any) {
  const { t } = useLexicon();

  const [enrichedBlueprint, setEnrichedBlueprint] = useState(selectedBlueprint);
  const [visibleCount, setVisibleCount] = useState(100);
  const [filterTab, setFilterTab] = useState<'ALL' | 'MISSING'>('ALL');
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const modList = useStore((state) => state.modList);
  const playSets = useStore((state) => state.playSets) || [];

  const localVaultHashes = useMemo(() => {
    const hashes = new Set<string>();
    modList.forEach((m: any) => { if (m.hash) hashes.add(m.hash); });
    return hashes;
  }, [modList]);

  const displayArtifacts = useMemo(() => {
    const artifacts = enrichedBlueprint?.json_data?.artifacts || [];
    let filtered = artifacts;
    
    const seenNames = new Set<string>();
    filtered = filtered.filter((a: any) => {
        const norm = getNormalizedArtifactName(a.name || a.id);
        if (seenNames.has(norm)) return false;
        seenNames.add(norm);
        return true;
    });

    if (filterTab === 'MISSING') {
      filtered = filtered.filter((m: any) => !localVaultHashes.has(m.hash));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((m: any) => (m.name || '').toLowerCase().includes(q) || (m.author || '').toLowerCase().includes(q));
    }
    return filtered;
  }, [enrichedBlueprint, filterTab, localVaultHashes, searchQuery]);

  const visibleArtifacts = useMemo(() => displayArtifacts.slice(0, visibleCount), [displayArtifacts, visibleCount]);
  const premiumMods = useMemo(() => visibleArtifacts.filter((m: any) => m.is_paid || m.is_early_access), [visibleArtifacts]);
  const standardMods = useMemo(() => visibleArtifacts.filter((m: any) => !m.is_paid && !m.is_early_access), [visibleArtifacts]);

  useEffect(() => {
    if (!selectedBlueprint) {
      setEnrichedBlueprint(null);
      return;
    }

    const processBlueprint = (bp: any) => {
      let parsedJson = bp.json_data;
      if (typeof parsedJson === 'string') {
        try { parsedJson = JSON.parse(parsedJson); } catch (e) { parsedJson = {}; }
      }
      parsedJson = parsedJson || {};

      parsedJson.artifacts = parsedJson.artifacts || bp.artifacts || [];

      setEnrichedBlueprint({
        ...selectedBlueprint,
        ...bp,
        master_author: selectedBlueprint.master_author || bp.master_author,
        author: selectedBlueprint.author || bp.author,
        json_data: parsedJson
      });
      setVisibleCount(100);

      const fetchPremiumStatus = async () => {
        const artifacts = parsedJson.artifacts || [];
        const hashes = artifacts.map((a: any) => a.hash).filter(Boolean);
        if (hashes.length === 0) {
          let finalArtifacts = artifacts;
          finalArtifacts = [...finalArtifacts].sort((a: any, b: any) => {
            const aPremium = a.is_paid || a.is_early_access ? 1 : 0;
            const bPremium = b.is_paid || b.is_early_access ? 1 : 0;
            if (aPremium !== bPremium) return bPremium - aPremium;
            return (a.name || '').localeCompare(b.name || '');
          });
          setEnrichedBlueprint((prev: any) => prev ? {
            ...prev,
            is_paid: bp.is_paid || finalArtifacts.some((a: any) => a.is_paid),
            is_early_access: bp.is_early_access || finalArtifacts.some((a: any) => a.is_early_access),
            json_data: { ...parsedJson, artifacts: finalArtifacts }
          } : null);
          return;
        }

        let premiumMap: Record<string, any> = {};
        const chunkSize = 40;
        const promises = [];

        for (let i = 0; i < hashes.length; i += chunkSize) {
          const chunk = hashes.slice(i, i + chunkSize);
          promises.push(
            supabase.from('mod_versions')
              .select('dna_hash, mods(is_paid, is_early_access)')
              .in('dna_hash', chunk)
          );
        }

        const results = await Promise.all(promises);
        results.forEach(({ data, error }) => {
          if (!error && data) {
            data.forEach((d: any) => {
              if (d.mods && (d.mods.is_paid || d.mods.is_early_access)) {
                premiumMap[d.dna_hash] = {
                  hash: d.dna_hash,
                  is_paid: d.mods.is_paid,
                  is_early_access: d.mods.is_early_access
                };
              }
            });
          }
        });

        let finalArtifacts = artifacts;
        let hasChanges = false;

        if (Object.keys(premiumMap).length > 0) {
          finalArtifacts = artifacts.map((a: any) => {
            if (a.hash && premiumMap[a.hash]) {
              const p = premiumMap[a.hash];
              if (!a.is_paid && p.is_paid) { a.is_paid = true; hasChanges = true; }
              if (!a.is_early_access && p.is_early_access) { a.is_early_access = true; hasChanges = true; }
            }
            return a;
          });
        }

        finalArtifacts = [...finalArtifacts].sort((a: any, b: any) => {
          const aPremium = a.is_paid || a.is_early_access ? 1 : 0;
          const bPremium = b.is_paid || b.is_early_access ? 1 : 0;
          if (aPremium !== bPremium) return bPremium - aPremium;
          return (a.name || '').localeCompare(b.name || '');
        });

        setEnrichedBlueprint((prev: any) => prev ? {
          ...prev,
          is_paid: bp.is_paid || finalArtifacts.some((a: any) => a.is_paid),
          is_early_access: bp.is_early_access || finalArtifacts.some((a: any) => a.is_early_access),
          json_data: { ...parsedJson, artifacts: finalArtifacts }
        } : null);
      };

      fetchPremiumStatus();
    };

    if (selectedBlueprint.json_data === undefined) {
      supabase.from('blueprints').select('*').eq('id', selectedBlueprint.id).single().then(({ data }) => {
        if (data) {
          processBlueprint(data);
        } else {
          processBlueprint(selectedBlueprint);
        }
      });
    } else {
      processBlueprint(selectedBlueprint);
    }
  }, [selectedBlueprint]);

  if (!enrichedBlueprint) return null;

  return (
    <>
      <SidePanel
        isOpen={true}
        onClose={() => setSelectedBlueprint(null)}
        widthClass="w-full max-w-4xl"
        backdropZ="z-[15000]"
        panelZ="z-[15001]"
        noPadding={true}
        noScroll={true}
        icon="map"
        title={t("blueprint_inspector")}
        subtitle={t("blueprint_desc")}
        headerActions={
          <>
            <PanelHeaderGroup>
              <PanelHeaderButton
                icon={isSyncing ? "sync" : "download"}
                tooltip={playSets.some((p: any) => p.code && selectedBlueprint?.json_data?.code && p.code === selectedBlueprint.json_data.code) ? (t("btn_install_copy") || "Install Copy") : (t("update_panel_install") || "Install")}
                onClick={async () => {
                  if (playSets.some((p: any) => p.code && selectedBlueprint?.json_data?.code && p.code === selectedBlueprint.json_data.code)) {
                    setIsSyncing(true);
                    await syncBlueprintByCode(selectedBlueprint.json_data.code);
                    setIsSyncing(false);
                  } else {
                    onDownloadSuccess?.();
                  }
                  setSelectedBlueprint(null);
                }}
                disabled={isSyncing}
                variant="accent"
              />
            </PanelHeaderGroup>
          </>
        }
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative z-10 px-10 py-6">
          <div className="flex flex-col gap-3 pb-8">
            <div className="glass-panel p-8 rounded-[2rem] flex flex-col justify-start gap-6 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] relative overflow-hidden mb-4 shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_10%,transparent)] to-transparent opacity-30"></div>

              <div className="flex flex-col gap-3 relative z-10 w-full">
                <h1 className="text-4xl font-black text-[var(--text)] tracking-tight drop-shadow-md break-words">{enrichedBlueprint.name}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="px-4 py-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-xs font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-2 shadow-sm backdrop-blur-sm truncate max-w-full">
                    <span className="material-symbols-outlined !text-[16px] shrink-0">person</span>
                    <span className="truncate">{enrichedBlueprint.creator_name || enrichedBlueprint.master_author || enrichedBlueprint.author || "Citizen"}</span>
                  </span>
                  {enrichedBlueprint.is_paid && <div className="px-4 py-2 rounded-xl bg-[color-mix(in_srgb,#eab308_15%,transparent)] border border-[color-mix(in_srgb,#eab308_30%,transparent)] text-[#fef08a] text-xs font-black tracking-widest uppercase flex items-center gap-2 shadow-sm backdrop-blur-sm shrink-0"><span className="material-symbols-outlined !text-[16px]">monetization_on</span> Premium</div>}
                </div>
              </div>

              <div className="flex items-center gap-3 relative z-10 w-full flex-wrap">
                <div className="flex-1 min-w-[160px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                  <span className="text-[10px] uppercase font-black tracking-widest opacity-50">Game Version</span>
                  <span className="text-lg font-black flex items-center gap-2"><span className="material-symbols-outlined !text-[20px] theme-text-accent">sell</span> {enrichedBlueprint.game_version || enrichedBlueprint.json_data?.game_version || "UNKNOWN"}</span>
                </div>
                <div className="flex-1 min-w-[160px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                  <span className="text-[10px] uppercase font-black tracking-widest opacity-50">Downloads</span>
                  <span className="text-lg font-black flex items-center gap-2"><span className="material-symbols-outlined !text-[20px] theme-text-accent">download</span> {enrichedBlueprint.downloads || 0}</span>
                </div>
                <div className="flex-1 min-w-[160px] flex flex-col gap-1 items-start px-5 py-4 rounded-2xl glass-panel border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-sm backdrop-blur-md transition-transform hover:-translate-y-1 hover:shadow-lg">
                  <span className="text-[10px] uppercase font-black tracking-widest opacity-50">Published</span>
                  <span className="text-lg font-black flex items-center gap-2"><span className="material-symbols-outlined !text-[20px] theme-text-accent">calendar_today</span> {new Date(enrichedBlueprint.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pb-6 shrink-0 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              <h3 className="text-xs font-black capitalize tracking-widest text-[var(--text)] opacity-80 flex items-center gap-3">
                <span className="px-2 py-1 rounded-md bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[10px] theme-text-accent border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                  {displayArtifacts.length}
                </span>
                {t("blueprint_included") || "Included Artifacts"}
              </h3>
              <div className="flex items-center gap-3 flex-1 justify-end">
                <SearchBar
                  value={searchQuery}
                  onChange={(v: string) => setSearchQuery(v)}
                  placeholder={t("search_artifacts") || "Query Artifacts..."}
                  className="w-full max-w-xs h-10"
                />
                <FilterPopover
                  icon="tune"
                  options={[
                    { id: 'ALL', label: t("filter_all") || "Show All", icon: "select_all" },
                    { id: 'MISSING', label: t("filter_missing") || "Missing Only", icon: "warning" }
                  ]}
                  activeTab={filterTab}
                  setTab={setFilterTab}
                  className="shrink-0"
                  buttonClassName="!w-10 !h-10 !rounded-xl"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-8 pt-6">

            {(() => {
              const renderMod = (mod: any, i: number) => {
                const cleaned = cleanModName(mod.name || mod.id);
                return (
                  <div
                    key={`${mod.hash || mod.name}_${i}`}
                    onClick={() => onOpenDossier?.({ ...mod, isNexusView: true })}
                    className="group relative flex flex-col h-28 rounded-2xl bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all duration-300 cursor-pointer overflow-hidden shadow-sm hover:shadow-xl"
                  >
                    <HoverTooltip title={mod.name} />
                    <div className="flex justify-between items-start p-3 pb-0 relative z-10">
                      <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0 group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] group-hover:text-[var(--accent)] transition-colors shadow-inner">
                        <span className="material-symbols-outlined !text-[16px]">
                          {cleaned.ext === 'PACKAGE' ? 'inventory_2' : cleaned.ext === 'TS4SCRIPT' ? 'code' : 'insert_drive_file'}
                        </span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        {mod.is_early_access && (
                          <div className="w-6 h-6 rounded-md bg-[color-mix(in_srgb,#a855f7_15%,transparent)] border border-[color-mix(in_srgb,#a855f7_30%,transparent)] flex items-center justify-center text-[#d8b4fe]" title={t("badge_early_access") || "Early Access"}>
                            <span className="material-symbols-outlined !text-[12px]">science</span>
                          </div>
                        )}
                        {mod.is_paid && (
                          <div className="w-6 h-6 rounded-md bg-[color-mix(in_srgb,#eab308_15%,transparent)] border border-[color-mix(in_srgb,#eab308_30%,transparent)] flex items-center justify-center text-[#fef08a]" title={t("badge_paid") || "Paid"}>
                            <span className="material-symbols-outlined !text-[12px]">monetization_on</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col flex-1 justify-end p-3 relative z-10">
                      <span className="text-[10px] font-black text-[var(--text)] truncate group-hover:theme-text-accent transition-colors leading-tight mb-1">{cleaned.name}</span>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-[8px] font-bold text-[var(--subtext)] opacity-60 tracking-widest">{cleaned.ext}</span>
                        {mod.author && (
                          <span className="text-[8px] font-bold text-[var(--subtext)] opacity-40 capitalize tracking-widest truncate max-w-[80px] text-right">{mod.author}</span>
                        )}
                      </div>
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-tr from-[color-mix(in_srgb,var(--accent)_5%,transparent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                  </div>
                );
              };

              return (
                <div className="flex flex-col gap-8">
                  {premiumMods.length > 0 && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between pb-2 border-b border-[color-mix(in_srgb,var(--warning)_20%,transparent)]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--warning)_20%,transparent)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-yellow-500 flex items-center justify-center shadow-inner">
                            <span className="material-symbols-outlined !text-[16px]">workspace_premium</span>
                          </div>
                          <span className="text-[11px] font-black text-yellow-500 capitalize tracking-widest">{t("premium_artifacts") || "Premium Artifacts"}</span>
                        </div>
                        <span className="text-[9px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-60">
                          {premiumMods.length} Items
                        </span>
                      </div>

                      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                        {premiumMods.map((mod: any, i: number) => renderMod(mod, i))}
                      </div>
                    </div>
                  )}

                  {standardMods.length > 0 && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between pb-2 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] flex items-center justify-center shadow-inner opacity-80">
                            <span className="material-symbols-outlined !text-[16px]">inventory_2</span>
                          </div>
                          <span className="text-[11px] font-black text-[var(--text)] capitalize tracking-widest">{t("standard_artifacts") || "Standard Artifacts"}</span>
                        </div>
                        <span className="text-[9px] font-bold text-[var(--subtext)] capitalize tracking-widest opacity-60">
                          {standardMods.length} Items
                        </span>
                      </div>

                      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                        {standardMods.map((mod: any, i: number) => renderMod(mod, i))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {displayArtifacts.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((prev: number) => prev + 100)}
                className="w-full py-4 mt-2 glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] hover:text-white hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.99]"
              >
                <span className="material-symbols-outlined !text-[16px]">expand_more</span>
                Load More Artifacts ({displayArtifacts.length - visibleCount} Remaining)
              </button>
            )}
          </div>
        </div>
      </SidePanel>
    </>
  );
}




