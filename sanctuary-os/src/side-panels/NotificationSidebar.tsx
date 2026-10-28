import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase, supabaseAuth, getSpokeClientById } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  PanelHeaderGroup,
  HoverTooltip,
  PanelHeaderButton,
  DashboardStatTile,
  StatTileCarousel,
  EmptyState,
  SidePanelHeroCard,
  UniversalGroup,
} from "../shared";
import { UniversalCard } from "../components/universal/UniversalCard";
import {
  fetchUnifiedSanctuaryNotifications,
  markHubNotificationRead,
  markAllHubNotificationsRead,
  dismissHubNotification,
  dismissAllHubNotifications,
} from "../utils/notificationHelper";

interface NotificationSidebarProps {
  onClose: () => void;
  onOpenPost?: (post: any) => void;
}

export default function NotificationSidebar({
  onClose,
  onOpenPost,
}: NotificationSidebarProps) {
  const { t } = useLexicon();
  const session = useStore((state: any) => state.session);
  const activeWorkspaceId = useStore((state: any) => state.activeWorkspaceId);
  const workspaces = useStore((state: any) => state.workspaces);
  const activeGameSchema = useStore((state: any) => state.activeGameSchema);
  const setView = useStore((state: any) => state.setView);
  const setIsConfigured = useStore((state: any) => state.setIsConfigured);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "foundry" | "spoke">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const activeSession = sessionData?.session || session;

      const unified = await fetchUnifiedSanctuaryNotifications({
        supabase,
        supabaseAuth,
        session: activeSession,
        activeWorkspaceId: activeWorkspaceId || undefined,
        workspaces,
      });

      setNotifications(unified.slice(0, 60));
    } catch (err) {
      console.error("NOTIFICATIONS FETCH ERROR:", err);
    } finally {
      setLoading(false);
    }
  }, [session, activeWorkspaceId, workspaces]);

  useEffect(() => {
    fetchNotifications();

    const handleNewNotification = () => {
      fetchNotifications();
    };

    window.addEventListener("new_notification_arrived", handleNewNotification);
    window.addEventListener("refresh_notifications", handleNewNotification);
    window.addEventListener(
      "sanctuary_notification_prefs_changed",
      handleNewNotification
    );
    return () => {
      window.removeEventListener(
        "new_notification_arrived",
        handleNewNotification
      );
      window.removeEventListener("refresh_notifications", handleNewNotification);
      window.removeEventListener(
        "sanctuary_notification_prefs_changed",
        handleNewNotification
      );
    };
  }, [fetchNotifications]);

  const notifyUpdate = () => {
    window.dispatchEvent(new Event("refresh_notifications"));
  };

  const markAllRead = async () => {
    const unreadItems = notifications.filter((n) => !n.is_read);
    if (unreadItems.length === 0) return;

    const hubIds = unreadItems
      .filter((n) => n._source === "hub_broadcast")
      .map((n) => String(n.id));
    if (hubIds.length > 0) {
      markAllHubNotificationsRead(hubIds);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (token) {
      const spokeIds = Array.from(
        new Set(
          unreadItems
            .filter((n) => n._source === "spoke_db" && n._spokeId)
            .map((n) => String(n._spokeId))
        )
      );

      await Promise.all(
        spokeIds.map(async (spokeId) => {
          try {
            await supabase.rpc("secure_mark_all_notifications_read", {
              p_token: token,
              p_game_id: spokeId,
            });
          } catch {}
        })
      );
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    notifyUpdate();
  };

  const clearAll = async () => {
    if (notifications.length === 0) return;

    const hubIds = notifications
      .filter((n) => n._source === "hub_broadcast")
      .map((n) => String(n.id));
    if (hubIds.length > 0) {
      dismissAllHubNotifications(hubIds);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (token) {
      const spokeIds = Array.from(
        new Set(
          notifications
            .filter((n) => n._source === "spoke_db" && n._spokeId)
            .map((n) => String(n._spokeId))
        )
      );

      await Promise.all(
        spokeIds.map(async (spokeId) => {
          try {
            await supabase.rpc("secure_delete_all_notifications", {
              p_token: token,
              p_game_id: spokeId,
            });
          } catch {}
        })
      );
    }

    setNotifications([]);
    notifyUpdate();
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.is_read) {
      if (notif._source === "hub_broadcast") {
        markHubNotificationRead(String(notif.id));
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          await supabase.rpc("secure_mark_notifications_read", {
            p_id: notif.id,
            p_token: token,
            p_game_id: notif._spokeId,
          });
        }
      }
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      notifyUpdate();
    }

    if (notif._rawPost && onOpenPost) {
      const authorLabel =
        notif._spokeId === "global"
          ? t("author_sanctuary_team", "Sanctuary Foundry")
          : `${
              notif._spokeName ||
              activeGameSchema?.display_name ||
              activeGameSchema?.name ||
              "Wayfinders"
            } Team`;
      onOpenPost({
        ...notif._rawPost,
        content: notif._rawPost.message || notif._rawPost.content || "",
        mason_id: "system",
        masons: {
          name: authorLabel,
        },
        views: 0,
        likes: 0,
        replies: 0,
      });
      return;
    }

    if (notif.type === "patch_update_logs") {
      onClose();
      setIsConfigured(false);
      setView("dashboard");
      setTimeout(() => {
        window.location.hash = "release_notes";
      }, 80);
      return;
    }

    if (onOpenPost && notif.reference_id) {
      const targetSpokeClient =
        notif._spokeId && notif._spokeId !== "global"
          ? (await getSpokeClientById(notif._spokeId)) || supabase
          : supabase;

      let { data } = await targetSpokeClient
        .from("mason_posts")
        .select("*, masons(*)")
        .eq("id", notif.reference_id)
        .maybeSingle();

      if (!data) {
        const { data: sysData } = await targetSpokeClient
          .from("system_broadcasts")
          .select("*")
          .eq("id", notif.reference_id)
          .maybeSingle();
        if (sysData) {
          data = {
            ...sysData,
            content: sysData.message || sysData.content,
            mason_id: "system",
            masons: {
              name: `${
                notif._spokeName ||
                activeGameSchema?.display_name ||
                activeGameSchema?.name ||
                "Wayfinders"
              } Team`,
            },
            views: 0,
            likes: 0,
            replies: 0,
          };
        }
      }
      if (data) {
        onOpenPost(data);
      }
    }
  };

  const clearNotification = async (e: React.MouseEvent, notif: any) => {
    e.stopPropagation();
    if (notif._source === "hub_broadcast") {
      dismissHubNotification(String(notif.id));
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        await supabase.rpc("secure_delete_notifications", {
          p_id: notif.id,
          p_token: token,
          p_game_id: notif._spokeId,
        });
      }
    }
    setNotifications((prev) =>
      prev.filter(
        (n) => !(n.id === notif.id && n._spokeId === notif._spokeId)
      )
    );
    notifyUpdate();
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return (
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "keepers_news":
        return t("icon_campaign", "campaign");
      case "patch_update_logs":
        return t("icon_new_releases", "new_releases");
      case "alert_banner":
        return t("icon_warning", "warning");
      case "reply":
        return t("icon_forum", "forum");
      case "support_reply":
        return t("icon_support_agent", "support_agent");
      case "new_post":
        return t("icon_post_add", "post_add");
      default:
        return t("icon_notifications", "notifications");
    }
  };

  const getNotificationVariantVar = (type: string, isRead: boolean) => {
    if (isRead) return "--subtext";
    switch (type) {
      case "support_reply":
        return "--success";
      case "patch_update_logs":
        return "--success";
      case "alert_banner":
        return "--danger";
      case "system_broadcast":
        return "--warning";
      default:
        return "--accent";
    }
  };

  const getNotificationBadgeLabel = (type: string) => {
    switch (type) {
      case "keepers_news":
        return t("notify_keepers_news", "Keepers News");
      case "patch_update_logs":
        return t("notify_patch_update_logs", "Update Log");
      case "alert_banner":
        return t("notify_badge_global_alert", "Global Alert");
      case "reply":
        return t("ui_btn_reply", "Reply");
      case "support_reply":
        return t("notif_type_support", "Support");
      case "new_post":
        return t("post_broadcast", "New {Dispatch}");
      default:
        return t("category_system", "System");
    }
  };

  const parseCardContent = (n: any, badgeLabel: string) => {
    const spokeLabel =
      n._spokeId === "global"
        ? t("author_sanctuary_team", "Sanctuary Foundry")
        : n._spokeName || t("notify_scope_global_short", "Global");

    const rawMsg = String(n.message || "").trim();

    if (n.title && String(n.title).trim()) {
      const cleanTitle = String(n.title).trim();
      let cleanBody = rawMsg;
      if (cleanBody.startsWith(`${cleanTitle}:`)) {
        cleanBody = cleanBody.slice(cleanTitle.length + 1).trim();
      } else if (cleanBody.includes(`: `)) {
        const colonIdx = cleanBody.indexOf(": ");
        const prefix = cleanBody.slice(0, colonIdx);
        if (prefix.includes(cleanTitle) || prefix.includes("Sanctuary Foundry")) {
          cleanBody = cleanBody.slice(colonIdx + 2).trim();
        }
      }
      return {
        cardTitle: cleanTitle,
        cardSubtitle: `${spokeLabel} • ${badgeLabel}`,
        cardBody: cleanBody || rawMsg,
      };
    }

    const colonIdx = rawMsg.indexOf(":");
    if (colonIdx > 0 && colonIdx < 95) {
      const senderPart = rawMsg.slice(0, colonIdx).trim();
      const subjectPart = rawMsg.slice(colonIdx + 1).trim();
      const cleanSender = senderPart
        .replace(/\s+has\s+(?:posted|broadcasted|published)\s+.*$/i, "")
        .trim();
      if (subjectPart) {
        return {
          cardTitle: subjectPart,
          cardSubtitle: `${cleanSender || spokeLabel} • ${badgeLabel}`,
          cardBody: rawMsg,
        };
      }
    }

    return {
      cardTitle: badgeLabel,
      cardSubtitle: spokeLabel,
      cardBody: rawMsg,
    };
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const foundryCount = useMemo(
    () => notifications.filter((n) => n._spokeId === "global").length,
    [notifications]
  );

  const activeSpokeCount = useMemo(
    () =>
      notifications.filter(
        (n) =>
          Boolean(activeWorkspaceId) &&
          activeWorkspaceId !== "default_workspace" &&
          n._spokeId === activeWorkspaceId
      ).length,
    [notifications, activeWorkspaceId]
  );

  const visibleNotifications = useMemo(() => {
    let list = notifications;
    if (filterTab === "foundry") {
      list = list.filter((n) => n._spokeId === "global");
    } else if (filterTab === "spoke") {
      list = list.filter(
        (n) =>
          Boolean(activeWorkspaceId) &&
          activeWorkspaceId !== "default_workspace" &&
          n._spokeId === activeWorkspaceId
      );
    }
    if (unreadOnly) {
      list = list.filter((n) => !n.is_read);
    }
    return list;
  }, [notifications, filterTab, unreadOnly, activeWorkspaceId]);

  const activeSpokeLabel =
    activeGameSchema?.display_name ||
    activeGameSchema?.name ||
    t("notif_tab_active_spoke", "Active Spoke");

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={t("tab_notifs", "Notifications")}
      subtitle={`${unreadCount} ${t("unread", "Unread")} • ${notifications.length} ${t("notif_total_label", "Total")}`}
      icon={t("icon_notifications", "notifications")}
      iconColorClass="theme-text-accent"
      widthClass="w-[92vw] md:w-[760px]"
      backdropZ="z-[15000]"
      panelZ="z-[15001]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_mark_email_unread", "mark_email_unread")}
            tooltip={t("unread", "Unread")}
            isActive={unreadOnly}
            onClick={() => setUnreadOnly((prev) => !prev)}
          />
          {notifications.some((n) => !n.is_read) && (
            <PanelHeaderButton
              icon={t("icon_done_all", "done_all")}
              tooltip={t("notif_mark_read", "Mark All Read")}
              onClick={markAllRead}
            />
          )}
          {notifications.length > 0 && (
            <PanelHeaderButton
              icon={t("icon_delete_sweep", "delete_sweep")}
              tooltip={t("nav_clear_all", "Clear All")}
              variant="danger"
              onClick={clearAll}
            />
          )}
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_notifications", "notifications")}
          overline={t("tab_notifs", "Notifications")}
          description={t(
            "notif_hero_desc",
            "Live transmissions from creator dispatches, support tickets, and system broadcasts."
          )}
          badge={`${unreadCount} ${t("unread", "Unread")}`}
          badgeIcon={
            unreadCount > 0
              ? t("icon_notifications_active", "notifications_active")
              : t("icon_check_circle", "check_circle")
          }
          variant={unreadCount > 0 ? "accent" : "success"}
        />

        {/* 3-Tab Source Filter: Global [All] / OS [Foundry] / Active Spoke [Spoke] */}
        <StatTileCarousel innerClassName="px-0">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_public", "public")}
            label={t("notif_tab_global_all", "Global [All]")}
            value={String(notifications.length)}
            isActive={filterTab === "all"}
            onClick={() => setFilterTab("all")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_shield", "shield")}
            label={t("notif_tab_os_foundry", "OS [Foundry]")}
            value={String(foundryCount)}
            isActive={filterTab === "foundry"}
            onClick={() => setFilterTab("foundry")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_sports_esports", "sports_esports")}
            label={activeSpokeLabel}
            value={String(activeSpokeCount)}
            isActive={filterTab === "spoke"}
            onClick={() => setFilterTab("spoke")}
          />
        </StatTileCarousel>

        {loading ? (
          <div className="glass-panel rounded-2xl p-12 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined animate-spin !text-[24px] text-[var(--accent)]">
              {t("icon_sync", "sync")}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--subtext)]">
              {t("loading", "Loading...")}
            </span>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <EmptyState
              icon={t("icon_notifications_off", "notifications_off")}
              title={t("notif_empty", "No Notifications")}
            />
          </div>
        ) : (
          <UniversalGroup
            title={`${t("tab_notifs", "Notifications")} (${visibleNotifications.length})`}
            icon={t("icon_notifications", "notifications")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              {visibleNotifications.map((n) => {
                const colorVar = getNotificationVariantVar(n.type, n.is_read);
                const badgeLabel = getNotificationBadgeLabel(n.type);
                const { cardTitle, cardSubtitle, cardBody } = parseCardContent(
                  n,
                  badgeLabel
                );
                const statusColorKey =
                  colorVar === "--danger"
                    ? "danger"
                    : colorVar === "--warning"
                      ? "warning"
                      : colorVar === "--success"
                        ? "success"
                        : "accent";

                const originShort =
                  n._spokeId === "global"
                    ? t("notif_origin_foundry", "Foundry")
                    : n._spokeName || t("notify_scope_global_short", "Global");

                return (
                  <UniversalCard
                    key={`${n._spokeId || "global"}-${n.id}`}
                    layout="vertical"
                    icon={getNotificationIcon(n.type)}
                    isActive={!n.is_read}
                    statusColor={statusColorKey}
                    title={cardTitle}
                    subtitle={cardSubtitle}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full h-full ${
                      n.is_read ? "opacity-80 hover:opacity-100" : ""
                    }`}
                    imageOverlay={
                      <div className="absolute top-2.5 inset-x-3 flex items-center justify-between gap-2 z-30 pointer-events-none">
                        {/* Single-line combined Origin + Category badge so it never wraps over the top-12 inner mini-console */}
                        <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 min-w-0 max-w-[calc(100%-2.25rem)] pointer-events-auto">
                          <span
                            className="material-symbols-rounded !text-[12px] shrink-0"
                            style={{ color: `var(${colorVar})` }}
                          >
                            {getNotificationIcon(n.type)}
                          </span>
                          <span className="truncate">
                            {originShort} &bull; {badgeLabel}
                          </span>
                        </span>

                        <div className="relative group/closebtn flex shrink-0 pointer-events-auto">
                          <HoverTooltip
                            title={t("btn_close", "Dismiss")}
                            variant="danger"
                            noIcon={true}
                            className="!hidden group-hover/closebtn:!flex !bottom-full !mb-2 !right-0 z-[60000]"
                          />
                          <button
                            type="button"
                            onClick={(e) => clearNotification(e, n)}
                            className="shrink-0 w-6 h-6 rounded-lg border glass-surface border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:text-[var(--danger)] text-[var(--subtext)] flex items-center justify-center transition-colors"
                          >
                            <span className="material-symbols-rounded !text-[13px]">
                              {t("icon_close", "close")}
                            </span>
                          </button>
                        </div>
                      </div>
                    }
                    footer={
                      <div className="flex items-center justify-between w-full mt-2 gap-2">
                        <span className="text-[10px] font-mono font-bold opacity-65 text-[var(--subtext)] flex items-center gap-1.5 truncate">
                          <span className="material-symbols-outlined !text-[12px]">
                            {t("icon_schedule", "schedule")}
                          </span>
                          {formatTime(n.created_at)}
                        </span>

                        <span
                          className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shrink-0 transition-all ${
                            !n.is_read
                              ? "text-[var(--accent)]"
                              : "text-[var(--subtext)] opacity-60 group-hover/card:opacity-100 group-hover/card:text-[var(--accent)]"
                          }`}
                        >
                          <span>
                            {!n.is_read
                              ? t("unread", "Unread")
                              : t("btn_view", "View")}
                          </span>
                          <span className="material-symbols-outlined !text-[13px]">
                            {t("icon_arrow_forward", "arrow_forward")}
                          </span>
                        </span>
                      </div>
                    }
                  >
                    <p
                      className={`text-xs leading-relaxed font-medium line-clamp-3 mt-1 m-0 break-words ${
                        n.is_read
                          ? "text-[var(--subtext)] opacity-75"
                          : "text-[var(--text)] opacity-90"
                      }`}
                    >
                      {cardBody}
                    </p>
                  </UniversalCard>
                );
              })}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
