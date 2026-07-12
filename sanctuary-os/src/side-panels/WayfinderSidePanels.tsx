import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { DashboardStatTile, ViewHeader, SidePanel, CustomDropdown, GameVersionMultiSelect, 
  CustomComplianceDropdown, CustomDatePicker, StatTile, 
  HubTabButton, ModSearchDropdown, EmptyState,
  standardButtonClass, standardPrimaryButtonClass, standardSuccessButtonClass, 
  standardDangerButtonClass, standardAccentGlassButtonClass, 
  extractPostImage, stripMarkdown, isVersionMatch, deriveHumanReadableVersion, getHighestVersion,
  fetchAllPaginated, CustomTierDropdown } from "../shared";
import { ArtifactCard, VaultCard } from "../Cards";
import { CustomMasonDropdown, CustomStatusDropdown } from "../ArchitectHub";
import { MasonStatusDropdown } from "../MasonHub";
import { logArchitectAction } from "../lib/audit";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CustomClassificationDropdown } from "../hub-components/SharedRegistry";
import MasonPostViewer from "./MasonPostViewer";
import MarkdownRenderer from "../MarkdownRenderer";



export function ServerHealthSidePanel({ isOpen, onClose, stats }: any) {
  const { t } = useLexicon();
  if (!isOpen) return null;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("wf_health_title")}
      subtitle={t("wf_health_subtitle")}
      icon="dns"
    >
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
        <div className="flex flex-col gap-4">
          <div className="theme-glass-panel border border-white/5 rounded-2xl p-6 flex items-center justify-between">
             <div className="flex flex-col gap-1">
               <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70">{t("wf_core_node")}</span>
               <span className={`text-xl font-black tracking-widest ${stats.networkStatus === 'ONLINE' ? 'text-emerald-400' : 'text-yellow-400'}`}>{stats.networkStatus === 'ONLINE' ? (t("wf_stat_server_nominal")) : (t("wf_stat_server_degraded"))}</span>
             </div>
             <span className="material-symbols-outlined !text-4xl opacity-20">{t("icon_memory")}</span>
          </div>

          <div className="theme-glass-panel border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
             <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 flex items-center gap-2">
               <span className="material-symbols-outlined !text-[14px]">{t("icon_speed")}</span> {t("auto_system_load")}
             </span>
             <div className="flex flex-col gap-2">
               <div className="flex justify-between text-xs font-bold text-[var(--text)]">
                 <span>{t("wf_health_cpu_usage")}</span>
                 <span className="text-[var(--accent)]">{t("auto_42")}</span>
               </div>
               <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                 <div className="h-full bg-[var(--accent)] w-[42%] shadow-[0_0_10px_rgba(var(--accent-rgb),0.8)]"></div>
               </div>
             </div>
             <div className="flex flex-col gap-2 mt-2">
               <div className="flex justify-between text-xs font-bold text-[var(--text)]">
                 <span>{t("wf_health_memory_allocation")}</span>
                 <span className="text-orange-400">{t("auto_78")}</span>
               </div>
               <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                 <div className="h-full bg-orange-400 w-[78%] shadow-[0_0_10px_rgba(251,146,60,0.8)]"></div>
               </div>
             </div>
          </div>

          <div className="theme-glass-panel border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
             <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 flex items-center gap-2">
               <span className="material-symbols-outlined !text-[14px]">{t("icon_router")}</span> {t("auto_network_diagnostics")}
             </span>
             <div className="grid grid-cols-2 gap-4">
               <div className="flex flex-col gap-1">
                 <span className="text-[9px] uppercase tracking-widest font-bold opacity-50">{t("wf_latency")}</span>
                 <span className="text-lg font-black text-[var(--text)]">{stats.networkLatency || '--'} {t("icon_ms")}</span>
               </div>
               <div className="flex flex-col gap-1">
                 <span className="text-[9px] uppercase tracking-widest font-bold opacity-50">{t("wf_connections")}</span>
                 <span className="text-lg font-black text-blue-400">{t("auto_1_204")}</span>
               </div>
               <div className="flex flex-col gap-1 col-span-2 mt-2">
                 <span className="text-[9px] uppercase tracking-widest font-bold opacity-50">{t("wf_db_sync")}</span>
                 <span className="text-sm font-black text-emerald-400 flex items-center gap-2">
                   <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)] animate-pulse"></span>
                   {t("auto_synchronized")}
                 </span>
               </div>
             </div>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
