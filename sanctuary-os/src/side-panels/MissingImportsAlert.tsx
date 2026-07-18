import { useStore } from '../store';
﻿import { useLexicon } from "../LexiconContext";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { createPortal } from "react-dom";
import { SidePanel , getFileLabel} from "../shared";

const cleanModName = (raw: string) => {
  if (!raw) return "Unknown Artifact";
  const parts = raw.split(/[/\\]/);
  const filename = parts[parts.length - 1];
  let ext = "PACKAGE";
  let name = filename;
  const { useStore } = require("../store");
  if (require("../shared").getFileLabel(filename, useStore.getState().activeGameSchema) === "SCRIPT") {
    ext = "SCRIPT";
    name = filename.substring(0, filename.length - 10);
  } else if (require("../shared").getFileLabel(filename, useStore.getState().activeGameSchema) === "PACKAGE") {
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
  return createPortal(
    <SidePanel
      isOpen={true}
      onClose={() => { setMissingImportMods(null); setPendingImportSet(null); }}
      title={t("import_title")}
      subtitle={<>{t("import_desc1")} <span className="theme-text-accent font-black text-sm">{missingImportMods.length}</span> {t("import_desc2")}</>}
      icon={t("_")}
      widthClass="w-full max-w-3xl"
      backdropZ="z-[15000]"
      panelZ="z-[15001]"
      footer={
        <div className="flex w-full gap-4">
          <button 
            onClick={() => { setMissingImportMods(null); setPendingImportSet(null); }} 
            className="flex-1 py-4 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all"
          >
            {t("btn_abort")}
          </button>
          <button 
            onClick={() => finalizeImport(pendingImportSet)} 
            className="flex-1 py-4 theme-bg-success text-[var(--bg)] font-black rounded-2xl text-[10px] uppercase tracking-widest hover:opacity-90 transition-all shadow-[0_0_20px_rgba(var(--success-rgb),0.3)]"
          >
            {t("btn_confirm")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {missingImportMods.map((mod: any, idx: number) => {
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
                    const selected = await open({ multiple: true, filters: [{ name: "Mod Artifacts", extensions: [...(useStore.getState().activeGameSchema?.extensions?.supported?.map((e: string) => e.replace('.','')) || ["package", "ts4script"]), "zip", "rar"] }] }); 
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
                  className="shrink-0 px-4 py-2.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-success hover:text-[var(--bg)] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 text-[var(--text)]"
                >
                  {t("missing_imports_inject_locally")}
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
                  className="shrink-0 px-4 py-2.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-danger hover:text-[var(--bg)] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all text-[var(--text)]"
                >
                  {t("defcon_btn_skip")}
                </button>
                <button 
                  onClick={() => {
                    openUrl(targetUrl);
                    setIsDropzoneOpen(true);
                  }} 
                  className="shrink-0 px-4 py-2.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:theme-bg-accent hover:text-[var(--bg)] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 text-[var(--text)]"
                >
                  {t("import_intel")} <span className="text-sm">{t("icon_open_in_new")}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </SidePanel>, document.body
  );
}
