import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { CustomDropdown, standardAccentGlassButtonClass } from "../shared";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../store";

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
  return createPortal(
    <>
      <div className={`fixed top-0 right-0 bottom-10 ${backdropZ} bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300`} style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setUploadState((s: any) => ({ ...s, isOpen: false }))}></div>
      <div className={`fixed top-10 right-0 bottom-10 w-[550px] max-w-[100vw] theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col ${panelZ} animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px] rounded-tl-[3rem] rounded-bl-[3rem]`} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setUploadState((s: any) => ({ ...s, isOpen: false }))} className="absolute top-8 right-8 z-50 w-10 h-10 theme-glass-panel hover:theme-bg-danger text-[var(--text)] hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <span className="material-symbols-outlined !text-[24px]">{t("icon_close")}</span>
        </button>
        <div className="h-48 relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[var(--accent)]/5 blur-[50px] pointer-events-none rounded-full transform scale-150"></div>
          <div className="w-24 h-24 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-inner flex items-center justify-center relative z-10">
            <span className="material-symbols-outlined text-[var(--accent)] drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]" style={{ fontSize: '48px' }}>
              {marketTab === 'LEXICONS' ? 'translate' : marketTab === 'TEMPLATES' ? 'draw' : 'palette'}
            </span>
          </div>
        </div>

        <div className="px-6 pt-6 pb-2 relative flex-shrink-0">
          <h3 className="text-2xl font-black text-[var(--text)] uppercase truncate">
            {marketTab === 'LEXICONS'
              ? (t("upload_lexicon_title"))
              : marketTab === 'TEMPLATES'
                ? (t("upload_template_title"))
                : (t("upload_chameleon_title"))}
          </h3>
          <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">{t("auto_upload_new_asset")}</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative z-10">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
              <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("upload_file")}</label>
              <div className="flex items-center gap-4">
                <div className={`flex-1 theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold truncate transition-all ${uploadState.fileName ? 'border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] opacity-100' : 'text-[var(--subtext)] opacity-60 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] border-dashed'}`}>
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
                  }} className={`px-6 py-3 font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-lg whitespace-nowrap ${standardAccentGlassButtonClass}`}>
                    {uploadState.fileName ? (t("ui_btn_replace")) : (t("btn_import"))}
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">
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
                  className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)]"
                />
              </div>
              <div className="flex flex-col gap-2 w-32 shrink-0">
                <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">VERSION</label>
                <input
                  type="text"
                  value={uploadState.version}
                  onChange={e => setUploadState((s: any) => ({ ...s, version: e.target.value }))}
                  className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all text-[var(--text)] text-center"
                />
              </div>
            </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("upload_desc")}</label>
                <textarea
                  value={uploadState.description}
                  onChange={e => setUploadState((s: any) => ({ ...s, description: e.target.value }))}
                  className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[100px] text-[var(--text)]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("whats_new")}</label>
                <textarea
                  value={uploadState.releaseNotes || ""}
                  onChange={e => setUploadState((s: any) => ({ ...s, releaseNotes: e.target.value }))}
                  placeholder={t("update_panel_no_notes")}
                  className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm focus:outline-none focus:theme-border-accent transition-all min-h-[80px] text-[var(--text)]"
                />
              </div>

            {marketTab === 'LEXICONS' && (
              <>
                <div className="flex flex-col gap-2 relative z-[60]">
                  <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("tab_lexicons")}</label>
                  <CustomDropdown disableTint={true}
                    value={uploadState.language}
                    onChange={(val: string[]) => setUploadState((s: any) => ({ ...s, language: val[0] }))}
                    options={[
                      ...(uploadState.language && uploadState.language !== 'add_new' && !availableLanguages.includes(uploadState.language) ? [{ id: uploadState.language, label: uploadState.language.toUpperCase() }] : []),
                      ...availableLanguages.map((l: any) => ({ id: l, label: l })),
                      { id: "add_new", label: t("upload_add_language") || "Add New..." }
                    ]}
                  />
                </div>
                {uploadState.language === 'add_new' && (
                  <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("upload_new_language")}</label>
                    <input
                      type="text"
                      value={uploadState.newLanguage}
                      onChange={e => setUploadState((s: any) => ({ ...s, newLanguage: e.target.value }))}
                      className="w-full theme-glass-inner rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:theme-border-accent transition-all border-l-4 border-l-[var(--accent)] text-[var(--text)]"
                      placeholder={t("ph_language")}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2 relative z-[50]">
                  <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("filter_type")}</label>
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
                <label className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest">{t("filter_mode")}</label>
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
        <div className="p-8 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] backdrop-blur-xl flex flex-row items-center justify-center gap-4 w-full relative z-50 shrink-0">
          <button
            onClick={() => setUploadState((s: any) => ({ ...s, isOpen: false }))}
            className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          >
            <span className="material-symbols-outlined !text-[18px]">{t("icon_close")}</span>
            {t("nav_cancel")}
          </button>
          <button
            onClick={submitUpload}
            disabled={!uploadState.name || (uploadState.language === 'add_new' && !uploadState.newLanguage)}
            className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--success-rgb),0.2)] disabled:opacity-50 disabled:hover:scale-100 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined !text-[18px]">{uploadState.isEdit ? (t("icon_save")) : (t("icon_upload"))}</span>
            {uploadState.isEdit ? (t("upload_btn_update")) : (t("upload_submit"))}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

