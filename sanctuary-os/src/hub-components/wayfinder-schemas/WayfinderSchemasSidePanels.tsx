import {
  SidePanel,
  SidePanelFilterBar,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  DashboardStatTile,
  VAULT_CHIP_CLASS,
} from "../../shared";
import { SidePanelTitleInput } from "../../components/layouts/ElevatedHubLayout";
import MasonEditorPanel from "../MasonEditorPanel";
import { CANONICAL_DIRECTIVES } from "../../utils/directivesSync";
import { InteractiveForkingGuideView } from "../../components/InteractiveForkingGuideView";
import MarkdownRenderer from "../../shared-components/MarkdownRenderer";
import { StructuredReleaseNotesView, LegalDocVersionInfoBlock } from "../../components/release-notes/ReleaseMarkdownViewer";
import { cleanPostBodyForViewer } from "../../components/release-notes/releaseMarkdownParser";
import TicketDossierSidePanel from "../../side-panels/TicketDossierSidePanel";
import WayfinderSupportSidePanel from "../../side-panels/WayfinderSupportSidePanel";
import { WayfinderDonationSetupSidePanel } from "../../side-panels/WayfinderSidePanels";

export function WayfinderSchemasSidePanels({
  t,
  td,
  pushStatus,
  canManageSpokeDonations,
  activeWorkspaceId,
  activeWs,
  activeSpokePanel,
  setActiveSpokePanel,
  uplinkUrl,
  setUplinkUrl,
  uplinkAnonKey,
  setUplinkAnonKey,
  uplinkServiceKey,
  setUplinkServiceKey,
  updatingKeys,
  credentialStatus,
  rotatingToken,
  severReason,
  setSeverReason,
  setSeverConfirmText,
  severConfirmText,
  setConfirmSever,
  confirmSever,
  isSevering,
  isSeverPhraseValid,
  forkTab,
  setForkTab,
  forkModeIdx,
  setForkModeIdx,
  sqlSchemaTab,
  setSqlSchemaTab,
  setForkViewMode,
  forkViewMode,
  setIsCovenantPanelOpen,
  isCovenantPanelOpen,
  setCovenantDocTab,
  covenantDocTab,
  setCovenantViewMode,
  covenantViewMode,
  stableVersion,
  selectedTicket,
  setSelectedTicket,
  isCreateSupportOpen,
  setIsCreateSupportOpen,
  syncedPartnersMd,
  syncedComplianceMd,
  syncedPartnersTitle,
  syncedComplianceTitle,
  syncedPartnersUpdatedAt,
  syncedComplianceUpdatedAt,
  syncedForkingSchema,
  cleanForkingReferenceMd,
  mason,
  showTimeline,
  setShowTimeline,
  problemsList,
  setProblemsList,
  activeVersionTimestamp,
  setActiveVersionTimestamp,
  editorRef,
  setEditorRef,
  isCreatePanelOpen,
  setIsCreatePanelOpen,
  createFileName,
  setCreateFileName,
  createFileExt,
  setCreateFileExt,
  showReference,
  setShowReference,
  referenceData,
  referenceLabel,
  splitRatio,
  isFullscreen,
  setIsFullscreen,
  openFiles,
  setOpenFiles,
  activeFileIndex,
  setActiveFileIndex,
  validateContent,
  closeFile,
  handleEditorChange,
  handleCreateSubmit,
  isResizing,
  isLight,
  handleEditorWillMount,
  loadDonationConfig,
  handleCopyUplinkBundle,
  handleCopySpokeSql,
  handleUpdateKeys,
  handleRotateGatewayToken,
  handleCutTheCord,
  saveFile,
  activeFile,
  isDirty,
  validationStats,
  addMissingStrings,
  purgeDeprecatedStrings,
  jumpToNextEmpty,
}: any) {
  return (
    <>
      <SidePanel
        isOpen={activeSpokePanel === "setup"}
        onClose={() => setActiveSpokePanel(null)}
        title={t("wf_card_spoke_setup_title", "Spoke Setup & Maintenance")}
        subtitle={activeWs?.name || activeWs?.schema_id || "SPOKE"}
        icon={t("icon_router", "router")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_content_copy", "content_copy")}
              tooltip={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              onClick={handleCopyUplinkBundle}
            />
            <PanelHeaderButton
              icon={t("icon_sync_lock", "sync_lock")}
              variant="accent"
              disabled={updatingKeys || !uplinkServiceKey.trim()}
              tooltip={t("wf_uplink_btn_update_keys", "Update Active Uplink Keys")}
              onClick={handleUpdateKeys}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_router", "router")}
            overline={t("wf_uplink_node_telemetry", "Spoke Node Telemetry")}
            title={t("wf_card_spoke_setup_title", "Spoke Setup & Maintenance")}
            description={t(
              "wf_card_spoke_setup_desc",
              "Inspect Spoke node telemetry, rotate Spoke Gateway Tokens and Anon keys, verify Hub handshake status, and copy a secret-free SANCTUARY-UPLINK:// bundle."
            )}
            badge={activeWs?.schema_id || activeWorkspaceId || "SPOKE"}
            badgeIcon={t("icon_check_circle", "check_circle")}
            variant="accent"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("wf_uplink_schema_label", "Active Schema ID")}
                value={activeWs?.schema_id || activeWorkspaceId || "--"}
                icon={t("icon_fingerprint", "fingerprint")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("wf_db_sync", "Database Uplink")}
                value={t("auto_synchronized", "SYNCHRONIZED")}
                icon={t("icon_cloud_done", "cloud_done")}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("wf_uplink_node_telemetry", "Spoke Node Telemetry")}
            icon={t("icon_dns", "dns")}
            headerActions={
              <ActionButton
                variant="glass"
                icon={t("icon_content_copy", "content_copy")}
                onClick={handleCopyUplinkBundle}
                className="!px-3 !py-1.5"
              >
                {t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              </ActionButton>
            }
          >
            <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-widest font-black text-[var(--subtext)] opacity-60">
                {t("wf_uplink_endpoint_label", "Spoke Endpoint")}
              </span>
              <span className="text-xs font-mono font-bold text-[var(--text)] break-all">
                {activeWs?.supabase_url || uplinkUrl || "--"}
              </span>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("wf_uplink_key_rotation_title", "Uplink Handshake & Key Rotation")}
            icon={t("icon_vpn_key", "vpn_key")}
          >
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs font-bold text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "wf_uplink_key_rotation_desc",
                  "Rotate your Spoke Gateway Token (spk_gw_*), update Supabase credentials, or copy a secret-free Uplink Bundle for Keepers Core."
                )}
              </p>
              <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_terminal", "terminal")}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider">
                    {t("spoke_workflow_guide_title", "How to Link or Mint a Spoke Gateway Token")}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
                  <p className="m-0">
                    {t(
                      "spoke_workflow_step_1",
                      "1. Run schema.sql in the Spoke's Supabase SQL Editor to initialize all 52 tables and gateway auth."
                    )}
                  </p>
                  <p className="m-0">
                    {t(
                      "spoke_workflow_step_2",
                      "2. Run SELECT public.mint_spoke_gateway_token(); in the Spoke's SQL Editor and copy the one-time spk_gw_... token:"
                    )}
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3 py-1.5 my-0.5">
                    <code className="text-[11px] font-mono font-bold text-[var(--accent)] break-all select-all">
                      {"SELECT public.mint_spoke_gateway_token();"}
                    </code>
                    <ActionButton
                      variant="glass"
                      icon={t("icon_content_copy", "content_copy")}
                      onClick={() => {
                        navigator.clipboard.writeText("SELECT public.mint_spoke_gateway_token();");
                        pushStatus(
                          t("spoke_mint_sql_copied", "Mint Gateway Token SQL copied to clipboard!"),
                          "success"
                        );
                      }}
                      className="!px-2.5 !py-1 shrink-0"
                    >
                      {t("spoke_btn_copy_mint_sql", "Copy SQL")}
                    </ActionButton>
                  </div>
                  <p className="m-0">
                    {t(
                      "spoke_workflow_step_3_wayfinder",
                      "3. Once linked, click Rotate Gateway Token above for 1-click zero-downtime rotation (no SQL needed). Only paste a manual spk_gw_... token below when linking for the first time, updating keys, or reconnecting after severing."
                    )}
                  </p>
                </div>
              </div>
              {credentialStatus && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    className={`${VAULT_CHIP_CLASS} ${
                      !credentialStatus.has_credential
                        ? "!text-[var(--danger)] !border-[var(--danger)]/30"
                        : credentialStatus.credential_kind !== "spoke_gateway"
                          ? "!text-[var(--warning)] !border-[var(--warning)]/30"
                          : "!text-[var(--success)] !border-[var(--success)]/30"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[12px]">
                      {credentialStatus.has_credential
                        ? t("icon_encrypted", "encrypted")
                        : t("icon_warning", "warning")}
                    </span>
                    <span>
                      {credentialStatus.has_credential
                        ? credentialStatus.credential_kind === "spoke_gateway"
                          ? t("spoke_cred_vault_sealed", "Envelope + Vault Sealed")
                          : t("spoke_cred_legacy_sealed", "Legacy Key Sealed")
                        : t("spoke_cred_missing", "No Uplink Token Sealed")}
                    </span>
                    {credentialStatus.key_fingerprint && (
                      <span className="font-mono opacity-80">
                        ({credentialStatus.key_fingerprint})
                      </span>
                    )}
                  </div>
                  {credentialStatus.has_credential && (
                    <ActionButton
                      variant="glass"
                      icon={
                        rotatingToken
                          ? t("icon_sync", "sync")
                          : t("icon_autorenew", "autorenew")
                      }
                      onClick={handleRotateGatewayToken}
                      disabled={rotatingToken}
                      className="!px-3 !py-1.5"
                    >
                      {rotatingToken
                        ? t("spoke_rotating_token", "Rotating Token...")
                        : t("spoke_btn_rotate_token", "Rotate Gateway Token")}
                    </ActionButton>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 ml-1">
                  {t("ui_supabase_url", "Supabase Project URL")}
                </label>
                <input
                  type="text"
                  value={uplinkUrl}
                  onChange={(e) => setUplinkUrl(e.target.value)}
                  placeholder={t("ui_supabase_url", "Supabase Project URL")}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 ml-1">
                  {t("ui_supabase_key", "Supabase Anon Key")}
                </label>
                <input
                  type="text"
                  value={uplinkAnonKey}
                  onChange={(e) => setUplinkAnonKey(e.target.value)}
                  placeholder={t("ui_supabase_key", "Supabase Anon Key")}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75 ml-1">
                  {t("spoke_gateway_token_label", "Spoke Gateway Token")}
                </label>
                <input
                  type="password"
                  value={uplinkServiceKey}
                  onChange={(e) => setUplinkServiceKey(e.target.value)}
                  placeholder={t(
                    "spoke_gateway_token_ph",
                    "spk_gw_... (scoped HMAC token, or leave blank to keep sealed credential)"
                  )}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <ActionButton
                variant="glass"
                icon={t("icon_sync_lock", "sync_lock")}
                onClick={handleUpdateKeys}
                disabled={updatingKeys || !uplinkServiceKey.trim()}
                className="w-full justify-center !py-3 mt-1"
              >
                {t("wf_uplink_btn_update_keys", "Update Active Uplink Keys")}
              </ActionButton>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("partner_covenants_title", "Partners Agreement & Compliance Protocol")}
            icon={t("icon_gavel", "gavel")}
          >
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "partner_covenants_desc",
                  "Inspect the binding Sanctuary OS Partners Agreement and Compliance Protocol governing Spoke sovereignty, 0% non-custodial donations, heuristic malware enforcement, and cryptographic {mod} integrity."
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCovenantDocTab("partners_agreement");
                    setIsCovenantPanelOpen(true);
                  }}
                  className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-left flex flex-col gap-2 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                        {t("icon_handshake", "handshake")}
                      </span>
                      {t("partner_agreement_title", "Partners Agreement")}
                    </span>
                    <span className="px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[9px] font-mono font-bold text-[var(--accent)] uppercase">
                      {`V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--subtext)] opacity-80 leading-relaxed">
                    {t(
                      "partner_agreement_desc",
                      "Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries."
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCovenantDocTab("compliance_protocol");
                    setIsCovenantPanelOpen(true);
                  }}
                  className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-left flex flex-col gap-2 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">
                        {t("icon_shield", "shield")}
                      </span>
                      {t("compliance_protocol_title", "Compliance Protocol")}
                    </span>
                    <span className="px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[9px] font-mono font-bold text-[var(--success)] uppercase">
                      {`V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--subtext)] opacity-80 leading-relaxed">
                    {t(
                      "compliance_protocol_desc",
                      "Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards."
                    )}
                  </span>
                </button>
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* Stacked SidePanel: Partners Agreement & Compliance Protocol Viewer */}
      <SidePanel
        isOpen={isCovenantPanelOpen}
        onClose={() => setIsCovenantPanelOpen(false)}
        backdropZ="z-[100050]"
        panelZ="z-[100051]"
        title={
          covenantDocTab === "partners_agreement"
            ? syncedPartnersTitle
              ? td(syncedPartnersTitle)
              : t("partner_agreement_title", "Partners Agreement")
            : syncedComplianceTitle
              ? td(syncedComplianceTitle)
              : t("compliance_protocol_title", "Compliance Protocol")
        }
        subtitle={t(
          "partner_covenants_subtitle",
          "Spoke Governance, Anti-Malware & Bilateral Sovereignty Covenants"
        )}
        icon={
          covenantDocTab === "partners_agreement"
            ? t("icon_handshake", "handshake")
            : t("icon_shield", "shield")
        }
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[92vw] md:w-[780px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_dashboard", "dashboard")}
              tooltip={t("tab_visual", "Visual")}
              onClick={() => setCovenantViewMode("ui")}
              variant={covenantViewMode === "ui" ? "accent" : "default"}
            />
            <PanelHeaderButton
              icon={t("icon_menu_book", "menu_book")}
              tooltip={t("btn_post", "Post")}
              onClick={() => setCovenantViewMode("normal")}
              variant={covenantViewMode === "normal" ? "accent" : "default"}
            />
            <PanelHeaderButton
              icon={t("icon_content_copy", "content_copy")}
              tooltip={t("btn_copy", "Copy")}
              onClick={() => {
                navigator.clipboard.writeText(
                  covenantDocTab === "partners_agreement"
                    ? syncedPartnersMd
                    : syncedComplianceMd
                );
                pushStatus(t("copied_to_clipboard", "Copied to clipboard"), "success");
              }}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
          <SidePanelFilterBar className="sm:grid-cols-2 gap-3">
            <DashboardStatTile
              variant="filter"
              icon={t("icon_handshake", "handshake")}
              label={`V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`}
              number={t("partner_agreement_title", "Partners Agreement")}
              active={covenantDocTab === "partners_agreement"}
              onClick={() => setCovenantDocTab("partners_agreement")}
            />
            <DashboardStatTile
              variant="filter"
              icon={t("icon_shield", "shield")}
              label={`V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`}
              number={t("compliance_protocol_title", "Compliance Protocol")}
              active={covenantDocTab === "compliance_protocol"}
              onClick={() => setCovenantDocTab("compliance_protocol")}
            />
          </SidePanelFilterBar>

          <SidePanelHeroCard
            icon={
              covenantDocTab === "partners_agreement"
                ? t("icon_handshake", "handshake")
                : t("icon_shield", "shield")
            }
            overline={
              covenantDocTab === "partners_agreement"
                ? `V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`
                : `V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`
            }
            title={
              covenantDocTab === "partners_agreement"
                ? syncedPartnersTitle
                  ? td(syncedPartnersTitle)
                  : t("partner_agreement_title", "Partners Agreement")
                : syncedComplianceTitle
                  ? td(syncedComplianceTitle)
                  : t("compliance_protocol_title", "Compliance Protocol")
            }
            description={
              covenantDocTab === "partners_agreement"
                ? t(
                    "partner_agreement_desc",
                    "Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries."
                  )
                : t(
                    "compliance_protocol_desc",
                    "Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards."
                  )
            }
            badge={
              covenantDocTab === "partners_agreement"
                ? `V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`
                : `V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`
            }
            variant="accent"
          >
            <LegalDocVersionInfoBlock
              content={
                covenantDocTab === "partners_agreement"
                  ? syncedPartnersMd
                  : syncedComplianceMd
              }
              updatedAt={
                covenantDocTab === "partners_agreement"
                  ? syncedPartnersUpdatedAt
                  : syncedComplianceUpdatedAt
              }
            />
          </SidePanelHeroCard>

          {covenantViewMode === "ui" ? (
            <StructuredReleaseNotesView
              content={
                covenantDocTab === "partners_agreement"
                  ? syncedPartnersMd
                  : syncedComplianceMd
              }
              hideIntro={true}
            />
          ) : (
            <UniversalGroup
              title={
                covenantDocTab === "partners_agreement"
                  ? syncedPartnersTitle
                    ? td(syncedPartnersTitle)
                    : t("partner_agreement_title", "Partners Agreement")
                  : syncedComplianceTitle
                    ? td(syncedComplianceTitle)
                    : t("compliance_protocol_title", "Compliance Protocol")
              }
              icon={t("icon_gavel", "gavel")}
            >
              <div className="text-sm text-[var(--subtext)] leading-relaxed font-medium">
                <MarkdownRenderer
                  content={cleanPostBodyForViewer(
                    covenantDocTab === "partners_agreement"
                      ? syncedPartnersMd
                      : syncedComplianceMd
                  )}
                />
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      {/* SidePanel 2: Spoke Sever (Cut the Cord) */}
      <SidePanel
        isOpen={activeSpokePanel === "sever"}
        onClose={() => {
          setConfirmSever(false);
          setSeverConfirmText("");
          setActiveSpokePanel(null);
        }}
        title={t("wf_card_spoke_sever_title", "Spoke Sever (Cut the Cord)")}
        subtitle={t("wf_badge_sovereign", "Bilateral Sovereignty")}
        icon={t("icon_link_off", "link_off")}
        iconColorClass="text-[var(--danger)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_content_copy", "content_copy")}
              tooltip={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              onClick={handleCopyUplinkBundle}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_link_off", "link_off")}
            overline={activeWs?.name || activeWs?.schema_id || "SPOKE"}
            title={t("wf_cut_cord_title", "Cut the Cord (Sever Sanctuary Uplink)")}
            description={t(
              "wf_cut_cord_desc",
              "Unilaterally sever this community's Spoke database from the Sanctuary OS Hub. This immediately deactivates the workspace on the global network, revokes all active Spoke Gateway Tokens, and purges its sealed Vault credential from Keepers Core while leaving 100% of the Spoke database intact."
            )}
            badge={activeWs?.schema_id || activeWorkspaceId || "SPOKE"}
            variant="danger"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("wf_sever_key_custody_lbl", "Gateway Token Custody")}
                value={t("wf_sever_key_custody_val", "Revoked & Purged on Sever")}
                icon={t("icon_security", "security")}
                iconColorClass="text-[var(--danger)]"
              />
              <StatBox
                label={t("wf_sever_data_ownership_lbl", "Spoke Database")}
                value={t("wf_badge_100_data", "100% Data Retained")}
                icon={t("icon_database", "database")}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          <UniversalGroup
            title={t("wf_sever_backup_title", "Pre-Severance Uplink Backup")}
            icon={t("icon_content_copy", "content_copy")}
          >
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                {t(
                  "wf_sever_backup_desc",
                  "Copy your secret-free SANCTUARY-UPLINK:// bundle (Project URL + Anon Key) before severing if you plan to paste your connection metadata into a standalone fork or reconnect later with a newly minted Gateway Token."
                )}
              </p>
              <ActionButton
                variant="glass"
                icon={t("icon_content_copy", "content_copy")}
                onClick={handleCopyUplinkBundle}
                className="w-full justify-center !py-3"
              >
                {t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              </ActionButton>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("wf_cut_cord_title", "Cut the Cord (Sever Sanctuary Uplink)")}
            icon={t("icon_link_off", "link_off")}
            headerColorClass="text-[var(--danger)]"
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[var(--danger)]">
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_warning", "warning")}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider">
                    {t(
                      "wf_sever_warning_title",
                      "Permanent Network Severance & Auth Architecture Warning"
                    )}
                  </span>
                </div>
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t(
                    "wf_sever_warning_desc",
                    "Cutting the cord immediately deactivates the Spoke on the Sanctuary OS Hub, revokes all active Spoke Gateway Tokens, and permanently purges its sealed Vault credential from Keepers Core. 100% of the Spoke database tables remain intact in the community's own Supabase project."
                  )}
                </p>
              </div>

              <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_passkey", "passkey")}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider">
                    {t(
                      "wf_sever_identity_arch_title",
                      "How Accounts Work After Severing (Hub Auth vs. Spoke Profiles)"
                    )}
                  </span>
                </div>
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                  {t(
                    "wf_sever_identity_arch_desc",
                    "In federated mode, login credentials (auth.users) live in the Core Hub database while your Spoke stores public.profiles and zero-PII SHA-256 relink commitments. If you transition your severed Spoke into a Standalone Fork pointed solely at your Spoke Supabase URL, {Citizens} and {Masons} register a local login on your Spoke Auth and supply their Spoke Relink Token (SRK1.<uuid>.<secret>) at sign-up or in {Settings} -> System ID to cryptographically reclaim their Spoke profile, {Mason} studio, and {Blueprints} without username hijacking. The first local signup automatically promotes to Founding Wayfinder."
                  )}
                </p>
              </div>

              <input
                type="text"
                value={severReason}
                onChange={(e) => setSeverReason(e.target.value)}
                placeholder={t(
                  "wf_cut_cord_reason_ph",
                  "Optional reason for severing the uplink (logged to Audit Trail)..."
                )}
                className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--danger)]"
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--danger)] ml-1">
                  {t(
                    "wf_sever_type_confirm_label",
                    'Type "CUT THE CORD" to unlock severance'
                  )}
                </label>
                <input
                  type="text"
                  value={severConfirmText}
                  onChange={(e) => {
                    setSeverConfirmText(e.target.value);
                    setConfirmSever(false);
                  }}
                  placeholder={t("wf_sever_type_confirm_ph", "CUT THE CORD")}
                  className="w-full glass-surface rounded-xl px-4 py-3 text-xs font-mono font-black uppercase tracking-wider text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--danger)]"
                />
              </div>

              <ActionButton
                variant="danger"
                icon={t("icon_link_off", "link_off")}
                onClick={handleCutTheCord}
                disabled={isSevering || !isSeverPhraseValid}
                className={`w-full justify-center !py-3.5 ${confirmSever ? "animate-pulse" : ""}`}
              >
                {!isSeverPhraseValid
                  ? t(
                      "wf_sever_btn_locked",
                      'Type "CUT THE CORD" Above to Unlock'
                    )
                  : confirmSever
                    ? t(
                        "wf_cut_cord_confirm_btn",
                        "Confirm: Click Again to Permanently Sever Uplink"
                      )
                    : t("wf_cut_cord_btn", "Cut the Cord (Double-Click to Sever)")}
              </ActionButton>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* SidePanel 3: Forking Help & Walkthrough */}
      <SidePanel
        isOpen={activeSpokePanel === "forking"}
        onClose={() => setActiveSpokePanel(null)}
        title={t("wf_tab_forking_help", "Forking Help & Walkthrough")}
        subtitle={td(syncedForkingSchema.title)}
        icon={t("icon_menu_book", "menu_book")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[820px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_dashboard", "dashboard")}
              tooltip={t("tab_visual", "Visual")}
              onClick={() => setForkViewMode("ui")}
              variant={forkViewMode === "ui" ? "accent" : "default"}
            />
            <PanelHeaderButton
              icon={t("icon_menu_book", "menu_book")}
              tooltip={t("btn_post", "Post")}
              onClick={() => setForkViewMode("normal")}
              variant={forkViewMode === "normal" ? "accent" : "default"}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-5 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_menu_book", "menu_book")}
            overline={t("wf_tab_forking_help", "Forking Help & Walkthrough")}
            title={td(syncedForkingSchema.title)}
            description={td(syncedForkingSchema.summary)}
            badge={CANONICAL_DIRECTIVES.forking_guide.category}
            variant="accent"
          >
            <div className="flex flex-wrap items-center justify-end gap-2 ml-auto pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full">
              <ActionButton
                variant="glass"
                icon={t("icon_database", "database")}
                onClick={handleCopySpokeSql}
              >
                {t("wf_btn_copy_spoke_sql", "Copy schema.sql")}
              </ActionButton>
              <ActionButton
                variant="glass"
                icon={t("icon_content_copy", "content_copy")}
                onClick={handleCopyUplinkBundle}
              >
                {t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
              </ActionButton>
            </div>
          </SidePanelHeroCard>

          {forkViewMode === "ui" ? (
            <InteractiveForkingGuideView
              schema={syncedForkingSchema}
              forkTab={forkTab}
              setForkTab={setForkTab}
              forkModeIdx={forkModeIdx}
              setForkModeIdx={setForkModeIdx}
              sqlSchemaTab={sqlSchemaTab}
              setSqlSchemaTab={setSqlSchemaTab}
              onInspectCovenants={() => {
                setCovenantDocTab("partners_agreement");
                setIsCovenantPanelOpen(true);
              }}
            />
          ) : (
            <UniversalGroup
              title={td(syncedForkingSchema.title)}
              icon={t("icon_menu_book", "menu_book")}
            >
              <StructuredReleaseNotesView content={cleanForkingReferenceMd} />
            </UniversalGroup>
          )}
        </div>
      </SidePanel>

      {/* SidePanel 4: Partner Community Donations (Reworked with Cost & Spending Report + Processor & Checkout Sub-Tabs) */}
      {canManageSpokeDonations && (
        <WayfinderDonationSetupSidePanel
          isOpen={activeSpokePanel === "donations"}
          onClose={() => {
            setActiveSpokePanel(null);
            loadDonationConfig();
          }}
        />
      )}

      {/* Keepers Support SidePanels (Always mounted so Overview ticket clicks also open Dossier) */}
      <TicketDossierSidePanel
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        ticket={selectedTicket}
        isReadOnly={false}
        canReply={true}
        availableActions={[]}
        onReplyAdded={(newMetadata) => {
          setSelectedTicket({ ...selectedTicket, metadata: newMetadata });
        }}
      />
      <WayfinderSupportSidePanel
        isOpen={isCreateSupportOpen}
        onClose={() => setIsCreateSupportOpen(false)}
      />

      {/* Master Schema Editor Panel */}
      <MasonEditorPanel
        t={t}
        isCloudMode={true}
        isKeepers={false}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        showReference={showReference}
        setShowReference={setShowReference}
        showTimeline={showTimeline}
        setShowTimeline={setShowTimeline}
        activeFile={activeFile}
        activeFileIndex={activeFileIndex}
        setActiveFileIndex={setActiveFileIndex}
        problemsList={problemsList}
        setProblemsList={setProblemsList}
        validationStats={validationStats}
        isDirty={isDirty}
        saveFile={saveFile}
        openFiles={openFiles}
        closeFile={closeFile}
        discardChanges={mason.discardChanges}
        splitRatio={splitRatio}
        isLight={isLight}
        addMissingStrings={addMissingStrings}
        purgeDeprecatedStrings={purgeDeprecatedStrings}
        jumpToNextEmpty={jumpToNextEmpty}
        handleEditorWillMount={handleEditorWillMount}
        handleEditorChange={handleEditorChange}
        setEditorRef={setEditorRef}
        validateContent={validateContent}
        referenceLabel={referenceLabel}
        referenceData={referenceData}
        isResizing={isResizing}
        editorRef={editorRef}
        activeVersionTimestamp={activeVersionTimestamp}
        setActiveVersionTimestamp={setActiveVersionTimestamp}
        setOpenFiles={setOpenFiles}
        pushStatus={pushStatus}
      />

      {/* Create Cloud Schema SidePanel */}
      <SidePanel
        isOpen={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        title={t("auto_create_file", "Create File")}
        subtitle={t("auto_create_file_sub", "Create a new file")}
        icon={t("icon_add", "add")}
        iconColorClass="text-[var(--accent)]"
        widthClass="w-[90vw] md:w-[680px]"
        headerActions={
          <PanelHeaderGroup>
            <PanelHeaderButton
              icon={t("icon_add", "add")}
              variant="accent"
              onClick={handleCreateSubmit}
              disabled={!createFileName.trim() || !createFileExt.trim()}
              tooltip={t("auto_create", "Create")}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_data_object", "data_object")}
            overline={t("creating_master_schema", "CREATING MASTER SCHEMA")}
            title={t("auto_create_file", "Create File")}
            description={t(
              "auto_create_file_sub",
              "Initialize a new configuration, template, or lexicon pack inside Architect Studio."
            )}
            badge={createFileExt || ".json"}
            variant="accent"
          />

          <SidePanelTitleInput
            label={t("author_filename", "File Name")}
            value={createFileName}
            onChange={setCreateFileName}
            placeholder={t("author_filename", "File Name")}
          />

          <UniversalGroup
            title={t("auto_create_file", "File Parameters")}
            icon={t("icon_code", "code")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                  {t("author_filename", "File Name")}
                </label>
                <input
                  type="text"
                  value={createFileName}
                  onChange={(e) => setCreateFileName(e.target.value)}
                  placeholder={t("ph_schema_id", "e.g. custom_engine")}
                  className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubmit();
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest ml-1">
                  {t("auto_extension", "Extension")}
                </label>
                <input
                  type="text"
                  value={createFileExt}
                  onChange={(e) => setCreateFileExt(e.target.value)}
                  placeholder=".json"
                  className="glass-surface rounded-xl px-4 py-3 text-[var(--text)] text-sm font-bold focus:outline-none focus:theme-border-accent w-full font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubmit();
                  }}
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      </SidePanel>
    </>
  );
}
