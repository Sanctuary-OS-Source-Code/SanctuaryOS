import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLexicon } from "../../LexiconContext";
import { CustomDropdown, EmptyState, HoverTooltip, VAULT_CHIP_CLASS } from "../../shared";
import { UniversalCard } from "../../components/universal/UniversalCard";
import {
  ElevatedHubLayout,
  HubListGrid,
  HubOverviewLanding,
  HubOverviewSection,
} from "../../components/layouts/ElevatedHubLayout";
import { CommandScreenSectionHeading } from "../SharedCommandScreenLayout";
import KeeperSupportSettings from "../KeeperSupportSettings";
import EmailConversationSidePanel from "../keepers-email/EmailConversationSidePanel";
import {
  DmcaAllNoticesSidePanel,
  DmcaLaneLeadCard,
  DmcaNoticeCard,
  DmcaNoticeReviewSidePanel,
  fetchDmcaQueueNotices,
} from "../compliance/DmcaOversightQueueSection";
import {
  type DmcaLaneId,
  filterDmcaNotices,
  partitionDmcaNoticesByLane,
  type ResolvedDmcaTargetEntry,
} from "../compliance/dmcaQueueHelpers";
import {
  formatEmailProviderLabel,
  getEmailDispatchStatusMeta,
  maskEmailsInText,
} from "../../utils/sanctuaryEmailTemplates";
import { normalizeLegacySenderName } from "../../utils/supporterManager";
import {
  type EmailThreadSummary,
  KeepersEmailComposeDrawer,
  KeepersEmailRelaySettingsSection,
  useKeepersEmailRelay,
} from "./KeepersEmailSettingsAndCompose";
import {
  type FiveTabId,
  isKeeperTicketClosed,
  useKeepersTicketsDomain,
} from "./useKeepersTicketsDomain";

type ComplianceChannelFilter = "all" | "dmca" | "email" | "contact";