export function MarketReportPanel({
  reportState,
  setReportState,
  handleReportSubmit
}: any) {
  const { t } = useLexicon();
  if (!reportState.isOpen) return null;
  return createPortal(
    <>
      <div className="fixed top-0 right-0 bottom-10 z-[65000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setReportState({ isOpen: false, assetId: null, assetType: null, reason: '' })} />
      <div className="fixed top-10 right-0 bottom-10 w-[500px] max-w-[100vw] theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[65001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px]" onClick={(e: any) => e.stopPropagation()}>
        <div className="h-40 relative bg-black border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0">
          <div className="w-full h-full flex items-center justify-center opacity-40 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
            <span className="material-symbols-outlined text-white" style={{ fontSize: '120px' }}>{t("icon_flag")}</span>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--danger)_30%,transparent)] to-transparent" />
          <button type="button" onClick={() => setReportState({ isOpen: false, assetId: null, assetType: null, reason: '' })} className="absolute top-12 right-6 z-50 w-10 h-10 bg-black/40 backdrop-blur-[3px] hover:theme-bg-danger text-white/70 hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <span className="material-symbols-outlined !text-[24px]">{t("icon_close")}</span>
          </button>
        </div>

        <div className="px-6 pt-6 pb-2 relative flex-shrink-0">
          <h3 className="text-2xl font-black text-[var(--text)] uppercase truncate">{t("report_title")}</h3>
          <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-1">{t("report_desc")}</p>
        </div>

        <form onSubmit={handleReportSubmit} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative z-10">
          <div className="p-6 flex flex-col gap-6 flex-1">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-2">{t("reason")}</label>
              <textarea
                required
                value={reportState.reason}
                placeholder={t("report_placeholder")}
                title={t("report_placeholder")}
                onChange={(e) => setReportState({ ...reportState, reason: e.target.value })}
                className="h-48 theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm font-bold resize-none focus:outline-none focus:theme-border-accent"
              />
            </div>
          </div>

          <div className="p-8 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] backdrop-blur-xl flex flex-row items-center justify-center gap-4 w-full relative z-50 shrink-0">
            <button type="button" onClick={() => setReportState({ isOpen: false, assetId: null, assetType: null, reason: '' })} className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]">
              <span className="material-symbols-outlined !text-[18px]">{t("icon_close")}</span>
              {t("nav_cancel")}
            </button>
            <button type="submit" className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--danger-rgb),0.2)]">
              <span className="material-symbols-outlined !text-[18px]">{t("icon_flag")}</span>
              {t("report_submit")}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  );
}

