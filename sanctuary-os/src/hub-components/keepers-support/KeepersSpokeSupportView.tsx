import { useMemo, useRef, useState } from "react";
import { CustomDropdown, EmptyState, HoverTooltip } from "../../shared";
import {
  ElevatedHubLayout,
  HubListGrid,
  HubOverviewLanding,
  HubOverviewSection,
} from "../../components/layouts/ElevatedHubLayout";
import KeeperSupportSettings from "../KeeperSupportSettings";
import {
  extractTicketSpokeId,
  extractTicketSpokeName,
  type FiveTabId,
  useKeepersTicketsDomain,
} from "./useKeepersTicketsDomain";

export default function KeepersSpokeSupportView({
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
  const [activeTab, setActiveTab] = useState<FiveTabId>(initialTab || "overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [spokeFilter, setSpokeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [settingsStatusFilter, setSettingsStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const openCatRef = useRef<(() => void) | null>(null);

  const {
    t,
    newTickets,
    claimedTickets,
    resolvedTickets,
    activeTickets,
    isLoading,
    spokesList,
    spokesMap,
    categoryOptions,
    settingsCount,
    setSettingsCount,
    fetchTickets,
    renderTicketCard,
    renderDossierDrawer,
  } = useKeepersTicketsDomain({
    domain: "spoke",
    userRole,
    masonProfileId,
    onEditMetadata,
  });

  const tabs = [
    {
      id: "overview",
      label: t("overview", "Overview"),
      icon: t("icon_dashboard", "dashboard"),
      number: activeTickets.length.toString(),
    },
    {
      id: "new",
      label: t("new", "New"),
      icon: t("icon_new_releases", "new_releases"),
      number: newTickets.length.toString(),
      colorClass: "text-[var(--danger)]",
    },
    {
      id: "pending",
      label: t("ticket_tab_claimed", "Claimed"),
      icon: t("icon_assignment_ind", "assignment_ind"),
      number: claimedTickets.length.toString(),
      colorClass: "text-[var(--warning)]",
    },
    {
      id: "closed",
      label: t("resolved", "Resolved"),
      icon: t("icon_check_circle", "check_circle"),
      number: resolvedTickets.length.toString(),
      colorClass: "text-[var(--success)]",
    },
    {
      id: "settings",
      label: t("settings", "Settings"),
      icon: t("icon_settings", "settings"),
      number: settingsCount.toString(),
    },
  ];

  const spokeOptions = useMemo(() => {
    const map = new Map<string, string>();
    spokesList.forEach((s) => map.set(s.id, s.name));
    activeTickets.concat(resolvedTickets).forEach((tk) => {
      const sid = extractTicketSpokeId(tk);
      if (sid && !map.has(sid)) {
        map.set(sid, extractTicketSpokeName(tk, spokesMap) || sid);
      }
    });
    return [
      { id: "all", label: t("audit_scope_spokes", "Partner Spokes") },
      ...Array.from(map.entries()).map(([id, label]) => ({ id, label })),
    ];
  }, [activeTickets, resolvedTickets, spokesList, spokesMap, t]);

  const listTickets = useMemo(() => {
    const source =
      activeTab === "new"
        ? newTickets
        : activeTab === "pending"
          ? claimedTickets
          : activeTab === "closed"
            ? resolvedTickets
            : [];

    return source.filter((tk) => {
      if (spokeFilter !== "all" && extractTicketSpokeId(tk) !== spokeFilter) {
        return false;
      }
      if (categoryFilter !== "all") {
        const cat = String(tk.ticket_type || tk.category || "GENERAL");
        if (cat !== categoryFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const spokeName = extractTicketSpokeName(tk, spokesMap).toLowerCase();
        if (
          !(
            tk.title?.toLowerCase().includes(q) ||
            tk.description?.toLowerCase().includes(q) ||
            tk.author_username?.toLowerCase().includes(q) ||
            spokeName.includes(q)
          )
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    activeTab,
    categoryFilter,
    claimedTickets,
    newTickets,
    resolvedTickets,
    searchQuery,
    spokeFilter,
    spokesMap,
  ]);

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
      : activeTab !== "overview"
        ? {
            icon: t("icon_tune", "tune"),
            label: t("filters", "Filters"),
            content: (
              <div className="flex flex-col w-[320px] p-4 max-w-[calc(100vw-40px)] gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("sidebar_partner_spokes", "Partner Spokes")}
                  </span>
                  <CustomDropdown
                    flat={true}
                    variant="pill"
                    value={spokeFilter}
                    onChange={(v: string[]) => setSpokeFilter(v[0] || "all")}
                    options={spokeOptions}
                    disableTint={true}
                  />
                </div>
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
              </div>
            ),
          }
        : undefined;

  return (
    <ElevatedHubLayout
      headerTitle={t("keepers_tab_spoke_support", "Spoke Support")}
      headerSubtitle={t(
        "keepers_spoke_support_subtitle",
        "Manage partner spoke escalations and community support routing."
      )}
      headerIcon={t("icon_hub", "hub")}
      headerIconColorClass="text-[var(--accent)]"
      search={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder={t("nav_search", "Search...")}
      hideSearch={activeTab === "overview"}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as FiveTabId);
        setSpokeFilter("all");
        setCategoryFilter("all");
      }}
      primaryPopover={primaryPopover}
      actions={
        activeTab === "settings"
          ? [
              {
                id: "add_cat",
                icon: t("icon_add", "add"),
                label: t("support_add_cat", "Add Category"),
                onClick: () => openCatRef.current?.(),
              },
            ]
          : undefined
      }
    >
      {activeTab === "settings" ? (
        <KeeperSupportSettings
          embedded={true}
          supportDomain="spoke"
          externalSearch={searchQuery}
          statusFilter={settingsStatusFilter}
          openCatRef={openCatRef}
          onCountsChange={setSettingsCount}
          onSavedCategories={fetchTickets}
        />
      ) : activeTab === "overview" ? (
        <HubOverviewLanding>
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
            isEmpty={claimedTickets.length === 0}
            emptyState={
              <EmptyState
                icon={t("icon_done_all", "done_all")}
                title={t("no_claimed_tickets", "No Claimed Tickets")}
                className="py-8"
              />
            }
          >
            {claimedTickets.slice(0, 6).map(renderTicketCard)}
          </HubOverviewSection>

          <HubOverviewSection
            title={t("keepers_spoke_escalations", "Partner Spoke Escalations")}
            icon={t("icon_hub", "hub")}
            iconColorClass="text-[var(--accent)]"
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
            isEmpty={newTickets.length === 0}
            emptyState={
              <EmptyState
                icon={t("icon_support_agent", "support_agent")}
                title={t("no_tickets", "No Support Tickets")}
                className="py-8"
              />
            }
          >
            {newTickets.slice(0, 6).map(renderTicketCard)}
          </HubOverviewSection>
        </HubOverviewLanding>
      ) : isLoading ? (
        <EmptyState
          icon={t("icon_sync", "sync")}
          title={t("ui_btn_processing", "Processing...")}
        />
      ) : (
        <HubListGrid
          isEmpty={listTickets.length === 0}
          emptyIcon={
            searchQuery
              ? t("icon_search_off", "search_off")
              : t("icon_support_agent", "support_agent")
          }
          emptyTitle={
            searchQuery
              ? t("no_matches", "No matches found")
              : t("no_tickets", "No Support Tickets")
          }
        >
          {listTickets.map(renderTicketCard)}
        </HubListGrid>
      )}

      {renderDossierDrawer()}
    </ElevatedHubLayout>
  );
}
