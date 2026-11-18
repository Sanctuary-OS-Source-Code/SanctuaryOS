import { HoverTooltip, VAULT_CHIP_CLASS } from "../../shared";
import { UniversalCard } from "../../components/universal/UniversalCard";
import { openSanctuaryContextMenu } from "../../shared-components/ContextMenu";
import { CANONICAL_DIRECTIVES } from "../../utils/directivesSync";

export function useWayfinderOverviewCards({
  t,
  td,
  activeWorkspaceId,
  activeWs,
  setActiveSpokePanel,
  uplinkUrl,
  processor,
  donationUrl,
  setForkTab,
  setIsCovenantPanelOpen,
  setCovenantDocTab,
  stableVersion,
  setSelectedTicket,
  syncedForkingSchema,
  renamingFile,
  setRenamingFile,
  renameInput,
  setRenameInput,
  renameExt,
  setRenameExt,
  deleteConfirmPath,
  setDeleteConfirmPath,
  openFiles,
  openFile,
  handleDeleteFile,
  handleRenameSubmit,
  handleCopyUplinkBundle,
  handleCopySpokeSql,
}: any) {
  const renderSpokeSetupCard = () => {
    const isConnected = Boolean(activeWs?.supabase_url || uplinkUrl);
    return (
      <UniversalCard
        key="spoke_op_setup"
        layout="vertical"
        onClick={() => setActiveSpokePanel("setup")}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("configure", "Configure"),
              icon: t("icon_router", "router"),
              onClick: () => setActiveSpokePanel("setup"),
            },
            {
              label: t("spoke_copy_uplink_bundle", "Copy Uplink Bundle"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: handleCopyUplinkBundle,
            },
          ]);
        }}
        icon={t("icon_router", "router")}
        title={t("wf_card_spoke_setup_title", "Spoke Setup & Maintenance")}
        subtitle={
          activeWs?.supabase_url ||
          uplinkUrl ||
          t("wf_uplink_node_telemetry", "Spoke Node Telemetry")
        }
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isConnected ? "text-[var(--success)]" : "text-[var(--warning)]"
                }`}
              >
                {isConnected
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_warning", "warning")}
              </span>
              <span>
                {isConnected
                  ? t("auto_synchronized", "SYNCHRONIZED")
                  : t("status_pending", "Pending")}
              </span>
            </div>
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_fingerprint", "fingerprint")}
              </span>
              <span>{activeWs?.schema_id || activeWorkspaceId || "SPOKE"}</span>
            </div>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_vpn_key", "vpn_key")}
              </span>
              <span>{t("wf_uplink_key_rotation_title", "Key Rotation")}</span>
            </div>
          </>
        }
        actions={
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopyUplinkBundle();
            }}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:scale-110"
          >
            <span className="material-symbols-outlined !text-[14px]">
              {t("icon_content_copy", "content_copy")}
            </span>
            <HoverTooltip title={t("spoke_copy_uplink_bundle", "Copy Uplink Bundle")} />
          </button>
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
              <span className="material-symbols-outlined !text-[12px] opacity-70">
                {t("icon_settings_ethernet", "settings_ethernet")}
              </span>
              {t("spoke_copy_uplink_bundle", "SANCTUARY-UPLINK://")}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {t("configure", "Configure")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
          {t(
            "wf_card_spoke_setup_desc",
            "Inspect Spoke node telemetry, rotate Spoke Gateway Tokens and Anon keys, verify Hub handshake status, and copy a secret-free SANCTUARY-UPLINK:// bundle."
          )}
        </p>
      </UniversalCard>
    );
  };

  const renderSpokeSeverCard = () => (
    <UniversalCard
      key="spoke_op_sever"
      layout="vertical"
      onClick={() => setActiveSpokePanel("sever")}
      onContextMenu={(e) => {
        openSanctuaryContextMenu(e, [
          {
            label: t("btn_inspect", "Inspect"),
            icon: t("icon_link_off", "link_off"),
            danger: true,
            onClick: () => setActiveSpokePanel("sever"),
          },
        ]);
      }}
      icon={t("icon_link_off", "link_off")}
      title={t("wf_card_spoke_sever_title", "Spoke Sever (Cut the Cord)")}
      subtitle={t("wf_badge_sovereign", "Bilateral Sovereignty")}
      statusColor="border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
              {t("icon_link_off", "link_off")}
            </span>
            <span>{t("wf_badge_sovereign", "Bilateral Sovereignty")}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_database", "database")}
            </span>
            <span>{t("wf_badge_100_data", "100% Data Retained")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
              {t("icon_security", "security")}
            </span>
            <span>{t("wf_sever_key_custody_val", "Revoked & Purged on Sever")}</span>
          </div>
        </>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
              {t("icon_shield", "shield")}
            </span>
            {t("wf_footer_double_click_guard", "Double-Click Safeguard")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--danger)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_inspect", "Inspect")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {t(
          "wf_cut_cord_desc",
          "Unilaterally sever this community's Spoke database from the Sanctuary OS Hub. This immediately deactivates the workspace on the global network, revokes all active Spoke Gateway Tokens, and purges its sealed Vault credential from Keepers Core while leaving 100% of the Spoke database intact."
        )}
      </p>
    </UniversalCard>
  );

  const renderForkingHelpCard = () => (
    <UniversalCard
      key="spoke_op_forking"
      layout="vertical"
      onClick={() => setActiveSpokePanel("forking")}
      onContextMenu={(e) => {
        openSanctuaryContextMenu(e, [
          {
            label: t("open", "Open"),
            icon: t("icon_menu_book", "menu_book"),
            onClick: () => setActiveSpokePanel("forking"),
          },
          {
            label: t("wf_btn_copy_spoke_sql", "Copy schema.sql"),
            icon: t("icon_database", "database"),
            onClick: handleCopySpokeSql,
          },
        ]);
      }}
      icon={t("icon_menu_book", "menu_book")}
      title={t("wf_tab_forking_help", "Forking Help & Walkthrough")}
      subtitle={td(syncedForkingSchema.title)}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_call_split", "call_split")}
            </span>
            <span>{CANONICAL_DIRECTIVES.forking_guide.category}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_storage", "storage")}
            </span>
            <span>{t("dir_fork_sql_spoke_val", "schema.sql (52 Tables)")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_code", "code")}
            </span>
            <span>{t("dir_fk_t2_val", "Standalone & Hub")}</span>
          </div>
        </>
      }
      actions={
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopySpokeSql();
          }}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:scale-110"
        >
          <span className="material-symbols-outlined !text-[14px]">
            {t("icon_database", "database")}
          </span>
          <HoverTooltip title={t("wf_btn_copy_spoke_sql", "Copy schema.sql")} />
        </button>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">
              {t("icon_terminal", "terminal")}
            </span>
            {t("wf_btn_copy_spoke_sql", "Copy schema.sql")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("open", "Open")} <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {td(syncedForkingSchema.summary)}
      </p>
    </UniversalCard>
  );

  const renderDonationsCard = () => {
    const hasLink = Boolean(donationUrl.trim());
    return (
      <UniversalCard
        key="spoke_op_donations"
        layout="vertical"
        onClick={() => setActiveSpokePanel("donations")}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("configure", "Configure"),
              icon: t("icon_volunteer_activism", "volunteer_activism"),
              onClick: () => setActiveSpokePanel("donations"),
            },
          ]);
        }}
        icon={t("icon_volunteer_activism", "volunteer_activism")}
        title={t("wf_donation_panel_title", "Non-Custodial Community Donations")}
        subtitle={
          hasLink ? donationUrl : t("wf_donation_no_link", "No Checkout Link Set")
        }
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  hasLink ? "text-[var(--success)]" : "text-[var(--warning)]"
                }`}
              >
                {hasLink
                  ? t("icon_check_circle", "check_circle")
                  : t("icon_info", "info")}
              </span>
              <span>{processor}</span>
            </div>
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                {t("icon_verified", "verified")}
              </span>
              <span>{t("wf_badge_zero_cut", "0% Sanctuary Cut")}</span>
            </div>
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_bolt", "bolt")}
              </span>
              <span>{hasLink ? t("status_live", "Live") : t("status_not_live", "Not Live")}</span>
            </div>
          </>
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
              <span className="material-symbols-outlined !text-[12px] opacity-70">
                {t("icon_volunteer_activism", "volunteer_activism")}
              </span>
              {processor}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {t("configure", "Configure")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
          {t(
            "wf_donation_notice_desc",
            "Your community receives 100% of all citizen donations directly via your own payment processor. Sanctuary OS takes a 0% cut, never touches your funds, and does not cover chargebacks."
          )}
        </p>
      </UniversalCard>
    );
  };

  const renderSqlSchemasCard = () => (
    <UniversalCard
      key="spoke_op_sql_schemas"
      layout="vertical"
      onClick={() => {
        setForkTab("sql");
        setActiveSpokePanel("forking");
      }}
      icon={t("icon_database", "database")}
      title={t(
        "wf_card_sql_schemas_title",
        "Spoke & Hub SQL Schemas (schema.sql)"
      )}
      subtitle={t("dir_fork_sql_spoke_val", "schema.sql (52 Tables)")}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_storage", "storage")}
            </span>
            <span>{t("dir_fork_sql_spoke_val", "schema.sql (52 Tables)")}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_hub", "hub")}
            </span>
            <span>{t("dir_fork_sql_hub_val", "schema_os.sql (22 Tables)")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_passkey", "passkey")}
            </span>
            <span>{t("wf_badge_100_data", "100% Data Retained")}</span>
          </div>
        </>
      }
      actions={
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopySpokeSql();
          }}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:scale-110"
        >
          <span className="material-symbols-outlined !text-[14px]">
            {t("icon_content_copy", "content_copy")}
          </span>
          <HoverTooltip title={t("wf_btn_copy_spoke_sql", "Copy schema.sql")} />
        </button>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">
              {t("icon_database", "database")}
            </span>
            {t("wf_btn_copy_spoke_sql", "Copy schema.sql")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_inspect", "Inspect")}{" "}
            <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {t(
          "wf_card_sql_schemas_desc",
          "Inspect and copy the complete PostgreSQL database schemas for Community Spokes (schema.sql) and Central Federation Hubs (schema_os.sql)."
        )}
      </p>
    </UniversalCard>
  );

  const renderPartnersAgreementCard = () => (
    <UniversalCard
      key="spoke_op_partners_agreement"
      layout="vertical"
      onClick={() => {
        setCovenantDocTab("partners_agreement");
        setIsCovenantPanelOpen(true);
      }}
      icon={t("icon_handshake", "handshake")}
      title={t("partner_agreement_title", "Partners Agreement")}
      subtitle={`V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_handshake", "handshake")}
            </span>
            <span>{`V${stableVersion} • ${t("partner_agreement_badge", "Spoke Charter")}`}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_verified", "verified")}
            </span>
            <span>{t("wf_badge_zero_cut", "0% Sanctuary Cut")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_link_off", "link_off")}
            </span>
            <span>{t("wf_badge_sovereign", "Bilateral Sovereignty")}</span>
          </div>
        </>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">
              {t("icon_gavel", "gavel")}
            </span>
            {t("partner_agreement_badge", "Spoke Charter")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_inspect", "Inspect")}{" "}
            <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {t(
          "partner_agreement_desc",
          "Bilateral Sovereignty (Cut the Cord), 0% non-custodial donations, Spoke maintenance duties, and brand boundaries."
        )}
      </p>
    </UniversalCard>
  );

  const renderComplianceProtocolCard = () => (
    <UniversalCard
      key="spoke_op_compliance_protocol"
      layout="vertical"
      onClick={() => {
        setCovenantDocTab("compliance_protocol");
        setIsCovenantPanelOpen(true);
      }}
      icon={t("icon_shield", "shield")}
      title={t("compliance_protocol_title", "Compliance Protocol")}
      subtitle={`V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`}
      imageOverlay={
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_shield", "shield")}
            </span>
            <span>{`V${stableVersion} • ${t("compliance_protocol_badge", "Safety & Privacy")}`}</span>
          </div>
        </div>
      }
      badges={
        <>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
              {t("icon_security", "security")}
            </span>
            <span>{t("compliance_protocol_badge", "Safety & Privacy")}</span>
          </div>
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_gavel", "gavel")}
            </span>
            <span>{t("partner_covenants_title", "Partners Agreement & Compliance Protocol")}</span>
          </div>
        </>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 flex items-center gap-1.5 truncate pr-2">
            <span className="material-symbols-outlined !text-[12px] opacity-70">
              {t("icon_shield", "shield")}
            </span>
            {t("compliance_protocol_badge", "Safety & Privacy")}
          </span>
          <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
            {t("btn_inspect", "Inspect")}{" "}
            <span className="text-base leading-none">&rarr;</span>
          </span>
        </div>
      }
    >
      <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
        {t(
          "compliance_protocol_desc",
          "Zero-malware enforcement, SHA-256 {mod} verification, DMCA takedown compliance, and GDPR/CCPA privacy standards."
        )}
      </p>
    </UniversalCard>
  );

  const renderSchemaFileCard = (file: any) => {
    const isOpen = openFiles.some((f: any) => f.path === file.path);
    const hasUnsaved =
      Boolean(file.hasUnsavedDraft) ||
      openFiles.some((f: any) => f.path === file.path && f.content !== f.originalContent);
    const displayTitle = file.displayTitle || file.name.replace(/\.json$/i, "");
    const updatedDateStr = file.updated_at
      ? new Date(file.updated_at).toLocaleDateString()
      : undefined;

    return (
      <UniversalCard
        key={file.path}
        layout="vertical"
        statusColor={
          hasUnsaved
            ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
            : isOpen
              ? "border-[color-mix(in_srgb,var(--text)_24%,transparent)]"
              : undefined
        }
        onClick={() => {
          if (renamingFile !== file.path) openFile(file);
        }}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("open_editor", "Open in Editor"),
              icon: t("icon_code", "code"),
              onClick: () => openFile(file),
            },
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(displayTitle || file.name || ""),
            },
          ]);
        }}
        icon={t("icon_data_object", "data_object")}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  hasUnsaved
                    ? "text-[var(--warning)]"
                    : isOpen
                      ? "text-[var(--accent)]"
                      : "text-[var(--accent)]"
                }`}
              >
                {hasUnsaved
                  ? t("icon_warning", "warning")
                  : isOpen
                    ? t("icon_edit", "edit")
                    : t("icon_cloud_done", "cloud_done")}
              </span>
              <span>
                {hasUnsaved
                  ? t("unsaved_changes", "Unsaved")
                  : isOpen
                    ? t("editing", "Editing")
                    : t("synced", "Synced")}
              </span>
            </div>
          </div>
        }
        title={
          renamingFile === file.path ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col gap-2 w-full z-20"
            >
              <div className="flex items-center gap-1 w-full">
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit(file.path, file.name);
                    if (e.key === "Escape") setRenamingFile(null);
                  }}
                  className="glass-surface theme-border-accent rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none flex-1 min-w-0 font-mono"
                  autoFocus
                />
                <input
                  type="text"
                  value={renameExt}
                  onChange={(e) => setRenameExt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit(file.path, file.name);
                    if (e.key === "Escape") setRenamingFile(null);
                  }}
                  className="glass-surface theme-border-accent rounded px-1.5 py-1 text-xs text-[var(--subtext)] focus:outline-none w-16 font-mono text-center"
                />
              </div>
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => handleRenameSubmit(file.path, file.name)}
                  className="p-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--success)] bg-transparent hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)] flex items-center justify-center cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_check", "check")}
                  </span>
                </button>
                <button
                  onClick={() => setRenamingFile(null)}
                  className="p-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] bg-transparent flex items-center justify-center cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            displayTitle
          )
        }
        subtitle={
          renamingFile === file.path
            ? undefined
            : updatedDateStr
              ? `${t("wf_recent_last_updated", "Last Updated")}: ${updatedDateStr}`
              : `${t("author", "Author")}: ${file.author || activeWs?.name || displayTitle}`
        }
        badges={
          <div className="flex flex-wrap items-center gap-1.5">
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_data_object", "data_object")}
              </span>
              <span>{t("tab_schemas", "Master Schemas")}</span>
            </div>
            {file.version !== undefined && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_history", "history")}
                </span>
                <span>v{file.version}</span>
              </div>
            )}
            {updatedDateStr && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_schedule", "schedule")}
                </span>
                <span>{updatedDateStr}</span>
              </div>
            )}
          </div>
        }
        footer={
          renamingFile !== file.path ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-between w-full gap-2"
            >
              <span className="text-[10px] font-bold text-[var(--subtext)] opacity-60 truncate font-mono">
                {file.name}
              </span>
              {deleteConfirmPath === file.path ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.path);
                      setDeleteConfirmPath(null);
                    }}
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--danger)] bg-transparent hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_check", "check")}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmPath(null);
                    }}
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_15%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] bg-transparent flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_close", "close")}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const dotIdx = file.name.lastIndexOf(".");
                      if (dotIdx > 0) {
                        setRenameInput(file.name.substring(0, dotIdx));
                        setRenameExt(file.name.substring(dotIdx));
                      } else {
                        setRenameInput(file.name);
                        setRenameExt("");
                      }
                      setRenamingFile(file.path);
                    }}
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-transparent flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_edit", "edit")}
                    </span>
                    <HoverTooltip title={t("rename_file", "Rename")} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmPath(file.path);
                    }}
                    className="w-7 h-7 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] bg-transparent flex items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {t("icon_delete", "delete")}
                    </span>
                    <HoverTooltip title={t("delete_file", "Delete")} variant="danger" />
                  </button>
                </div>
              )}
            </div>
          ) : undefined
        }
      />
    );
  };

  const renderOverviewTicketCard = (ticket: any) => {
    const statusLower = ticket.status?.toLowerCase() || "open";
    const isEscalated = statusLower === "escalated";
    return (
      <UniversalCard
        key={`overview_ticket_${ticket.id}`}
        layout="vertical"
        icon={t("icon_confirmation_number", "confirmation_number")}
        title={ticket.title}
        subtitle={`#${ticket.id.slice(0, 8)}`}
        onClick={() => setSelectedTicket(ticket)}
        onContextMenu={(e) => {
          openSanctuaryContextMenu(e, [
            {
              label: t("view_ticket", "View Ticket"),
              icon: t("icon_confirmation_number", "confirmation_number"),
              onClick: () => setSelectedTicket(ticket),
            },
            {
              divider: true,
              label: t("copy_title", "Copy Title"),
              icon: t("icon_content_copy", "content_copy"),
              onClick: () => navigator.clipboard?.writeText(ticket.title || ""),
            },
          ]);
        }}
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[75%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isEscalated ? "text-[var(--danger)]" : "text-[var(--warning)]"
                }`}
              >
                {isEscalated
                  ? t("icon_priority_high", "priority_high")
                  : t("icon_confirmation_number", "confirmation_number")}
              </span>
              <span>
                {isEscalated
                  ? t("ticket_status_escalated", "Escalated")
                  : t("ticket_status_open", "Open")}
              </span>
            </div>
          </div>
        }
        badges={
          <div className={VAULT_CHIP_CLASS}>
            <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
              {t("icon_admin_panel_settings", "admin_panel_settings")}
            </span>
            <span>{t("wf_tab_keepers_support", "Keepers Support")}</span>
          </div>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 opacity-60">
              <span className="material-symbols-outlined !text-[12px]">
                {t("icon_calendar_today", "calendar_today")}
              </span>
              {new Date(ticket.created_at).toLocaleDateString()}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0">
              {t("view_ticket", "View Ticket")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      >
        <p className="text-xs text-[var(--subtext)] opacity-80 line-clamp-2 leading-relaxed">
          {ticket.description}
        </p>
      </UniversalCard>
    );
  };

  return {
    renderSpokeSetupCard,
    renderSpokeSeverCard,
    renderForkingHelpCard,
    renderDonationsCard,
    renderSqlSchemasCard,
    renderPartnersAgreementCard,
    renderComplianceProtocolCard,
    renderSchemaFileCard,
    renderOverviewTicketCard,
  };
}