export function MarketBlueprintPanel({
  selectedBlueprint,
  setSelectedBlueprint,
  onOpenDossier,
  cleanModName,
  syncBlueprintByCode
}: any) {
  const { t } = useLexicon();
  
  const [enrichedBlueprint, setEnrichedBlueprint] = useState(selectedBlueprint);
  const [visibleCount, setVisibleCount] = useState(100);

  useEffect(() => {
    if (!selectedBlueprint) {
      setEnrichedBlueprint(null);
      return;
    }
    setEnrichedBlueprint(selectedBlueprint);
    setVisibleCount(100);

    const fetchPremiumStatus = async () => {
      const artifacts = selectedBlueprint.json_data?.artifacts || [];
      const hashes = artifacts.map((a: any) => a.hash).filter(Boolean);
      if (hashes.length === 0) return;
      
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

      // Always sort to bring Premium/EA to the top so it doesn't look "Random" to the user
      finalArtifacts = [...finalArtifacts].sort((a: any, b: any) => {
        const aPremium = a.is_paid || a.is_early_access ? 1 : 0;
        const bPremium = b.is_paid || b.is_early_access ? 1 : 0;
        if (aPremium !== bPremium) return bPremium - aPremium;
        return (a.name || '').localeCompare(b.name || '');
      });

      setEnrichedBlueprint({
        ...selectedBlueprint,
        is_paid: selectedBlueprint.is_paid || finalArtifacts.some((a: any) => a.is_paid),
        is_early_access: selectedBlueprint.is_early_access || finalArtifacts.some((a: any) => a.is_early_access),
        json_data: { ...selectedBlueprint.json_data, artifacts: finalArtifacts }
      });
    };
    fetchPremiumStatus();
  }, [selectedBlueprint]);

  if (!enrichedBlueprint) return null;

  return createPortal(
    <>
      <div className="fixed top-0 right-0 bottom-10 z-[15000] bg-black/0 backdrop-blur-[3px] animate-in fade-in duration-300" style={{ left: 'var(--sidebar-width, 288px)' }} onClick={() => setSelectedBlueprint(null)}></div>
      <div className="fixed top-10 right-0 bottom-10 w-full max-w-4xl theme-glass-panel !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col z-[15001] animate-in slide-in-from-right duration-500 overflow-hidden backdrop-blur-[3px] rounded-tl-[3rem] rounded-bl-[3rem]" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setSelectedBlueprint(null)} className="absolute top-8 right-8 z-50 w-10 h-10 theme-glass-panel hover:theme-bg-danger text-[var(--text)] hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <span className="material-symbols-outlined !text-[24px]">{t("icon_close")}</span>
        </button>
        <div className="h-48 relative border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[var(--accent)]/5 blur-[50px] pointer-events-none rounded-full transform scale-150"></div>
          <div className="w-24 h-24 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-inner flex items-center justify-center relative z-10">
            <span className="material-symbols-outlined text-[var(--accent)] drop-shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]" style={{ fontSize: '48px' }}>{t("icon_map")}</span>
          </div>
        </div>

        <div className="px-10 pt-8 pb-4 relative shrink-0 flex justify-between items-start gap-6">
          <div className="flex flex-col min-w-0">
            <h3 className="text-3xl font-black text-[var(--text)] uppercase truncate">{enrichedBlueprint.name}</h3>
            <p className="text-[10px] font-black text-[var(--subtext)] opacity-80 uppercase tracking-widest mt-2 flex gap-4">
              <span>{enrichedBlueprint.author || "Citizen"} &bull; {new Date(enrichedBlueprint.created_at).toLocaleDateString()}</span>
              <span className="text-[var(--accent)] font-mono">{enrichedBlueprint.json_data.game_version ? `${t("blueprint_verified") || "VERIFIED VERSION:"} ${enrichedBlueprint.json_data.game_version}` : (t("blueprint_verified_unknown"))}</span>
            </p>
          </div>
          {(enrichedBlueprint.is_paid || enrichedBlueprint.is_early_access) && (
            <div className="flex flex-col gap-2 shrink-0 items-end">
              {enrichedBlueprint.is_early_access && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,#a855f7_15%,transparent)] border border-[color-mix(in_srgb,#a855f7_30%,transparent)] rounded-lg backdrop-blur-md shadow-lg">
                  <span className="material-symbols-outlined !text-[12px] text-[#d8b4fe]">science</span>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#d8b4fe]">{t("badge_early_access") || "Early Access"}</span>
                </div>
              )}
              {enrichedBlueprint.is_paid && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[color-mix(in_srgb,#eab308_15%,transparent)] border border-[color-mix(in_srgb,#eab308_30%,transparent)] rounded-lg backdrop-blur-md shadow-lg">
                  <span className="material-symbols-outlined !text-[12px] text-[#fef08a]">monetization_on</span>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#fef08a]">{t("badge_paid") || "Paid"}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex flex-col gap-8 relative z-10">
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] opacity-80 flex items-center gap-2">
              <span className="theme-text-accent">{enrichedBlueprint.json_data.artifacts?.length || 0}</span> {t("blueprint_included")}
            </h3>
            
            {(() => {
              const visibleArtifacts = (enrichedBlueprint.json_data.artifacts || []).slice(0, visibleCount);
              const premiumMods = visibleArtifacts.filter((m: any) => m.is_paid || m.is_early_access);
              const standardMods = visibleArtifacts.filter((m: any) => !m.is_paid && !m.is_early_access);

              const renderMod = (mod: any, i: number) => (
                <div key={`${mod.hash || mod.name}_${i}`} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] p-4 rounded-2xl hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all group">
                  <button
                    onClick={() => onOpenDossier?.({ ...mod, isNexusView: true })}
                    className="flex flex-col items-start hover:theme-text-accent transition-colors text-left min-w-0 pr-4"
                  >
                    <span className="text-sm font-black text-[var(--text)] uppercase tracking-tight truncate w-full">{cleanModName(mod.name || mod.id).name}</span>
                    <span className="text-[9px] font-mono theme-text-accent tracking-[0.2em] uppercase opacity-70 mt-1">{cleanModName(mod.name || mod.id).ext}</span>
                    {(mod.is_paid || mod.is_early_access) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {mod.is_early_access && (
                          <div className="px-2 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-1 shadow-[0_0_10px_rgba(168,85,247,0.1)]">
                            <span className="material-symbols-outlined !text-[10px] text-purple-500">science</span>
                            <span className="text-[8px] font-black uppercase tracking-[0.1em] text-purple-500">{t("badge_early_access") || "Early Access"}</span>
                          </div>
                        )}
                        {mod.is_paid && (
                          <div className="px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                            <span className="material-symbols-outlined !text-[10px] text-yellow-500">monetization_on</span>
                            <span className="text-[8px] font-black uppercase tracking-[0.1em] text-yellow-500">{t("badge_paid") || "Paid"}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {mod.author && <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest ml-4">{mod.author}</span>}
                  </div>
                </div>
              );

              return (
                <div className="flex flex-col gap-6">
                  {premiumMods.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 p-4 theme-glass-panel border border-yellow-500/30 rounded-2xl bg-yellow-500/5 shadow-md">
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-yellow-500/20 text-yellow-500">
                          <span className="material-symbols-outlined !text-[20px]">workspace_premium</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-yellow-500 uppercase tracking-widest">Premium Artifacts</span>
                          <span className="text-[10px] font-bold text-[var(--subtext)] uppercase tracking-wider opacity-80">
                            {premiumMods.filter((m: any) => m.is_paid).length} Paid, {premiumMods.filter((m: any) => m.is_early_access).length} Early Access
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {premiumMods.map(renderMod)}
                      </div>
                    </div>
                  )}
                  
                  {standardMods.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {standardMods.map(renderMod)}
                    </div>
                  )}
                </div>
              );
            })()}
              {(enrichedBlueprint.json_data.artifacts?.length || 0) > visibleCount && (
                <button
                  onClick={() => setVisibleCount((prev: number) => prev + 100)}
                  className="w-full py-4 mt-2 theme-glass-panel border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.99]"
                >
                  <span className="material-symbols-outlined !text-[16px]">expand_more</span>
                  Load More Artifacts ({(enrichedBlueprint.json_data.artifacts?.length || 0) - visibleCount} Remaining)
                </button>
              )}
          </div>
        </div>
        <div className="p-8 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] backdrop-blur-xl flex flex-row items-center justify-center gap-4 w-full relative z-50 shrink-0">
          <button
            onClick={() => setSelectedBlueprint(null)}
            className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          >
            <span className="material-symbols-outlined !text-[18px]">{t("icon_close")}</span>
            {t("nav_cancel")}
          </button>
          <button
            onClick={() => {
              if (syncBlueprintByCode) syncBlueprintByCode(selectedBlueprint.json_data.code);
              setSelectedBlueprint(null);
            }}
            className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] transition-all border backdrop-blur-md text-xs hover:scale-[1.02] active:scale-95 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-[0_5px_20px_rgba(var(--accent-rgb),0.2)]"
          >
            <span className="material-symbols-outlined !text-[18px]">{t("icon_download")}</span>
            {t("update_panel_install")}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