export default function KeepersComplianceContactView({
  userRole = "keeper",
  masonProfileId,
  onEditMetadata,
  initialTab,
}: {
  userRole?: string;
  masonProfileId?: string;
  onEditMetadata?: (hash: string) => void;
  initialTab?: FiveTabId;
} = {}) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState<FiveTabId>(initialTab || "overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<ComplianceChannelFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [settingsStatusFilter, setSettingsStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const openCatRef = useRef<(() => void) | null>(null);
  const openCreateTemplateRef = useRef<(() => void) | null>(null);

  const [dmcaNotices, setDmcaNotices] = useState<any[]>([]);
  const [dmcaGamesMap, setDmcaGamesMap] = useState<Record<string, any>>({});
  const [dmcaResolvedTargetsMap, setDmcaResolvedTargetsMap] = useState<
    Record<string, ResolvedDmcaTargetEntry>
  >({});
  const [dmcaLoading, setDmcaLoading] = useState(true);
  const [selectedNotice, setSelectedNotice] = useState<any | null>(null);
  const [allDrawerLane, setAllDrawerLane] = useState<DmcaLaneId | null>(null);

  const relay = useKeepersEmailRelay();

  const {
    tickets: contactTickets,
    newTickets: newContactTickets,
    claimedTickets: claimedContactTickets,
    resolvedTickets: resolvedContactTickets,
    activeTickets: activeContactTickets,
    isLoading: contactLoading,
    spokesList,
    categoryOptions,
    settingsCount,
    setSettingsCount,
    fetchTickets,
    renderTicketCard,
    renderDossierDrawer,
  } = useKeepersTicketsDomain({
    domain: "compliance",
    userRole,
    masonProfileId,
    onEditMetadata,
  });

  const loadDmcaQueue = useCallback(async () => {
    setDmcaLoading(true);
    try {
      const res = await fetchDmcaQueueNotices({ isKeepersHub: true });
      setDmcaNotices(res.notices);
      setDmcaGamesMap(res.gamesMap);
      setDmcaResolvedTargetsMap(res.resolvedTargetsMap);
      setSelectedNotice((prev: any) =>
        prev ? res.notices.find((n: any) => n.id === prev.id) || null : null
      );
    } catch {
      // Errors surface in console/status via helpers
    } finally {
      setDmcaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDmcaQueue();
  }, [loadDmcaQueue]);

  const scopeOptions = useMemo(() => {
    const map = new Map<string, string>();
    spokesList.forEach((s) => map.set(s.id, s.name));
    Object.values(dmcaGamesMap || {}).forEach((g: any) => {
      if (g?.id) map.set(String(g.id), String(g.name || g.schema_id || g.id));
    });
    (dmcaNotices || []).forEach((n: any) => {
      const sid = String(n?.target_spoke_id || "").trim();
      if (sid && !map.has(sid)) {
        map.set(
          sid,
          String(n?.target_spoke_name || n?.metadata?.target_spoke_name || sid)
        );
      }
    });
    return [
      { id: "all", label: t("audit_scope_all", "All (Core + Spokes)") },
      { id: "hub", label: t("dmca_scope_hub_only", "Keepers Core (Hub Only)") },
      { id: "spokes", label: t("audit_scope_spokes", "Partner Spokes") },
      ...Array.from(map.entries()).map(([id, label]) => ({ id, label })),
    ];
  }, [dmcaGamesMap, dmcaNotices, spokesList, t]);

  const filteredDmcaNotices = useMemo(
    () =>
      filterDmcaNotices(dmcaNotices, {
        searchQuery,
        scopeFilter,
        resolvedTargetsMap: dmcaResolvedTargetsMap,
        gamesMap: dmcaGamesMap,
      }),
    [dmcaGamesMap, dmcaNotices, dmcaResolvedTargetsMap, scopeFilter, searchQuery]
  );

  const dmcaLanes = useMemo(
    () => partitionDmcaNoticesByLane(filteredDmcaNotices, t),
    [filteredDmcaNotices, t]
  );

  const ticketByIdMap = useMemo(() => {
    const map: Record<string, any> = {};
    contactTickets.forEach((tk) => {
      map[tk.id] = tk;
    });
    return map;
  }, [contactTickets]);

  const isCoreScopeVisible = scopeFilter === "all" || scopeFilter === "hub";

  const filteredEmailThreads = useMemo(() => {
    if (!isCoreScopeVisible) return [];
    const q = searchQuery.trim().toLowerCase();
    return relay.emailThreads.filter((entry) => {
      if (!q) return true;
      const subj = String(entry.latest?.subject || "").toLowerCase();
      const addr = maskEmailsInText(
        entry.latest?.to_email || entry.latest?.from_email || ""
      ).toLowerCase();
      const sender = String(entry.latest?.from_name || "").toLowerCase();
      return subj.includes(q) || addr.includes(q) || sender.includes(q);
    });
  }, [isCoreScopeVisible, relay.emailThreads, searchQuery]);

  const partitionedEmails = useMemo(() => {
    const newList: EmailThreadSummary[] = [];
    const claimedList: EmailThreadSummary[] = [];
    const resolvedList: EmailThreadSummary[] = [];

    for (const entry of filteredEmailThreads) {
      const linkedTicket = entry.resolvedTicketId
        ? ticketByIdMap[entry.resolvedTicketId]
        : null;
      if (linkedTicket && isKeeperTicketClosed(linkedTicket.status)) {
        resolvedList.push(entry);
      } else if (entry.latestIsInbound) {
        newList.push(entry);
      } else {
        claimedList.push(entry);
      }
    }
    return {
      newList,
      claimedList,
      resolvedList,
      activeList: [...newList, ...claimedList],
    };
  }, [filteredEmailThreads, ticketByIdMap]);

  const filterContactList = useCallback(
    (source: typeof contactTickets) => {
      if (!isCoreScopeVisible) return [];
      const q = searchQuery.trim().toLowerCase();
      return source.filter((tk) => {
        if (categoryFilter !== "all") {
          const cat = String(tk.ticket_type || tk.category || "GENERAL");
          if (cat !== categoryFilter) return false;
        }
        if (q) {
          if (
            !(
              tk.title?.toLowerCase().includes(q) ||
              tk.description?.toLowerCase().includes(q) ||
              tk.author_username?.toLowerCase().includes(q)
            )
          ) {
            return false;
          }
        }
        return true;
      });
    },
    [categoryFilter, isCoreScopeVisible, searchQuery]
  );

  const visibleNewContacts = useMemo(
    () => filterContactList(newContactTickets),
    [filterContactList, newContactTickets]
  );
  const visibleClaimedContacts = useMemo(
    () => filterContactList(claimedContactTickets),
    [claimedContactTickets, filterContactList]
  );
  const visibleResolvedContacts = useMemo(
    () => filterContactList(resolvedContactTickets),
    [filterContactList, resolvedContactTickets]
  );

  const showDmca = channelFilter === "all" || channelFilter === "dmca";
  const showEmail = channelFilter === "all" || channelFilter === "email";
  const showContact = channelFilter === "all" || channelFilter === "contact";

  const overviewTotalCount =
    (showDmca ? dmcaLanes.active.length : 0) +
    (showEmail ? partitionedEmails.activeList.length : 0) +
    (showContact ? activeContactTickets.length : 0);

  const newTotalCount =
    (showDmca ? dmcaLanes.urgent.length : 0) +
    (showEmail ? partitionedEmails.newList.length : 0) +
    (showContact ? visibleNewContacts.length : 0);

  const claimedTotalCount =
    (showDmca ? dmcaLanes.pending.length : 0) +
    (showEmail ? partitionedEmails.claimedList.length : 0) +
    (showContact ? visibleClaimedContacts.length : 0);

  const resolvedTotalCount =
    (showDmca ? dmcaLanes.settled.length : 0) +
    (showEmail ? partitionedEmails.resolvedList.length : 0) +
    (showContact ? visibleResolvedContacts.length : 0);

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: overviewTotalCount.toString(),
    },
    {
      id: "new",
      label: t("new", "New"),
      icon: t("icon_new_releases", "new_releases"),
      number: newTotalCount.toString(),
      colorClass: "text-[var(--danger)]",
    },
    {
      id: "pending",
      label: t("ticket_tab_claimed", "Claimed"),
      icon: t("icon_assignment_ind", "assignment_ind"),
      number: claimedTotalCount.toString(),
      colorClass: "text-[var(--warning)]",
    },
    {
      id: "closed",
      label: t("resolved", "Resolved"),
      icon: t("icon_check_circle", "check_circle"),
      number: resolvedTotalCount.toString(),
      colorClass: "text-[var(--success)]",
    },
    {
      id: "settings",
      label: t("settings", "Settings"),
      icon: t("icon_settings", "settings"),
      number: (3 + relay.responseTemplates.length + 4 + settingsCount).toString(),
    },
  ];

  const renderEmailThreadCard = (entry: EmailThreadSummary) => {
    const item = entry.latest;
    const statusMeta = getEmailDispatchStatusMeta(item.status, t);
    const providerLabel = formatEmailProviderLabel(item.provider);
    const dateLabel = item.created_at
      ? new Date(item.created_at).toLocaleDateString()
      : "";
    const senderLabel = normalizeLegacySenderName(
      item.from_name,
      relay.defaultSenderDisplayName
    );
    const recipientMasked = maskEmailsInText(item.to_email || item.from_email || "");

    return (
      <UniversalCard
        key={entry.threadId}
        layout="vertical"
        statusColor={entry.hasInbound ? "warning" : statusMeta.cardStatusColor}
        icon={
          entry.hasInbound
            ? t("icon_forum", "forum")
            : t("icon_outgoing_mail", "outgoing_mail")
        }
        bannerTopLabel={statusMeta.label}
        bannerTopRightLabel={`${entry.count} ${t("keepers_email_thread_msgs_short", "msgs")}`}
        bannerBottomLabel={recipientMasked || senderLabel}
        title={
          item.subject ||
          t("keepers_email_subject_placeholder", "Official Sanctuary OS Correspondence")
        }
        subtitle={
          <span className="no-text-case font-mono text-[11px] break-all">
            {recipientMasked} &bull; {senderLabel}
          </span>
        }
        imageOverlay={
          <div className="absolute top-2.5 left-3 flex flex-nowrap items-center gap-1.5 max-w-[calc(100%-6.5rem)] z-30 pointer-events-none">
            <span className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${statusMeta.iconColorClass}`}
              >
                {statusMeta.iconName}
              </span>
              <span>{statusMeta.label}</span>
            </span>
          </div>
        }
        badges={
          <>
            <span className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                {t("icon_forum", "forum")}
              </span>
              <span>
                {entry.count} {t("keepers_email_thread_msgs", "Messages")}
              </span>
            </span>
            {entry.hasInbound && (
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_move_to_inbox", "move_to_inbox")}
                </span>
                <span>{t("keepers_email_dir_inbound", "External Reply")}</span>
              </span>
            )}
          </>
        }
        onClick={() =>
          relay.setActiveEmailThread({
            threadId: entry.threadId,
            dispatchId: item.id,
            ticketId: entry.resolvedTicketId,
            subject: item.subject || undefined,
          })
        }
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="text-[10px] font-bold text-[var(--subtext)] opacity-80 truncate">
              {providerLabel}
              {dateLabel ? ` • ${dateLabel}` : ""}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover/card:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover/card:opacity-100 translate-x-2 group-hover/card:translate-x-0 shrink-0">
              <span>{t("keepers_email_open_thread", "Open Thread")}</span>
              <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      />
    );
  };

  const renderTabListContent = (tab: "new" | "pending" | "closed") => {
    const laneNotices =
      tab === "new"
        ? dmcaLanes.urgent
        : tab === "pending"
          ? dmcaLanes.pending
          : dmcaLanes.settled;
    const laneId: DmcaLaneId =
      tab === "new" ? "urgent" : tab === "pending" ? "pending" : "settled";
    const tabEmails =
      tab === "new"
        ? partitionedEmails.newList
        : tab === "pending"
          ? partitionedEmails.claimedList
          : partitionedEmails.resolvedList;
    const tabContacts =
      tab === "new"
        ? visibleNewContacts
        : tab === "pending"
          ? visibleClaimedContacts
          : visibleResolvedContacts;

    const dmcaVisible = showDmca ? laneNotices : [];
    const emailVisible = showEmail ? tabEmails : [];
    const contactVisible = showContact ? tabContacts : [];

    if (dmcaLoading && contactLoading && dmcaVisible.length === 0 && contactVisible.length === 0) {
      return (
        <EmptyState
          icon={t("icon_sync", "sync")}
          title={t("ui_btn_processing", "Processing...")}
        />
      );
    }

    if (
      dmcaVisible.length === 0 &&
      emailVisible.length === 0 &&
      contactVisible.length === 0
    ) {
      return (
        <EmptyState
          icon={
            searchQuery
              ? t("icon_search_off", "search_off")
              : t("icon_gavel", "gavel")
          }
          title={
            searchQuery
              ? t("no_matches", "No matches found")
              : t("no_tickets", "No Support Tickets")
          }
        />
      );
    }

    return (
      <div className="flex flex-col gap-10 w-full">
        {dmcaVisible.length > 0 && (
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading
              icon={t("icon_gavel", "gavel")}
              iconColorClass={
                tab === "closed" ? "text-[var(--success)]" : "text-[var(--warning)]"
              }
              title={t("dmca_tab_label", "DMCA & Legal")}
              subtitle={t(
                "keepers_dmca_view_copy_note",
                "Keepers Core notices & read-only Partner Spoke view copies"
              )}
              onJump={() => setAllDrawerLane(laneId)}
              jumpTooltip={`${t("view_all", "View All")} (${dmcaVisible.length})`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
              <DmcaLaneLeadCard
                lane={laneId}
                count={dmcaVisible.length}
                overdueCount={
                  dmcaVisible.filter((n) => Boolean(n?.is_sla_overdue)).length
                }
                onClick={() => setAllDrawerLane(laneId)}
              />
              {dmcaVisible.map((notice) => (
                <DmcaNoticeCard
                  key={notice.id}
                  notice={notice}
                  resolvedTargetsMap={dmcaResolvedTargetsMap}
                  gamesMap={dmcaGamesMap}
                  showScopeChip={true}
                  onSelect={setSelectedNotice}
                />
              ))}
            </div>
          </div>
        )}

        {emailVisible.length > 0 && (
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading
              icon={t("icon_forum", "forum")}
              iconColorClass="text-[var(--accent)]"
              title={t("keepers_email_threads_count", "Conversations")}
              subtitle={t(
                "keepers_email_threads_subtitle",
                "Two-way inbound & outbound correspondence via Sanctuary Foundry Relay"
              )}
            />
            <HubListGrid isEmpty={false}>
              {emailVisible.map(renderEmailThreadCard)}
            </HubListGrid>
          </div>
        )}

        {contactVisible.length > 0 && (
          <div className="flex flex-col gap-4 w-full">
            <CommandScreenSectionHeading
              icon={t("icon_support_agent", "support_agent")}
              iconColorClass="text-[var(--warning)]"
              title={t("landing_contact_card_title", "Direct Human Contact")}
              subtitle={t(
                "keepers_direct_contact_subtitle",
                "Direct legal, privacy, and human contact dossiers"
              )}
            />
            <HubListGrid isEmpty={false}>
              {contactVisible.map(renderTicketCard)}
            </HubListGrid>
          </div>
        )}
      </div>
    );
  };

  const primaryPopover =
    activeTab === "settings"
      ? {
          icon: t("icon_tune", "tune"),
          label: t("filters", "Filters"),
          content: (
            <div className="flex flex-col w-[300px] p-4 max-w-[calc(100vw-40px)] gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("status", "Status")}
                </span>
                <CustomDropdown
                  flat={true}
                  variant="pill"
                  value={settingsStatusFilter}
                  onChange={(v: string[]) =>
                    setSettingsStatusFilter((v[0] as any) || "all")
                  }
                  options={[
                    { id: "all", label: t("all_classes", "All Categories") },
                    { id: "active", label: t("support_active_only", "Active Only") },
                    { id: "inactive", label: t("support_inactive_only", "Inactive Only") },
                  ]}
                  disableTint={true}
                />
              </div>
            </div>
          ),
        }
      : {
          icon: t("icon_tune", "tune"),
          label: t("filters", "Filters"),
          content: (
            <div className="flex flex-col w-[320px] p-4 max-w-[calc(100vw-40px)] gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("keepers_compliance_channel_label", "Channel")}
                </span>
                <CustomDropdown
                  flat={true}
                  variant="pill"
                  value={channelFilter}
                  onChange={(v: string[]) =>
                    setChannelFilter((v[0] as ComplianceChannelFilter) || "all")
                  }
                  options={[
                    { id: "all", label: t("all", "All") },
                    { id: "dmca", label: t("dmca_tab_label", "DMCA & Legal") },
                    { id: "email", label: t("keepers_email_threads_count", "Conversations") },
                    {
                      id: "contact",
                      label: t("landing_contact_card_title", "Direct Human Contact"),
                    },
                  ]}
                  disableTint={true}
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("dmca_scope_label", "Target Scope")}
                </span>
                <CustomDropdown
                  flat={true}
                  variant="pill"
                  value={scopeFilter}
                  onChange={(v: string[]) => setScopeFilter(v[0] || "all")}
                  options={scopeOptions}
                  disableTint={true}
                />
              </div>

              {(channelFilter === "all" || channelFilter === "contact") && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("category", "Category")}
                  </span>
                  <CustomDropdown
                    flat={true}
                    variant="pill"
                    value={categoryFilter}
                    onChange={(v: string[]) => setCategoryFilter(v[0] || "all")}
                    options={categoryOptions}
                    disableTint={true}
                  />
                </div>
              )}
            </div>
          ),
        };

  return (
    <ElevatedHubLayout
      headerTitle={t("keepers_tab_compliance_contact", "Compliance & Contact")}
      headerSubtitle={t(
        "keepers_compliance_contact_subtitle",
        "Manage DMCA & legal notices, two-way email correspondence, and direct human inquiries."
      )}
      headerIcon={t("icon_gavel", "gavel")}
      headerIconColorClass="text-[var(--warning)]"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("nav_search", "Search...")}
      hideSearch={activeTab === "overview"}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as FiveTabId);
        setCategoryFilter("all");
      }}
      primaryPopover={primaryPopover}
      actions={[
        {
          id: "sync_replies",
          icon: t("icon_sync", "sync"),
          label: relay.isSyncingReplies
            ? t("ui_btn_processing", "Processing...")
            : t("keepers_email_sync_replies_btn", "Sync Inbound Replies"),
          onClick: () => {
            relay.syncInboundReplies({ silent: false });
            loadDmcaQueue();
          },
        },
        {
          id: "compose_email",
          icon: t("icon_outgoing_mail", "outgoing_mail"),
          label: t("keepers_email_compose_btn", "Compose Email"),
          onClick: () => relay.setIsComposeOpen(true),
        },
        ...(activeTab === "settings"
          ? [
              {
                id: "new_tpl",
                icon: t("icon_quickreply", "quickreply"),
                label: t("keepers_email_tpl_new_btn", "New Template"),
                onClick: () => openCreateTemplateRef.current?.(),
              },
              {
                id: "add_cat",
                icon: t("icon_add", "add"),
                label: t("support_add_cat", "Add Category"),
                onClick: () => openCatRef.current?.(),
              },
            ]
          : []),
      ]}
    >
      {activeTab === "settings" ? (
        <div className="flex flex-col gap-10">
          <KeepersEmailRelaySettingsSection
            relay={relay}
            externalSearch={searchQuery}
            openCreateTemplateRef={openCreateTemplateRef}
          />
          <div className="flex flex-col gap-4">
            <CommandScreenSectionHeading
              icon={t("icon_category", "category")}
              iconColorClass="text-[var(--accent)]"
              title={t("tab_support", "Support Settings")}
              subtitle={t(
                "keepers_compliance_cats_subtitle",
                "Direct Contact, Legal & Privacy ticket categories"
              )}
            />
            <KeeperSupportSettings
              embedded={true}
              supportDomain="compliance"
              externalSearch={searchQuery}
              statusFilter={settingsStatusFilter}
              openCatRef={openCatRef}
              onCountsChange={setSettingsCount}
              onSavedCategories={fetchTickets}
            />
          </div>
        </div>
      ) : activeTab === "overview" ? (
        <HubOverviewLanding>
          {showDmca && (
            <HubOverviewSection
              title={t("dmca_tab_label", "DMCA & Legal")}
              icon={t("icon_gavel", "gavel")}
              iconColorClass="text-[var(--warning)]"
              headerAction={
                <button
                  type="button"
                  onClick={() => setAllDrawerLane("urgent")}
                  className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_arrow_forward", "arrow_forward")}
                  </span>
                  <HoverTooltip title={t("dmca_open_all_urgent", "View All Urgent")} />
                </button>
              }
              isEmpty={false}
            >
              <DmcaLaneLeadCard
                lane="urgent"
                count={dmcaLanes.urgent.length}
                overdueCount={
                  dmcaLanes.urgent.filter((n) => Boolean(n?.is_sla_overdue)).length
                }
                onClick={() => setAllDrawerLane("urgent")}
              />
              {dmcaLanes.active.slice(0, 3).map((notice) => (
                <DmcaNoticeCard
                  key={notice.id}
                  notice={notice}
                  resolvedTargetsMap={dmcaResolvedTargetsMap}
                  gamesMap={dmcaGamesMap}
                  showScopeChip={true}
                  onSelect={setSelectedNotice}
                />
              ))}
            </HubOverviewSection>
          )}

          {showEmail && (
            <HubOverviewSection
              title={t("keepers_email_threads_count", "Conversations")}
              icon={t("icon_forum", "forum")}
              iconColorClass="text-[var(--accent)]"
              headerAction={
                <button
                  type="button"
                  onClick={() => relay.setIsComposeOpen(true)}
                  className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_outgoing_mail", "outgoing_mail")}
                  </span>
                  <HoverTooltip title={t("keepers_email_compose_btn", "Compose Email")} />
                </button>
              }
              isEmpty={partitionedEmails.activeList.length === 0}
              emptyState={
                <EmptyState
                  icon={t("icon_mark_email_read", "mark_email_read")}
                  title={t("keepers_email_no_activity", "No Outbound Email Logs")}
                  className="py-8"
                />
              }
            >
              {partitionedEmails.activeList.slice(0, 4).map(renderEmailThreadCard)}
            </HubOverviewSection>
          )}

          {showContact && (
            <>
              <HubOverviewSection
                title={t("ticket_tab_claimed", "Claimed")}
                icon={t("icon_assignment_ind", "assignment_ind")}
                iconColorClass="text-[var(--warning)]"
                headerAction={
                  <button
                    type="button"
                    onClick={() => setActiveTab("pending")}
                    className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[16px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                    <HoverTooltip title={t("ticket_tab_claimed", "Claimed")} />
                  </button>
                }
                isEmpty={claimedContactTickets.length === 0}
                emptyState={
                  <EmptyState
                    icon={t("icon_done_all", "done_all")}
                    title={t("no_claimed_tickets", "No Claimed Tickets")}
                    className="py-8"
                  />
                }
              >
                {claimedContactTickets.slice(0, 4).map(renderTicketCard)}
              </HubOverviewSection>

              <HubOverviewSection
                title={t("landing_contact_card_title", "Direct Human Contact")}
                icon={t("icon_support_agent", "support_agent")}
                iconColorClass="text-[var(--warning)]"
                headerAction={
                  <button
                    type="button"
                    onClick={() => setActiveTab("new")}
                    className="px-3 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-[16px]">
                      {t("icon_arrow_forward", "arrow_forward")}
                    </span>
                    <HoverTooltip title={t("new", "New")} />
                  </button>
                }
                isEmpty={newContactTickets.length === 0}
                emptyState={
                  <EmptyState
                    icon={t("icon_support_agent", "support_agent")}
                    title={t("no_tickets", "No Support Tickets")}
                    className="py-8"
                  />
                }
              >
                {newContactTickets.slice(0, 4).map(renderTicketCard)}
              </HubOverviewSection>
            </>
          )}
        </HubOverviewLanding>
      ) : (
        renderTabListContent(activeTab)
      )}

      {renderDossierDrawer()}

      <DmcaAllNoticesSidePanel
        isOpen={Boolean(allDrawerLane)}
        onClose={() => setAllDrawerLane(null)}
        initialLane={allDrawerLane || "urgent"}
        notices={dmcaNotices}
        resolvedTargetsMap={dmcaResolvedTargetsMap}
        gamesMap={dmcaGamesMap}
        isKeepersView={true}
        initialScopeFilter={scopeFilter}
        onSelectNotice={setSelectedNotice}
        onRefresh={loadDmcaQueue}
      />

      <DmcaNoticeReviewSidePanel
        notice={selectedNotice}
        isOpen={Boolean(selectedNotice)}
        onClose={() => setSelectedNotice(null)}
        resolvedTargetsMap={dmcaResolvedTargetsMap}
        gamesMap={dmcaGamesMap}
        isKeepersView={true}
        onRefresh={loadDmcaQueue}
      />

      <KeepersEmailComposeDrawer relay={relay} />

      <EmailConversationSidePanel
        isOpen={Boolean(relay.activeEmailThread)}
        onClose={() => relay.setActiveEmailThread(null)}
        threadId={relay.activeEmailThread?.threadId}
        dispatchId={relay.activeEmailThread?.dispatchId}
        ticketId={relay.activeEmailThread?.ticketId}
        initialSubject={relay.activeEmailThread?.subject}
        templates={relay.responseTemplates}
        fromName={normalizeLegacySenderName(
          relay.supportSenderNameInput,
          relay.defaultSenderDisplayName
        )}
        fromEmail={relay.supportEmailInput.trim() || relay.defaultSupportEmail}
        replyTo={
          relay.supportReplyToInput.trim() ||
          relay.supportEmailInput.trim() ||
          relay.defaultSupportEmail
        }
        onThreadUpdated={relay.loadEmailCenterData}
      />
    </ElevatedHubLayout>
  );
}
