import { supabaseAuth } from "../../supabase";
import {
  SidePanel,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
} from "../../shared";
import {
  UniversalGroup,
  UniversalInput,
  SidePanelHeroCard,
  StatBox,
} from "../../components/universal/UniversalLayout";
import { SidePanelTitleInput, SidePanelPillToggle } from "../../components/layouts/ElevatedHubLayout";
import TicketDossierSidePanel from "../../side-panels/TicketDossierSidePanel";

export function ActiveGamesSidePanels({
  MINT_SPOKE_TOKEN_SQL,
  t,
  pushStatus,
  games,
  selectedPartnerApp,
  setSelectedPartnerApp,
  sidePanelMode,
  setSidePanelMode,
  severTargetGame,
  setSeverTargetGame,
  setSeverReason,
  severReason,
  setSeverConfirmText,
  severConfirmText,
  setConfirmSever,
  confirmSever,
  isSevering,
  severArmTimerRef,
  formData,
  setFormData,
  bundleInput,
  verifyingHandshake,
  rotatingToken,
  handshakeStatus,
  isCreatePanelOpen,
  setIsCreatePanelOpen,
  createFileName,
  setCreateFileName,
  createFileExt,
  setCreateFileExt,
  handleCreateSubmit,
  fetchGames,
  handleParseBundle,
  handleCopyUplinkBundle,
  handleVerifyHandshake,
  handleSaveGame,
  handleRotateGatewayToken,
  isSeverPhraseValid,
  handleExecuteSeverCord,
}: any) {
  return (
    <>
      <SidePanel
        isOpen={sidePanelMode !== null}
        onClose={() => setSidePanelMode(null)}
        title={
          sidePanelMode === "edit"
            ? t("edit_db_node", "Edit Database Node")
            : t("ui_register_game_db", "Register Game Database")
        }
        subtitle={
          sidePanelMode === "edit"
            ? t("update_config", "Update Configuration")
            : t("ui_add_network_node", "Add Network Node")
        }
        icon={t("icon_dns", "dns")}
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
              icon={t("icon_network_check", "network_check")}
              tooltip={t("spoke_btn_verify_handshake", "Test Handshake & Verify Schema")}
              onClick={handleVerifyHandshake}
            />
            <PanelHeaderButton
              icon={t("icon_save", "save")}
              variant="accent"
              tooltip={t("btn_save", "Save")}
              onClick={handleSaveGame}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_dns", "dns")}
            overline={t("ui_active_games", "Game Databases")}
            title={
              formData.name ||
              (sidePanelMode === "edit"
                ? t("edit_db_node", "Edit Database Node")
                : t("ui_register_game_db", "Register Game Database"))
            }
            description={t(
              "ui_active_games_subtitle",
              "Manage Sanctuary game databases and FDW connections."
            )}
            badge={
              formData.is_active !== false
                ? t("filter_active", "Active")
                : t("filter_inactive", "Inactive")
            }
            badgeIcon={
              formData.is_active !== false
                ? t("icon_toggle_on", "toggle_on")
                : t("icon_toggle_off", "toggle_off")
            }
            variant={formData.is_active !== false ? "success" : "warning"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <StatBox
                label={t("ui_schema_id", "Schema ID")}
                value={formData.schema_id || t("oversight_na", "N/A")}
                icon={t("icon_fingerprint", "fingerprint")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("tab_network", "Network")}
                value={
                  formData.is_keepers_only
                    ? t("lex_studio_keepers_only_short", "Keepers Only")
                    : t("release_notes_meta_channel_public", "Public")
                }
                icon={
                  formData.is_keepers_only
                    ? t("icon_visibility_off", "visibility_off")
                    : t("icon_visibility", "visibility")
                }
                iconColorClass={
                  formData.is_keepers_only ? "text-[var(--warning)]" : "text-[var(--success)]"
                }
              />
            </div>
          </SidePanelHeroCard>

          {handshakeStatus && (
            <div
              className="glass-panel rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`material-symbols-outlined !text-[20px] ${
                    handshakeStatus.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                  }`}
                >
                  {handshakeStatus.ok
                    ? t("icon_verified", "verified")
                    : t("icon_error", "error")}
                </span>
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-xs font-black tracking-wide ${
                      handshakeStatus.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                    }`}
                  >
                    {handshakeStatus.message}
                  </span>
                  {handshakeStatus.wayfinder && (
                    <span className="text-[10px] font-bold text-[var(--subtext)]">
                      {t("spoke_wayfinder_provisioned", "Wayfinder role provisioned for: ")}
                      {handshakeStatus.wayfinder}
                    </span>
                  )}
                </div>
              </div>
              {handshakeStatus.latency !== undefined && (
                <span className="text-[10px] font-mono font-black text-[var(--subtext)] shrink-0">
                  {handshakeStatus.latency} {t("icon_ms", "ms")}
                </span>
              )}
            </div>
          )}

          <SidePanelTitleInput
            value={formData.name}
            onChange={(val) => setFormData({ ...formData, name: val })}
            label={t("ui_game_name", "Game Workspace Name")}
            placeholder={t("ph_game_name", "e.g. My Community Game")}
            subtitle={
              formData.schema_id
                ? `${t("ui_schema_id", "SCHEMA")}: ${formData.schema_id}`
                : undefined
            }
          />

          <UniversalGroup
            title={t("spoke_quick_bundle_label", "Quick-Paste Uplink Bundle / Credentials")}
            icon={t("icon_bolt", "bolt")}
          >
            <UniversalInput
              type="text"
              value={bundleInput}
              onChange={handleParseBundle}
              placeholder={t(
                "spoke_quick_bundle_ph",
                "Paste a SANCTUARY-UPLINK:// token, JSON bundle, or raw Supabase URL & keys..."
              )}
            />
            <SidePanelPillToggle
              checked={formData.is_active !== false}
              onChange={(checked) => setFormData({ ...formData, is_active: checked })}
              label={t("filter_active", "Active Schema Engine")}
              icon={t("icon_dns", "dns")}
              variant="success"
            />
            <SidePanelPillToggle
              checked={Boolean(formData.is_keepers_only)}
              onChange={(checked) => setFormData({ ...formData, is_keepers_only: checked })}
              label={t("spoke_keepers_only_toggle", "Keepers-Only Spoke (Dev / Test Server)")}
              icon={t("icon_visibility_off", "visibility_off")}
              variant="warning"
            />
            <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed px-1 m-0">
              {t(
                "spoke_keepers_only_desc",
                "Hide this Spoke from all {Citizens}, {Masons}, and Wayfinders. Only Keepers Core accounts can see or connect to this workspace."
              )}
            </p>
          </UniversalGroup>

          <UniversalGroup
            title={t("ui_supabase_url", "Spoke Database & Handshake Credentials")}
            icon={t("icon_dns", "dns")}
          >
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
                    {MINT_SPOKE_TOKEN_SQL}
                  </code>
                  <ActionButton
                    variant="glass"
                    icon={t("icon_content_copy", "content_copy")}
                    label={t("spoke_btn_copy_mint_sql", "Copy SQL")}
                    className="!px-2.5 !py-1 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(MINT_SPOKE_TOKEN_SQL);
                      pushStatus(
                        t("spoke_mint_sql_copied", "Mint Gateway Token SQL copied to clipboard!"),
                        "success"
                      );
                    }}
                  />
                </div>
                <p className="m-0">
                  {t(
                    "spoke_workflow_step_3_keeper",
                    "3. Paste the Spoke URL, Anon Key (or secret-free SANCTUARY-UPLINK:// bundle), and spk_gw_... token below, then test handshake. Leave the token blank when editing to keep the sealed credential, or click Rotate Gateway Token anytime."
                  )}
                </p>
              </div>
            </div>
            <UniversalInput
              label={t("ui_schema_id", "Schema ID")}
              type="text"
              value={formData.schema_id}
              onChange={(val) => setFormData({ ...formData, schema_id: val })}
              placeholder={t("ph_schema_id", "e.g. custom_engine")}
            />
            <UniversalInput
              label={t("ui_supabase_url", "Supabase Project URL")}
              type="text"
              value={formData.supabase_url}
              onChange={(val) => setFormData({ ...formData, supabase_url: val })}
              placeholder={t("ui_supabase_url", "https://xyz.supabase.co")}
            />
            <UniversalInput
              label={t("ui_supabase_key", "Supabase Anon Key")}
              type="text"
              value={formData.supabase_anon_key}
              onChange={(val) => setFormData({ ...formData, supabase_anon_key: val })}
              placeholder={t("ui_supabase_key", "ey...")}
            />
            <UniversalInput
              label={t("spoke_gateway_token_label", "Spoke Gateway Token")}
              type="password"
              value={formData.spoke_gateway_token || ""}
              onChange={(val) => setFormData({ ...formData, spoke_gateway_token: val })}
              placeholder={t(
                "spoke_gateway_token_ph",
                "spk_gw_... (scoped HMAC token, or leave blank to keep sealed credential)"
              )}
            />
            {sidePanelMode === "edit" && formData.id && (() => {
              const editingGameRec = games.find((g: any) => g.id === formData.id);
              const hasCred = Boolean(editingGameRec?.has_credential);
              const isLegacy = hasCred && editingGameRec?.credential_kind !== "spoke_gateway";
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div
                    className={`${VAULT_CHIP_CLASS} ${
                      !hasCred
                        ? "!text-[var(--danger)] !border-[var(--danger)]/30"
                        : isLegacy
                          ? "!text-[var(--warning)] !border-[var(--warning)]/30"
                          : "!text-[var(--success)] !border-[var(--success)]/30"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[12px]">
                      {hasCred
                        ? t("icon_encrypted", "encrypted")
                        : t("icon_warning", "warning")}
                    </span>
                    <span>
                      {hasCred
                        ? isLegacy
                          ? t("spoke_cred_legacy_sealed", "Legacy Key Sealed")
                          : t("spoke_cred_vault_sealed", "Envelope + Vault Sealed")
                        : t("spoke_cred_missing", "No Uplink Token Sealed")}
                    </span>
                    {editingGameRec?.key_fingerprint && (
                      <span className="font-mono opacity-80">
                        ({editingGameRec.key_fingerprint})
                      </span>
                    )}
                  </div>
                  {hasCred && (
                    <ActionButton
                      variant="glass"
                      icon={
                        rotatingToken
                          ? t("icon_sync", "sync")
                          : t("icon_autorenew", "autorenew")
                      }
                      label={
                        rotatingToken
                          ? t("spoke_rotating_token", "Rotating Token...")
                          : t("spoke_btn_rotate_token", "Rotate Gateway Token")
                      }
                      disabled={rotatingToken}
                      onClick={() => handleRotateGatewayToken(formData.id)}
                    />
                  )}
                </div>
              );
            })()}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <ActionButton
                variant="glass"
                icon={t("icon_content_copy", "content_copy")}
                label={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")}
                onClick={() => handleCopyUplinkBundle()}
              />
              <ActionButton
                variant="glass"
                icon={
                  verifyingHandshake
                    ? t("icon_sync", "sync")
                    : t("icon_network_check", "network_check")
                }
                label={
                  verifyingHandshake
                    ? t("spoke_verifying_handshake", "Testing Spoke Handshake...")
                    : t("spoke_btn_verify_handshake", "Test Handshake & Verify Schema")
                }
                disabled={verifyingHandshake}
                onClick={handleVerifyHandshake}
              />
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("spoke_founder_label", "Founding Community Manager (Username or UUID)")}
            icon={t("icon_manage_accounts", "manage_accounts")}
          >
            <UniversalInput
              label={t("spoke_founder_label", "Founding Community Manager (Username or UUID)")}
              type="text"
              value={formData.founder_identifier}
              onChange={(val) => setFormData({ ...formData, founder_identifier: val })}
              placeholder={t(
                "spoke_founder_ph",
                "Optional: Hub username or UUID to auto-promote to Wayfinder"
              )}
            />
          </UniversalGroup>
        </div>
      </SidePanel>

      {/* High-Friction Spoke Sever (Cut the Cord) SidePanel */}
      <SidePanel
        isOpen={Boolean(severTargetGame)}
        onClose={() => {
          if (severArmTimerRef.current) clearTimeout(severArmTimerRef.current);
          setConfirmSever(false);
          setSeverConfirmText("");
          setSeverReason("");
          setSeverTargetGame(null);
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
              onClick={() => handleCopyUplinkBundle(severTargetGame)}
            />
          </PanelHeaderGroup>
        }
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_link_off", "link_off")}
            overline={severTargetGame?.name || severTargetGame?.schema_id || "SPOKE"}
            title={t("wf_cut_cord_title", "Cut the Cord (Sever Sanctuary Uplink)")}
            description={t(
              "wf_cut_cord_desc",
              "Unilaterally sever this community's Spoke database from the Sanctuary OS Hub. This immediately deactivates the workspace on the global network, revokes all active Spoke Gateway Tokens, and purges its sealed Vault credential from Keepers Core while leaving 100% of the Spoke database intact."
            )}
            badge={severTargetGame?.schema_id || "SPOKE"}
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
                onClick={() => handleCopyUplinkBundle(severTargetGame)}
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
                onClick={handleExecuteSeverCord}
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

      <TicketDossierSidePanel
        isOpen={!!selectedPartnerApp}
        onClose={() => setSelectedPartnerApp(null)}
        ticket={selectedPartnerApp}
        tableName="keeper_tickets"
        isReadOnly={false}
        canReply={true}
        availableActions={["RESOLVED", "REJECTED", "ESCALATED", "PENDING"]}
        onTakeAction={async (actionType, reason) => {
          if (!selectedPartnerApp) return;
          const nextMeta = {
            ...(selectedPartnerApp.metadata || {}),
            resolution_reason: reason,
          };
          const { error } = await supabaseAuth
            .from("keeper_tickets")
            .update({ status: actionType, metadata: nextMeta })
            .eq("id", selectedPartnerApp.id);
          if (!error) {
            pushStatus(t("alert_saved", "Saved"), "success");
            setSelectedPartnerApp(null);
            fetchGames();
          }
        }}
        onReplyAdded={() => {
          fetchGames();
        }}
      />
    </>
  );
}
