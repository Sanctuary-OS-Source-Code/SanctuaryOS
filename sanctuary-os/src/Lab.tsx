import { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { ViewHeader, ModSearchDropdown, SidePanel } from "./shared";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

export default function Lab({
  activeLabMod, setActiveLabMod, modList = [],
  concludeTest, executeHotSwap, shelterActive, conflictTarget, setConflictTarget,
  testErrorFound, testLogSnippet, isSubmittingReport, submitLabReport
}: any) {
  const { t } = useLexicon();

  const [stagedExtras, setStagedExtras] = useState<any[]>([]);
  const [conflictExtras, setConflictExtras] = useState<any[]>([]);
  const [showReportPanel, setShowReportPanel] = useState(false);

  useEffect(() => {
    if (testLogSnippet) {
      setShowReportPanel(true);
    }
  }, [testLogSnippet]);

  const handleExportLogs = async () => {
    try {
      const path = await save({ defaultPath: 'Solder_Lab_Report.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
      if (path) {
        await writeTextFile(path, testLogSnippet || "");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const runCombinedHotSwap = () => {
    const extraNames = [...stagedExtras, ...conflictExtras].map(m => m.name);
    executeHotSwap(extraNames);
  };

  const handleCloseReport = () => {
    setShowReportPanel(false);
  };

  const getModName = (mod: any) => {
    if (!mod) return "UNKNOWN";
    return mod.displayName || mod.name?.replace(/_/g, ' ') || "UNKNOWN SIGNATURE";
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden animate-in fade-in duration-700 pb-24 lg:pb-32">

      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vw] h-[120vw] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--accent)_4%,transparent),transparent_60%)] mix-blend-screen" />
        {activeLabMod && <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAzNHYtNGgtdjRoLTh2NGgtNHY0SDh2NGgxMnY0aDh2LTRoMTJ2LTRoNHoiIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMiIvPjwvZz48L3N2Zz4=')] opacity-20 pointer-events-none" />}
      </div>

      <div className="relative z-10 shrink-0">
        <ViewHeader
          title={t("lab_title")}
          subtitle={t("lab_subtitle")}
          icon={t("icon_science")}
          iconColorClass="text-lime-400 border-lime-500/30"
        />
      </div>

      <div className="flex-1 relative z-10 px-8 lg:px-16 flex flex-col min-h-0 w-full max-w-[1800px] mx-auto">

        {!activeLabMod ? (
          <div className="flex-1 flex flex-col items-center justify-center animate-in zoom-in-95 duration-1000">
            <div className="w-[400px] max-w-full flex flex-col items-center gap-8 relative group">
              <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] blur-[100px] rounded-full opacity-50 group-hover:opacity-80 transition-opacity duration-700 pointer-events-none" />

              <div className="w-48 h-48 rounded-full border border-white/10 bg-black/40 shadow-[0_0_50px_color-mix(in_srgb,var(--accent)_10%,transparent)] flex items-center justify-center relative backdrop-blur-xl">
                <div className="absolute inset-0 rounded-full border-[2px] border-dashed border-[var(--accent)] opacity-30 animate-[spin_30s_linear_infinite]" />
                <div className="absolute inset-4 rounded-full border border-[var(--text)] opacity-10 animate-[spin_20s_linear_infinite_reverse]" />
                <span className="material-symbols-outlined !text-[80px] text-[var(--accent)] drop-shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_80%,transparent)] animate-pulse">
                  {t("icon_all_inclusive")}
                </span>
              </div>

              <div className="text-center space-y-4 w-full">
                <h2 className="text-3xl font-black text-[var(--text)] uppercase tracking-tighter drop-shadow-md">
                  {t("mount_subject")}
                </h2>
                <p className="text-xs font-bold text-[var(--subtext)] uppercase tracking-widest opacity-80 leading-relaxed max-w-xs mx-auto">
                  {t("mount_desc")}
                </p>
                <div className="pt-6 w-full relative z-50 shadow-2xl">
                  <ModSearchDropdown
                    modList={modList.filter((m: any) => !m.isVirtual)}
                    selectedItem={null}
                    onSelect={(m: any) => setActiveLabMod(m)}
                    onClear={() => { }}
                    placeholder={t("filter_dna")}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-bottom-8 duration-700 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr] gap-6 lg:gap-12 h-full pb-8">

              <div className="theme-glass-panel border-white/5 rounded-[var(--radius)] p-8 flex flex-col gap-6 shadow-2xl relative overflow-hidden backdrop-blur-2xl group transition-all hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] h-full min-h-[400px]">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] blur-[50px] rounded-full pointer-events-none" />

                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                    <span className="material-symbols-outlined text-[var(--text)] opacity-80 !text-[20px]">{t("icon_folder")}</span>
                  </div>
                  <div>
                    <h3 className="text-[12px] font-black text-[var(--text)] uppercase tracking-widest leading-tight">{t("symbiotic_deps")}</h3>
                    <p className="text-[9px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-60">{t("associated_identities")}</p>
                  </div>
                </div>

                <p className="text-[10px] text-[var(--subtext)] leading-relaxed opacity-80 font-medium shrink-0">
                  {t("symbiotic_desc")}
                </p>

                <div className="flex-1 flex flex-col gap-3 min-h-[150px] mt-2 relative">
                  {stagedExtras.length === 0 ? (
                    <div className="flex-1 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center opacity-40 gap-3">
                      <span className="material-symbols-outlined !text-[32px] text-[var(--text)] opacity-50">{t("icon_info")}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-center leading-relaxed">
                        {t("no_deps")}
                      </span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-3">
                      {stagedExtras.map((m: any) => (
                        <div key={m.hash} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/5 p-4 rounded-2xl hover:border-white/20 hover:bg-white/5 transition-all group/item shadow-sm">
                          <span className="text-[10px] font-black uppercase text-[var(--text)] truncate max-w-[180px] drop-shadow-md">{getModName(m)}</span>
                          <button onClick={() => setStagedExtras(stagedExtras.filter(e => e.hash !== m.hash))} className="w-6 h-6 rounded-full flex items-center justify-center bg-black/20 text-[var(--subtext)] hover:bg-[var(--danger)] hover:text-white opacity-0 group-hover/item:opacity-100 transition-all shrink-0"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close")}</span></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative z-20 shrink-0 mt-4 border-t border-white/5 pt-6">
                  <ModSearchDropdown
                    modList={modList.filter((m: any) => !m.isVirtual && m.hash !== activeLabMod.hash && !conflictExtras.find(e => e.hash === m.hash))}
                    selectedItem={null}
                    onSelect={(m: any) => { if (m && !stagedExtras.find(e => e.hash === m.hash)) setStagedExtras([...stagedExtras, m]); }}
                    onClear={() => { }}
                    placeholder={t("add_extra")}
                    dropUp={true}
                  />
                </div>
              </div>

              <div className="flex flex-col items-center justify-center text-center relative group h-full py-12 min-w-0 w-full">

                <div className="hidden lg:block absolute top-1/2 -left-12 right-auto w-12 h-px bg-gradient-to-r from-transparent to-white/20 pointer-events-none" />
                <div className="hidden lg:block absolute top-1/2 left-auto -right-12 w-12 h-px bg-gradient-to-l from-transparent to-white/20 pointer-events-none" />

                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--accent)_15%,transparent),transparent_70%)] pointer-events-none opacity-50 mix-blend-screen" />

                <div className="w-32 h-32 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[0_0_40px_color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center mb-8 relative rotate-45 backdrop-blur-xl group-hover:shadow-[0_0_60px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all duration-500 shrink-0">
                  <div className="absolute inset-0 border border-[var(--accent)] opacity-20 rounded-[var(--radius)] animate-pulse" />
                  <span className="material-symbols-outlined !text-[56px] text-[var(--accent)] -rotate-45 drop-shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]">
                    {t("icon_science")}
                  </span>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full mb-4 shadow-sm backdrop-blur-md shrink-0">
                  <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("subject_isolation")}</span>
                </div>

                <h2 className="text-3xl lg:text-4xl font-black text-[var(--text)] uppercase tracking-tighter leading-tight mb-3 drop-shadow-xl w-full line-clamp-3 break-words px-4">
                  {getModName(activeLabMod)}
                </h2>

                <p className="text-[10px] font-mono text-[var(--subtext)] opacity-60 tracking-widest bg-black/40 px-4 py-1.5 rounded-lg border border-white/5 truncate max-w-[280px]">
                  {t("icon_virtual_")}{activeLabMod.hash || "vlocal"}
                </p>

                <button
                  onClick={() => { setActiveLabMod(null); setConflictTarget(null); setStagedExtras([]); setConflictExtras([]); }}
                  className="mt-8 px-6 py-2.5 rounded-full bg-transparent border border-white/10 text-[var(--subtext)] hover:text-white hover:bg-white/10 text-[9px] font-black uppercase tracking-widest transition-all"
                >
                  {t("lab_btn_abort")}
                </button>
              </div>

              <div className="theme-glass-panel border-white/5 rounded-[var(--radius)] p-8 flex flex-col gap-6 shadow-2xl relative overflow-hidden backdrop-blur-2xl group transition-all hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] h-full min-h-[400px]">
                <div className="absolute top-0 left-0 w-32 h-32 bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] blur-[50px] rounded-full pointer-events-none" />

                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                    <span className="material-symbols-outlined theme-text-warning opacity-90 !text-[20px]">{t("icon_warning_amber")}</span>
                  </div>
                  <div>
                    <h3 className="text-[12px] font-black text-[var(--text)] uppercase tracking-widest leading-tight">{t("adversarial_entities")}</h3>
                    <p className="text-[9px] font-bold text-[var(--subtext)] uppercase tracking-widest opacity-60">{t("nexus_sim")}</p>
                  </div>
                </div>

                <p className="text-[10px] text-[var(--subtext)] leading-relaxed opacity-80 font-medium shrink-0">
                  {t("adversarial_desc")}
                </p>

                <div className="flex-1 flex flex-col gap-4 min-h-[150px] mt-2 relative">
                  {!conflictTarget ? (
                    <div className="flex-1 border-2 border-dashed border-[color-mix(in_srgb,var(--warning)_30%,transparent)] rounded-2xl flex flex-col items-center justify-center opacity-40 gap-3 bg-[color-mix(in_srgb,var(--warning)_5%,transparent)] transition-all hover:opacity-80">
                      <span className="material-symbols-outlined !text-[32px] theme-text-warning opacity-80 animate-pulse">{t("icon_crisis_alert")}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-center leading-relaxed theme-text-warning">
                        {t("no_clash")}
                      </span>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-4">
                      <div className="relative overflow-hidden bg-black/40 border border-[color-mix(in_srgb,var(--warning)_50%,transparent)] p-5 rounded-2xl shadow-[0_0_20px_color-mix(in_srgb,var(--warning)_20%,transparent)]">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--warning)] opacity-10 blur-[20px] rounded-full pointer-events-none" />
                        <div className="flex justify-between items-start gap-4 relative z-10">
                          <div className="flex flex-col gap-1 pr-2 min-w-0">
                            <span className="text-[9px] font-black theme-text-warning uppercase tracking-[0.2em] animate-pulse flex items-center gap-2">
                              {t("primary_adversary")}
                            </span>
                            <span className="text-sm font-black uppercase text-[var(--text)] drop-shadow-md break-words leading-tight mt-1">{getModName(conflictTarget)}</span>
                          </div>
                          <button onClick={() => { setConflictTarget(null); setConflictExtras([]); }} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-white/10 hover:bg-[var(--danger)] text-white/70 hover:text-white transition-all shadow-md"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close")}</span></button>
                        </div>
                      </div>

                      {conflictExtras.length > 0 && (
                        <div className="flex flex-col gap-3 mt-2">
                          <span className="text-[9px] font-black text-[var(--subtext)] uppercase tracking-widest px-2 opacity-60">
                            {t("symbiotic_deps")}
                          </span>
                          <div className="overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-3 max-h-[120px]">
                            {conflictExtras.map((m: any) => (
                              <div key={m.hash} className="flex justify-between items-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-white/5 p-4 rounded-2xl hover:border-white/20 hover:bg-white/5 transition-all group/item shadow-sm">
                                <span className="text-[10px] font-black uppercase text-[var(--text)] truncate max-w-[180px] drop-shadow-md">{getModName(m)}</span>
                                <button onClick={() => setConflictExtras(conflictExtras.filter(e => e.hash !== m.hash))} className="w-6 h-6 rounded-full flex items-center justify-center bg-black/20 text-[var(--subtext)] hover:bg-[var(--danger)] hover:text-white opacity-0 group-hover/item:opacity-100 transition-all shrink-0"><span className='material-symbols-outlined !text-[12px]'>{t("icon_close")}</span></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative z-20 shrink-0 mt-4 border-t border-white/5 pt-6 flex flex-col gap-3">
                  {!conflictTarget ? (
                    <ModSearchDropdown
                      modList={modList.filter((m: any) => !m.isVirtual && m.hash !== activeLabMod?.hash).map((m: any) => ({ ...m, displayName: getModName(m) }))}
                      selectedItem={conflictTarget}
                      onSelect={setConflictTarget}
                      onClear={() => setConflictTarget(null)}
                      placeholder={t("select_adversary")}
                      dropUp={true}
                    />
                  ) : (
                    <ModSearchDropdown
                      modList={modList.filter((m: any) => !m.isVirtual && m.hash !== activeLabMod.hash && m.hash !== conflictTarget?.hash && !stagedExtras.find(e => e.hash === m.hash))}
                      selectedItem={null}
                      onSelect={(m: any) => { if (m && !conflictExtras.find(e => e.hash === m.hash)) setConflictExtras([...conflictExtras, m]); }}
                      onClear={() => { }}
                      placeholder={t("add_extra")}
                      dropUp={true}
                    />
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {activeLabMod && (
        <div className="fixed bottom-0 left-[var(--sidebar-width)] right-0 pb-10 pt-4 z-40 flex items-center justify-center px-8 animate-in slide-in-from-bottom duration-500 pointer-events-none">
          <div className="w-full max-w-[1800px] mx-auto flex items-center justify-between theme-glass-panel border-white/5 backdrop-blur-3xl px-8 py-6 rounded-[var(--radius)] shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto">
            <div className="hidden lg:flex flex-col gap-1 w-[250px]">
              <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("pending")}</span>
              <span className="text-sm font-black theme-text-accent tracking-widest uppercase flex items-center gap-2">
                {shelterActive ? t("btn_sim_progress") : "READY FOR INJECTION"}
              </span>
            </div>

            <div className="flex-1 lg:flex-none flex justify-center lg:min-w-[400px]">
              {!shelterActive ? (
                <button
                  onClick={runCombinedHotSwap}
                  className="w-full lg:w-auto px-12 py-5 bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)] rounded-[var(--radius)] flex items-center justify-center gap-3 font-black uppercase tracking-[0.2em] shadow-[0_10px_40px_color-mix(in_srgb,var(--accent)_20%,transparent)] hover:shadow-[0_15px_50px_color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:-translate-y-1 active:translate-y-0 transition-all group backdrop-blur-xl"
                >
                  <div className="absolute inset-0 rounded-[var(--radius)] opacity-20 bg-gradient-to-b from-[var(--accent)] to-transparent pointer-events-none" />
                  <span className="material-symbols-outlined !text-[20px] animate-pulse relative z-10">{t("icon_bolt")}</span>
                  <span className="relative z-10">{t("btn_initiate_swap")}</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowReportPanel(true)}
                  className="w-full lg:w-auto px-12 py-5 bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[var(--success)] rounded-[var(--radius)] flex items-center justify-center gap-3 font-black uppercase tracking-[0.2em] shadow-[0_10px_40px_color-mix(in_srgb,var(--success)_20%,transparent)] hover:shadow-[0_15px_50px_color-mix(in_srgb,var(--success)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:-translate-y-1 active:translate-y-0 transition-all group backdrop-blur-xl"
                >
                  <div className="absolute inset-0 rounded-[var(--radius)] opacity-20 bg-gradient-to-b from-[var(--success)] to-transparent pointer-events-none" />
                  <span className="material-symbols-outlined !text-[20px] animate-spin-slow relative z-10">{t("icon_science")}</span>
                  <span className="relative z-10">{t("btn_conclude_experiment")}</span>
                </button>
              )}
            </div>

            <div className="hidden lg:flex flex-col items-end gap-1 w-[250px]">
              <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest">{t("payload")}</span>
              <span className="text-xs font-black text-[var(--text)] tracking-widest uppercase">
                {t("core_plus")}{stagedExtras.length + (conflictTarget ? 1 : 0) + conflictExtras.length}{t("injected")}
              </span>
            </div>
          </div>
        </div>
      )}

      <SidePanel
        isOpen={showReportPanel}
        onClose={handleCloseReport}
        title={t("tier3_results")}
        subtitle={testErrorFound ? (t("status_broken")) : (t("verified"))}
        icon={testErrorFound ? 'warning' : 'science'}
        iconColorClass={testErrorFound ? 'text-[var(--danger)]' : 'text-[var(--success)]'}
        widthClass="w-[800px] max-w-[90vw]"
        footer={
          <div className="flex gap-4 w-full">
            <button
              onClick={handleExportLogs}
              className="py-5 px-6 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] border border-white/10 rounded-[var(--radius)] font-black text-[11px] uppercase tracking-[0.2em] text-[var(--text)] transition-all flex items-center justify-center gap-3 shrink-0"
            >
              <span className="material-symbols-outlined !text-[18px]">{t("icon_download")}</span>
              {t("export_logs")}
            </button>
            <button
              onClick={() => {
                const ctx = {
                  conflictTarget: conflictTarget?.name,
                  dependencies: [...stagedExtras.map(m => m.name), ...conflictExtras.map(m => m.name)]
                };
                concludeTest(ctx);
                setStagedExtras([]);
                setConflictExtras([]);
                handleCloseReport();
              }}
              className={`flex-1 py-5 rounded-[var(--radius)] font-black text-[11px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 border shadow-xl ${testErrorFound ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_25%,transparent)] hover:border-[var(--danger)] shadow-[0_10px_30px_color-mix(in_srgb,var(--danger)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)] hover:border-[var(--success)] shadow-[0_10px_30px_color-mix(in_srgb,var(--success)_20%,transparent)]'}`}
            >
              <span className="material-symbols-outlined !text-[18px]">{testErrorFound ? 'shield' : 'verified_user'}</span>
              {testErrorFound ? (t("secure_broken")) : (t("secure_verified"))}
            </button>
          </div>
        }
      >
        <div className="flex flex-col h-full relative">
          <div className={`absolute -top-40 -right-40 w-[500px] h-[500px] blur-[100px] rounded-full opacity-10 pointer-events-none transition-colors duration-1000 ${testErrorFound ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'}`} />

          <div className="flex-1 min-h-[400px] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] backdrop-blur-md border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-2xl p-6 font-mono text-[11px] text-[var(--text)] overflow-y-auto custom-scrollbar shadow-inner relative flex flex-col z-10">
            <div className="flex items-center gap-2 mb-6 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4 shrink-0">
              <span className="material-symbols-outlined text-[var(--subtext)] opacity-50 !text-[16px]">{t("icon_terminal")}</span>
              <span className="text-[var(--subtext)] opacity-70 uppercase tracking-widest">{t("execution_logs")} {t("system_stdout")}</span>
            </div>

            <pre className="whitespace-pre-wrap break-all leading-relaxed flex-1 opacity-80">
              {testLogSnippet || t("no_logs") || "No logs available for this session. System reports standard exit code."}
            </pre>
          </div>
        </div>
      </SidePanel>

    </div>
  );
}
