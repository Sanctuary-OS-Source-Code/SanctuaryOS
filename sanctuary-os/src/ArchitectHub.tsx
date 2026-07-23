import { SanctuaryAlertsSidePanel } from './side-panels/SanctuaryAlertsSidePanel';
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { SidePanel, ModSearchDropdown, ViewHeader, GameVersionMultiSelect, CustomDropdown, formatDisplayName, CustomDatePicker, CustomComplianceDropdown, CustomClassificationDropdown, HubTabButton, HubTabDropdown, StatTile, standardAccentGlassButtonClass, standardSuccessButtonClass, standardDangerButtonClass, standardButtonClass, extractPostImage, stripMarkdown, EmptyState, DashboardStatTile } from "./shared";
import ProtocolVisualizer from "./ProtocolVisualizer";
import ModStructureBuilder from "./ModStructureBuilder";
import ArchitectSupportTickets from "./hub-components/ArchitectSupportTickets";
import StructureVisualizer from "./StructureVisualizer";
import ArchitectConflictMatrix from "./ArchitectConflictMatrix";
import { useLexicon } from "./LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { logArchitectAction } from "./lib/audit";
import { ModCard } from "./ModCard";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import CodeSnippetSidebar from "./side-panels/CodeSnippetSidebar";
import AssetPreviewSidebar from "./AssetPreviewSidebar";
import { ArtifactCard, VaultCard } from "./Cards";
import ArchitectTemplateOversight from "./hub-components/ArchitectTemplateOversight";
import { SharedMetadataEditorSidePanel } from './side-panels/SharedMetadataEditorSidePanel';
import { WayfinderPostsEditor } from "./hub-components/WayfinderPostsEditor";
import { ArchitectRegistry } from "./hub-components/SharedRegistry";
import { ArchitectCommandScreen } from "./hub-components/CommandScreens";
import { CollectionForge } from "./hub-components/SharedCollections";
import { ScoutQueue } from "./hub-components/ArchitectScoutQueue";
import { MasonQueue } from "./ArchitectMasonQueue";
import { HomesteadDiagnostics } from "./ArchitectHomesteadDiagnostics";
import { MasonRegistrationSidePanel, FileVerificationSidePanel } from './side-panels/ArchitectSidePanels';
import { NexusReportsViewer } from "./side-panels/NexusReportsViewer";
export default function ArchitectHub({ userRole, equipPlaySet, modList, onOpenDossier, onOpenMasonProfile, setStatus }: any) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState("command_center");
  const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);

  const [registrySearch, setRegistrySearch] = useState("");
  const [registryTargetMod, setRegistryTargetMod] = useState<any>(null);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [inspectMod, setInspectMod] = useState<any>(null);
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
  const [metadataEditorInitialId, setMetadataEditorInitialId] = useState<string | undefined>(undefined);

  const handleNavigate = (tab: string, search: string = "", targetMod: any = null) => {
    setActiveTab(tab);
    if (search) setRegistrySearch(search);
    if (targetMod) setRegistryTargetMod(targetMod);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-32 relative">
      <ViewHeader
        title={t("hub_title")}
        subtitle={t("hub_subtitle")}
        icon={t("icon_analytics")}
        iconColorClass="text-[var(--accent)] border-[var(--accent)]/30"
      >
        <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/10 shadow-inner">
          <button
            onClick={() => setIsVerifyPanelOpen(true)}
            className="h-12 px-6 rounded-none transition-all flex items-center justify-center gap-2 shrink-0 text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)] border border-transparent font-black"
          >
            <span className="material-symbols-outlined text-xl normal-case">{t("icon_verified_user")}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{t("wf_hub_verify")}</span>
          </button>
        </div>
      </ViewHeader>

      <div className="flex flex-col gap-1 w-full mb-4 shrink-0">
        <div className="flex items-center overflow-x-auto overflow-y-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 shrink-0">
          <HubTabButton id="command_center" icon={t("icon_desktop_windows")} label={t("wf_tab_command") || "COMMAND"?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="registry" icon={t("icon_inventory_2")} label={t("items") || "ARTIFACTS"?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="queue" icon={t("icon_search")} label={t("tab_queue") || "SCOUT"?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="lab" icon={t("icon_monitor_heart")} label={t("tab_diagnostics") || "DIAGNOSTICS"?.replace(/^[^\w]*/, '').trim()} activeTab={activeTab} setTab={setActiveTab} />



          <HubTabDropdown
            icon="hub"
            label="Network"
            activeTab={activeTab}
            setTab={setActiveTab}
            options={[
              { id: "collections", icon: t("icon_collections_bookmark"), label: t("tab_cc") || "COLLECTIONS"?.replace(/^[^\w]*/, '').trim() },
              { id: "protocols", icon: t("icon_link"), label: t("tab_protocols") || "PROTOCOLS"?.replace(/^[^\w]*/, '').trim() },
              { id: "structure", icon: t("icon_architecture"), label: t("tab_structure") || "STRUCTURE"?.replace(/^[^\w]*/, '').trim() },
              { id: "matrix", icon: t("icon_security"), label: t("tab_matrix") || "CONFLICTS"?.replace(/^[^\w]*/, '').trim() }
            ]}
          />

          <HubTabDropdown
            icon="visibility"
            label="Management"
            activeTab={activeTab}
            setTab={setActiveTab}
            options={[
              { id: "mason_queue", icon: t("icon_construction"), label: t("mason") || "MASON"?.replace(/^[^\w]*/, '').trim() },
              { id: "template_oversight", icon: t("icon_data_object") || "data_object", label: t("ql_templates") || "TEMPLATES" },
              { id: "nexus_reports", icon: t("icon_flag"), label: t("stat_bugs") || "REPORTS"?.replace(/^[^\w]*/, '').trim() },
              { id: "support_tickets", icon: t("icon_local_activity"), label: (t("wf_tab_tickets")).replace(/^[^\w]*/, '').trim() }
            ]}
          />
        </div>
      </div>

      <FileVerificationSidePanel
        isOpen={isVerifyPanelOpen}
        onClose={() => setIsVerifyPanelOpen(false)}
        onJumpToArtifact={(mod) => {
          setInspectMod(mod);
        }}
      />

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && <ArchitectCommandScreen setStatus={setStatus} onNavigate={handleNavigate} setViewingPost={setViewingPost} />}
        <ArchitectRegistry setStatus={setStatus} isActiveTab={activeTab === "registry"} initialSearch={registrySearch} onClearSearch={() => setRegistrySearch("")} initialActiveMod={registryTargetMod || inspectMod} onClearActiveMod={() => { setRegistryTargetMod(null); setInspectMod(null); }} modList={modList} />
        {activeTab === "protocols" && <ProtocolVisualizer isArchitect={true} />}
        {activeTab === "collections" && <CollectionForge setStatus={setStatus} />}
        {activeTab === "structure" && <StructureVisualizer isArchitect={true} />}
        {activeTab === "queue" && <ScoutQueue modList={modList || []} setStatus={setStatus} />}
        {activeTab === "mason_queue" && <MasonQueue modList={modList || []} setStatus={setStatus} />}
        {activeTab === "template_oversight" && <ArchitectTemplateOversight />}
        {activeTab === "nexus_reports" && <NexusReportsViewer onOpenDossier={onOpenDossier} />}
        {activeTab === "support_tickets" && <ArchitectSupportTickets setStatus={setStatus} onEditMetadata={(hash) => {
          setMetadataEditorInitialId(hash);
          setIsMetadataEditorOpen(true);
        }} />}
        {activeTab === "lab" && <HomesteadDiagnostics modList={modList || []} setStatus={setStatus} />}
        {activeTab === "matrix" && <ArchitectConflictMatrix modList={modList || []} />}
      </div>
      {viewingPost && <MasonPostViewer post={viewingPost} onClose={() => setViewingPost(null)} userId="architect" onOpenMasonProfile={onOpenMasonProfile} />}

      <SharedMetadataEditorSidePanel
        isOpen={isMetadataEditorOpen}
        onClose={() => setIsMetadataEditorOpen(false)}
        initialModId={metadataEditorInitialId}
      />
    </div>
  );
}



export function CustomStatusDropdown({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const options = [
    { id: 'stable', label: t("status_dd_stable") },
    { id: 'unstable', label: t("label_unstable") },
    { id: 'broken', label: t("status_broken") },
    { id: 'under_review', label: t("status_dd_review") },
    { id: 'pending', label: t("pending") },
    { id: 'unverified', label: t("unverified") },
  ];
  return <CustomDropdown disableTint={true} value={value} options={options} onChange={(v: string[]) => onChange(v[0])} placeholder={t("auto_select_status")} />;
}

function ProtocolSearchModal({ isOpen, onClose, onSelect, cloudMods, mode }: { isOpen: boolean, onClose: () => void, onSelect: (targetId: string) => void, cloudMods: any[], mode: string }) {
  const { t } = useLexicon();
  const [query, setQuery] = useState("");

  if (!isOpen) return null;

  const results = cloudMods.filter((m: any) =>
    (m.name || '').toLowerCase().includes((query || '').toLowerCase()) ||
    (m.master_author || '').toLowerCase().includes((query || '').toLowerCase())
  ).slice(0, 15);

  const getTitle = () => {
    switch (mode) {
      case 'dependency': return t("sel_dep");
      case 'addon': return t("sel_addon");
      case 'twin': return t("sel_twin");
      case 'rival': return t("sel_rival");
      case 'beta': return "Select Beta Protocol";
      default: return t("sel_artifact");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-[3px] animate-in fade-in">
      <div className="w-full max-w-lg bg-[var(--sidebar)] border border-white/10 rounded-[var(--radius)] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black uppercase tracking-widest theme-text-accent">
              {getTitle()}
            </h3>
            <button onClick={onClose} className="text-[var(--text)]/50 hover:text-[var(--text)] font-black">?</button>
          </div>
          <input
            autoFocus
            type="text"
            placeholder={t("ph_search_catalog")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full theme-glass-inner rounded-xl px-5 py-3 text-[var(--text)] text-sm focus:outline-none focus:theme-border-accent"
          />
        </div>

        <div className="p-4 flex flex-col gap-2 max-h-96 overflow-y-auto custom-scrollbar">
          {results.length > 0 ? results.map(mod => (
            <button
              key={mod.id}
              onClick={() => { onSelect(mod.id); }}
              className="flex justify-between items-center px-5 py-3 theme-glass-inner border border-white/5 hover:theme-border-accent hover:theme-panel-accent rounded-xl transition-all text-left group"
            >
              <div className="flex flex-col max-w-[80%]">
                <span className="text-xs font-black text-[var(--text)] uppercase truncate">{mod.name}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-bold text-[var(--subtext)] opacity-60 uppercase tracking-widest truncate">{mod.master_author || t("unknown_mason") || "Unknown Mason"}</span>
                  {(mod.original_filename || mod.mod_type) && (
                    <>
                      <span className="text-[var(--subtext)] opacity-40">•</span>
                      <span className="text-[9px] font-mono theme-text-accent tracking-tighter truncate max-w-[200px]" title={mod.original_filename || mod.mod_type}>{mod.original_filename || mod.mod_type}</span>
                    </>
                  )}
                  {(mod.latest_version || mod.version) && (
                    <>
                      <span className="text-[var(--subtext)] opacity-40">•</span>
                      <span className="text-[9px] font-bold text-[var(--text)] uppercase tracking-widest">{mod.latest_version || mod.version}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="theme-text-accent opacity-0 group-hover:opacity-100 transition-opacity font-black text-[10px] uppercase tracking-widest">{t("btn_link")}</span>
            </button>
          )) : (
            <div className="text-center p-8 text-[var(--subtext)] opacity-60 font-bold text-xs uppercase tracking-widest">{t("modal_no_matches")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DLCSearchDropdown({ onSelect, currentDLC = [] }: { onSelect: (pack: string) => void, currentDLC: string[] }) {
  const { t } = useLexicon();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const DLC_MASTER_LIST = [
    { code: "EP01", name: "Get to Work" }, { code: "EP02", name: "Get Together" }, { code: "EP03", name: "City Living" },
    { code: "EP04", name: "Cats & Dogs" }, { code: "EP05", name: "Seasons" }, { code: "EP06", name: "Get Famous" },
    { code: "EP07", name: "Island Living" }, { code: "EP08", name: "Discover University" }, { code: "EP09", name: "Eco Lifestyle" },
    { code: "EP10", name: "Snowy Escape" }, { code: "EP11", name: "Cottage Living" }, { code: "EP12", name: "High School Years" },
    { code: "EP13", name: "Growing Together" }, { code: "EP14", name: "Horse Ranch" }, { code: "EP15", name: "For Rent" },
    { code: "GP01", name: "Outdoor Retreat" }, { code: "GP02", name: "Spa Day" }, { code: "GP03", name: "Dine Out" },
    { code: "GP04", name: "Vampires" }, { code: "GP05", name: "Parenthood" }, { code: "GP06", name: "Jungle Adventure" },
    { code: "GP07", name: "StrangerVille" }, { code: "GP08", name: "Realm of Magic" }, { code: "GP09", name: "Star Wars" },
    { code: "GP10", name: "Dream Home Decorator" }, { code: "GP11", name: "My Wedding Stories" }, { code: "GP12", name: "Werewolves" },
  ];

  const filtered = DLC_MASTER_LIST.filter(d =>
    (d.code.toLowerCase().includes(query.toLowerCase()) || d.name.toLowerCase().includes(query.toLowerCase())) &&
    !currentDLC.includes(d.code)
  );

  return (
    <div className={`relative w-full ${isOpen ? 'z-[6000]' : ''}`}>
      <div className="flex gap-2">
        <div className={`relative flex-1 ${isOpen ? 'z-[6000]' : ''}`}>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            placeholder={t("registry_search_dlc")}
            className="w-full theme-glass-inner rounded-lg px-3 py-1.5 text-[var(--text)] text-sm uppercase font-bold focus:outline-none focus:theme-border-success"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1.5 text-[var(--text)]/20 hover:text-[var(--text)] text-[10px]"></button>
          )}
        </div>
      </div>
      {isOpen && query.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--sidebar)] backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2">
          {filtered.length > 0 ? filtered.map(d => (
            <button
              key={d.code}
              onClick={() => { onSelect(d.code); setQuery(""); setIsOpen(false); }}
              className="w-full text-left px-4 py-2 hover:theme-panel-success flex flex-col transition-colors group"
            >
              <span className="text-[10px] font-black theme-text-success uppercase">{d.code}</span>
              <span className="text-[9px] font-bold text-[var(--subtext)] opacity-80 group-hover:text-[var(--text)] uppercase">{d.name}</span>
            </button>
          )) : (
            <div className="p-4 text-center text-[9px] font-black text-gray-600 uppercase tracking-widest">{t("registry_no_dlc")}</div>
          )}
        </div>
      )}
    </div>
  );
}

interface UnifiedReport {
  id: string;
  source: "nexus" | "blueprint" | "comm-link";
  status: string;
  title: string;
  description: string;
  created_at: string;
  reporter_name: string;
  target_id: string;
  metadata?: any;
}

export function CustomMasonDropdown({ value, options, onChange }: { value: string, options: any[], onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const dropdownOptions = options.map(o => ({ id: o.id, label: o.name }));
  return <CustomDropdown disableTint={true} searchable={true} value={value} options={dropdownOptions} onChange={(v: string[]) => onChange(v[0])} placeholder={t("architect")} />;
}
