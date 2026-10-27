import { useState, useEffect } from "react";
import { ViewHeader, CustomDropdown, HoverTabDrawer, VerticalTabButton, ActionButton } from "./shared";
import ArchitectSupportTickets from "./hub-components/ArchitectSupportTickets";
import { useLexicon } from "./LexiconContext";
import MasonPostViewer from "./side-panels/MasonPostViewer";
import ArchitectTemplateOversight from "./hub-components/ArchitectTemplateOversight";
import { SharedMetadataEditorSidePanel } from "./side-panels/SharedMetadataEditorSidePanel";
import { ArchitectRegistry } from "./hub-components/SharedRegistry";
import { ArchitectCommandScreen } from "./hub-components/CommandScreens";
import { CollectionForge } from "./hub-components/SharedCollections";
import { ScoutQueue } from "./hub-components/ArchitectScoutQueue";
import { MasonQueue } from "./ArchitectMasonQueue";
import { HomesteadDiagnostics } from "./ArchitectHomesteadDiagnostics";
import { FileVerificationSidePanel } from "./side-panels/ArchitectSidePanels";
import { NexusReportsViewer } from "./side-panels/NexusReportsViewer";
import { useStore } from "./store";

export default function ArchitectHub({ userRole, equipPlaySet, modList, onOpenDossier, onOpenMasonProfile, setStatus }: any) {
  const { t } = useLexicon();
  const activeTab = useStore((state) => state.architectActiveTab);
  const setActiveTab = useStore((state) => state.setArchitectActiveTab);
  const [isVerifyPanelOpen, setIsVerifyPanelOpen] = useState(false);

  const [registrySearch, setRegistrySearch] = useState("");
  const [registryTargetMod, setRegistryTargetMod] = useState<any>(null);
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [inspectMod, setInspectMod] = useState<any>(null);
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
  const [metadataEditorInitialId, setMetadataEditorInitialId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (activeTab === "protocols" || activeTab === "structure" || activeTab === "matrix") {
      setActiveTab("registry");
    }
  }, [activeTab, setActiveTab]);

  const handleNavigate = (tab: string, search: string = "", targetMod: any = null) => {
    const resolvedTab = tab === "protocols" || tab === "structure" || tab === "matrix" ? "registry" : tab;
    setActiveTab(resolvedTab);
    if (search) setRegistrySearch(search);
    if (targetMod) setRegistryTargetMod(targetMod);
  };

  return (
    <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full pb-48 relative">
      <ViewHeader
        title={t("hub_title", "Moderator Console") || "Architect Hub"}
        subtitle={t("hub_subtitle", "Registry review, metadata governance, and conflict triage") || "Catalog & Metadata Architecture"}
        icon={t("icon_analytics", "analytics") || "analytics"}
        iconColorClass="text-[var(--accent)]"
        breadcrumb={
          activeTab !== "command_center"
            ? activeTab
                .split("_")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" ")
            : undefined
        }
        onTitleClick={() => setActiveTab("command_center")}
        hubActions={[
          {
            id: "hub_verify_hash",
            icon: t("icon_verified_user", "verified_user") || "verified_user",
            label: t("wf_hub_verify", "Verify Hash") || "Check Hash",
            onClick: () => setIsVerifyPanelOpen(true),
          },
        ]}
      />

      <div className="md:hidden">
        <HoverTabDrawer
          title={t("hub_title", "Moderator Console") || "Architect Navigation"}
          activeTab={activeTab}
          setTab={setActiveTab}
          hideMobilePills={true}
          footer={
            <ActionButton
              icon={t("icon_verified_user", "verified_user")}
              label={t("wf_hub_verify", "Verify Hash")}
              variant="glass"
              className="w-full"
              onClick={() => setIsVerifyPanelOpen(true)}
            />
          }
        >
          <VerticalTabButton
            id="command_center"
            icon={t("icon_desktop_windows", "desktop_windows")}
            label={t("wf_tab_command", "Command")?.replace(/^[^\w]*/, "").trim()}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="registry"
            icon={t("icon_inventory_2", "inventory_2")}
            label={t("term_mods", "Mods")?.replace(/^[^\w]*/, "").trim()}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="queue"
            icon={t("icon_search", "search")}
            label={t("tab_queue", "Scanner")?.replace(/^[^\w]*/, "").trim()}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="lab"
            icon={t("icon_monitor_heart", "monitor_heart")}
            label={t("tab_diagnostics", "Diagnostics")?.replace(/^[^\w]*/, "").trim()}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="collections"
            icon={t("icon_collections_bookmark", "collections_bookmark")}
            label={t("tab_cc", "Collections")?.replace(/^[^\w]*/, "").trim()}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="mason_queue"
            icon={t("icon_construction", "construction")}
            label={t("mason", "{Mason}")?.replace(/^[^\w]*/, "").trim()}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="template_oversight"
            icon={t("icon_data_object", "data_object")}
            label={t("ql_templates", "Templates")}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="nexus_reports"
            icon={t("icon_flag", "flag")}
            label={t("stat_bugs", "Reports")?.replace(/^[^\w]*/, "").trim()}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
          <VerticalTabButton
            id="support_tickets"
            icon={t("icon_local_activity", "local_activity")}
            label={t("wf_tab_tickets", "Support").replace(/^[^\w]*/, "").trim()}
            activeTab={activeTab}
            setTab={setActiveTab}
          />
        </HoverTabDrawer>
      </div>

      <FileVerificationSidePanel
        isOpen={isVerifyPanelOpen}
        onClose={() => setIsVerifyPanelOpen(false)}
        onJumpToArtifact={(mod) => {
          setInspectMod(mod);
          setActiveTab("registry");
        }}
      />

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "command_center" && (
          <ArchitectCommandScreen setStatus={setStatus} onNavigate={handleNavigate} setViewingPost={setViewingPost} />
        )}
        <ArchitectRegistry
          setStatus={setStatus}
          isActiveTab={activeTab === "registry"}
          initialSearch={registrySearch}
          onClearSearch={() => setRegistrySearch("")}
          initialActiveMod={registryTargetMod || inspectMod}
          onClearActiveMod={() => {
            setRegistryTargetMod(null);
            setInspectMod(null);
          }}
          modList={modList}
        />
        {activeTab === "collections" && <CollectionForge setStatus={setStatus} />}
        {activeTab === "queue" && <ScoutQueue modList={modList || []} setStatus={setStatus} />}
        {activeTab === "mason_queue" && <MasonQueue modList={modList || []} setStatus={setStatus} />}
        {activeTab === "template_oversight" && <ArchitectTemplateOversight />}
        {activeTab === "nexus_reports" && <NexusReportsViewer onOpenDossier={onOpenDossier} />}
        {activeTab === "support_tickets" && (
          <ArchitectSupportTickets
            setStatus={setStatus}
            onEditMetadata={(hash) => {
              setMetadataEditorInitialId(hash);
              setIsMetadataEditorOpen(true);
            }}
          />
        )}
        {activeTab === "lab" && <HomesteadDiagnostics modList={modList || []} setStatus={setStatus} />}
      </div>
      {viewingPost && (
        <MasonPostViewer
          post={viewingPost}
          onClose={() => setViewingPost(null)}
          userId="architect"
          onOpenMasonProfile={onOpenMasonProfile}
        />
      )}

      <SharedMetadataEditorSidePanel
        isOpen={isMetadataEditorOpen}
        onClose={() => setIsMetadataEditorOpen(false)}
        initialModId={metadataEditorInitialId}
      />
    </div>
  );
}

export function CustomStatusDropdown({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const { t } = useLexicon();
  const options = [
    { id: "stable", label: t("status_stable", "STABLE") || "Stable" },
    { id: "unstable", label: t("label_unstable", "Unstable") || "Unstable" },
    { id: "corrupted", label: t("status_corrupted", "Corrupted") || "Corrupted" },
    { id: "under_review", label: t("status_dd_review", "Under Review") || "Under Review" },
    { id: "pending", label: t("pending", "Pending") || "Pending" },
    { id: "unknown", label: t("unknown", "Unknown") || "Unknown" },
  ];
  return (
    <CustomDropdown
      disableTint={true}
      value={value}
      options={options}
      onChange={(v: string[]) => onChange(v[0])}
      placeholder={t("auto_select_status", "Select Status")}
    />
  );
}

export function CustomMasonDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: any[];
  onChange: (val: string) => void;
}) {
  const { t } = useLexicon();
  const dropdownOptions = options.map((o) => ({ id: o.id, label: o.name }));
  return (
    <CustomDropdown
      disableTint={true}
      searchable={true}
      value={value}
      options={dropdownOptions}
      onChange={(v: string[]) => onChange(v[0])}
      placeholder={t("mason", "{Mason}")}
    />
  );
}
