import { useStore } from '../store';
import { useModalStore } from '../store/modalStore';
import { useLexicon } from "../LexiconContext";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { createPortal } from "react-dom";
import { SidePanel, getFileLabel, standardButtonClass, standardSuccessButtonClass, HoverTooltip } from "../shared";

const cleanModName = (raw: string) => {
  if (!raw) return "Unknown Artifact";
  const parts = raw.split(/[/\\]/);
  const filename = parts[parts.length - 1];
  let ext = "PACKAGE";
  let name = filename;

  if (getFileLabel(filename, useStore.getState().activeGameSchema) === "SCRIPT") {
    ext = "SCRIPT";
    name = filename.substring(0, filename.length - 10);
  } else if (getFileLabel(filename, useStore.getState().activeGameSchema) === "PACKAGE") {
    name = filename.substring(0, filename.length - 8);
  } else if (filename.includes('.')) {
    const splitExt = filename.split('.');
    ext = splitExt.pop()?.toUpperCase() || "UNKNOWN";
    name = splitExt.join('.');
  }
  return `${name.replace(/_/g, ' ')} [${ext}]`;
};

export function MissingImportsAlert({ missingImportMods, setMissingImportMods, pendingImportSet, setPendingImportSet, finalizeImport, setIsDropzoneOpen }: any) {
  const { t } = useLexicon();
  const { useInternalBrowser, setIsSideBrowserOpen, setSideBrowserUrl } = useModalStore();
  return createPortal(
    <SidePanel
      isOpen={true}
      onClose={() => { setMissingImportMods(null); setPendingImportSet(null); }}
      title={t("import_title")}
      subtitle={<>{t("import_desc1")} <span className="theme-text-accent font-black text-sm">{missingImportMods.length}</span> {t("import_desc2")}</>}
      icon={t("_")}
      widthClass="w-full max-w-3xl"
      backdropZ="z-[100000]"
      panelZ="z-[100001]"
      footer={
        <div className="flex w-full gap-4">
          <button
            onClick={() => { setMissingImportMods(null); setPendingImportSet(null); }}
            className={`flex-1 ${standardButtonClass}`}
          >
            {t("btn_abort")}
          </button>
          <button
            onClick={() => finalizeImport(pendingImportSet)}
            className={`flex-1 ${standardSuccessButtonClass}`}
          >
            {t("btn_confirm")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {missingImportMods.slice(0, 100).map((mod: any, idx: number) => {
          const targetUrl = (mod.url && mod.url.trim() !== "") ? (mod.url.startsWith("http") ? mod.url : `https://${mod.url}`) : `https://www.google.com/search?q=${encodeURIComponent(`Sims 4 mod ${mod.name}`)}`;
          return (
            <div key={idx} className="flex justify-between items-center theme-glass-inner border border-white/5 p-4 rounded-2xl hover:border-white/20 transition-all group shadow-md">
              <div className="flex flex-col min-w-0 pr-4">
                <span className="text-xs font-black text-[var(--text)] uppercase truncate group-hover:theme-text-accent transition-colors">{cleanModName(mod.name)}</span>
                <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest mt-1">{mod.author || t("unknown_mason") || "Unknown Mason"}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const selected = await open({ multiple: true, filters: [{ name: "Mod Artifacts", extensions: [...(useStore.getState().activeGameSchema?.extensions?.supported?.map((e: string) => e.replace('.', '')) || ["package", "ts4script"]), "zip", "rar"] }] });
                    if (selected && selected.length > 0) {
                      const paths = Array.isArray(selected) ? selected : [selected];
                      for (let p of paths) {
                        await invoke("ingest_dropped_file", { path: p, forceReplace: false, targetFolder: null });
                      }
                      const next = missingImportMods.filter((m: any) => m.name !== mod.name);
                      if (next.length === 0) {
                        finalizeImport(pendingImportSet);
                        setMissingImportMods(null);
                      } else {
                        setMissingImportMods(next);
                      }
                    }
                  }}
                  className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-success hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                >
                  <span className="material-symbols-outlined !text-[18px]">file_download</span>
                  <HoverTooltip title={t("missing_imports_inject_locally")} variant="info" className="group-hover/btn:flex z-[200]" />
                </button>
                <button
                  onClick={() => {
                    const next = missingImportMods.filter((m: any) => m.name !== mod.name);
                    if (next.length === 0) {
                      finalizeImport(pendingImportSet);
                      setMissingImportMods(null);
                    } else {
                      setMissingImportMods(next);
                    }
                  }}
                  className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-danger hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                >
                  <span className="material-symbols-outlined !text-[18px]">close</span>
                  <HoverTooltip title={t("defcon_btn_skip")} variant="danger" className="group-hover/btn:flex z-[200]" />
                </button>
                <button
                  onClick={() => {
                    if (useInternalBrowser) {
                      setSideBrowserUrl(targetUrl);
                      setIsSideBrowserOpen(true);
                    } else {
                      openUrl(targetUrl);
                    }
                  }}
                  className="w-10 h-10 shrink-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-accent hover:text-[var(--bg)] rounded-xl transition-all text-[var(--text)] group/btn relative"
                >
                  <span className="material-symbols-outlined !text-[18px]">open_in_new</span>
                  <HoverTooltip title={t("import_intel")} variant="info" className="group-hover/btn:flex z-[200]" />
                </button>
              </div>
            </div>
          );
        })}
        {missingImportMods.length > 100 && (
          <div className="flex items-center justify-center p-6 theme-glass-inner rounded-2xl border border-white/5 border-dashed">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
              + {missingImportMods.length - 100} More Artifacts (Resolve visible artifacts to load more)
            </span>
          </div>
        )}
      </div>
    </SidePanel>, document.body
  );
}
