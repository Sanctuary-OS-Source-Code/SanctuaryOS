import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  PanelHeaderGroup,
  HoverTooltip,
  PanelHeaderButton,
  DashboardStatTile,
  EmptyState,
  SidePanelHeroCard,
  UniversalGroup,
} from "../shared";
import {
  getNotificationMode,
  mapDbNotificationTypeToCategory,
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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "unread">("all");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
      }
    });
  }, []);

  useEffect(() => {
    if (userId) {
      fetchNotifications();
    }

    const handleNewNotification = () => {
      if (userId) fetchNotifications();
    };

    window.addEventListener("new_notification_arrived", handleNewNotification);
    window.addEventListener(
      "sanctuary_notification_prefs_changed",
      handleNewNotification
    );
    return () => {
      window.removeEventListener(
        "new_notification_arrived",
        handleNewNotification
      );
      window.removeEventListener(
        "sanctuary_notification_prefs_changed",
        handleNewNotification
      );
    };
  }, [userId]);

  const fetchNotifications = async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const { data: gameData, error } = await supabase.rpc(
      "secure_fetch_notifications",
      { p_token: token }
    );

    if (error) {
      console.error("NOTIFICATIONS FETCH ERROR:", error);
    }

    let allData: any[] = [];
    if (gameData)
      allData = [...allData, ...gameData.map((n: any) => ({ ...n, _db: "game" }))];

    allData.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    allData = allData.slice(0, 50);

    if (allData.length > 0) {
      const validNotifications = allData.filter((n: any) => {
        const category = mapDbNotificationTypeToCategory(n.type);
        return getNotificationMode(category) !== "NONE";
      });
      setNotifications(validNotifications);
    } else {
      setNotifications([]);
    }
    setLoading(false);
  };

  const notifyUpdate = () => {
    window.dispatchEvent(new Event("refresh_notifications"));
  };

  const markAllRead = async () => {
    if (!userId) return;
    const gameHasUnread = notifications.some(
      (n) => !n.is_read && n._db === "game"
    );

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (gameHasUnread) {
      await supabase.rpc("secure_mark_notifications_read", { p_token: token });
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    notifyUpdate();
  };

  const clearAll = async () => {
    if (!userId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    await supabase.rpc("secure_delete_notifications", { p_token: token });

    setNotifications([]);
    notifyUpdate();
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.is_read) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      await supabase.rpc("secure_mark_notifications_read", {
        p_id: notif.id,
        p_token: token,
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      notifyUpdate();
    }

    if (onOpenPost && notif.reference_id) {
      const targetDb = supabase;
      let { data } = await targetDb
        .from("mason_posts")
        .select("*, masons(*)")
        .eq("id", notif.reference_id)
        .single();
      if (!data) {
        const { data: sysData } = await targetDb
          .from("system_broadcasts")
          .select("*")
          .eq("id", notif.reference_id)
          .single();
        if (sysData) {
          const activeSchema = useStore.getState().activeGameSchema;
          data = {
            ...sysData,
            content: sysData.message || sysData.content,
            mason_id: "system",
            masons: {
              name: `${
                activeSchema?.display_name || activeSchema?.name || "Wayfinders"
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

  const clearNotification = async (
    e: React.MouseEvent,
    id: string,
    _db: string
  ) => {
    e.stopPropagation();
    if (!userId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    await supabase.rpc("secure_delete_notifications", {
      p_id: id,
      p_token: token,
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
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
      case "reply":
        return "forum";
      case "support_reply":
        return "support_agent";
      case "new_post":
        return "campaign";
      default:
        return "notifications";
    }
  };

  const getNotificationVariantVar = (type: string, isRead: boolean) => {
    if (isRead) return "--subtext";
    switch (type) {
      case "support_reply":
        return "--success";
      case "system_broadcast":
        return "--danger";
      default:
        return "--accent";
    }
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const visibleNotifications = useMemo(() => {
    if (filterMode === "unread") {
      return notifications.filter((n) => !n.is_read);
    }
    return notifications;
  }, [notifications, filterMode]);

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={t("tab_notifs", "Notifications")}
      subtitle={`${unreadCount} ${t("unread", "Unread")} • ${notifications.length} ${t("items", "Items")}`}
      icon={t("icon_notifications", "notifications")}
      iconColorClass="theme-text-accent"
      widthClass="w-[90vw] md:w-[680px]"
      backdropZ="z-[15000]"
      panelZ="z-[15001]"
      headerActions={
        notifications.some((n) => !n.is_read) || notifications.length > 0 ? (
          <PanelHeaderGroup>
            {notifications.some((n) => !n.is_read) && (
              <PanelHeaderButton
                icon="done_all"
                tooltip={t("notif_mark_read", "Mark All Read")}
                onClick={markAllRead}
              />
            )}
            {notifications.length > 0 && (
              <PanelHeaderButton
                icon="delete_sweep"
                tooltip={t("notif_clear_all", "Clear All")}
                variant="danger"
                onClick={clearAll}
              />
            )}
          </PanelHeaderGroup>
        ) : undefined
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

        <div className="grid grid-cols-2 gap-3">
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_inbox", "inbox")}
            label={t("filter_all", "All")}
            value={String(notifications.length)}
            isActive={filterMode === "all"}
            onClick={() => setFilterMode("all")}
          />
          <DashboardStatTile
            variant="filter"
            className="!w-full"
            icon={t("icon_mark_email_unread", "mark_email_unread")}
            label={t("unread", "Unread")}
            value={String(unreadCount)}
            isActive={filterMode === "unread"}
            onClick={() => setFilterMode("unread")}
          />
        </div>

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
            <div className="flex flex-col gap-3">
              {visibleNotifications.map((n) => {
                const colorVar = getNotificationVariantVar(n.type, n.is_read);
                const badgeLabel =
                  n.type === "reply"
                    ? t("ui_btn_reply", "Reply")
                    : n.type === "support_reply"
                      ? t("notif_type_support", "Support")
                      : n.type === "new_post"
                        ? t("post_broadcast", "Broadcast")
                        : t("category_system", "System");

                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`glass-surface rounded-xl p-4 cursor-pointer transition-all duration-200 group relative border flex flex-col gap-2.5 ${
                      n.is_read
                        ? "opacity-75 hover:opacity-100 border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-transparent border flex items-center gap-1.5 shrink-0"
                        style={{
                          borderColor: `color-mix(in srgb, var(${colorVar}) 42%, transparent)`,
                          color: `var(${colorVar})`,
                        }}
                      >
                        <span className="material-symbols-outlined !text-[12px]">
                          {getNotificationIcon(n.type)}
                        </span>
                        {badgeLabel}
                      </span>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75">
                          {formatTime(n.created_at)}
                        </span>
                        <div className="relative group/closebtn flex">
                          <HoverTooltip
                            title={t("btn_close", "Dismiss")}
                            variant="danger"
                            noIcon={true}
                            className="!hidden group-hover/closebtn:!flex !bottom-full !mb-2 !right-0 z-[60000]"
                          />
                          <button
                            type="button"
                            onClick={(e) => clearNotification(e, n.id, n._db)}
                            className="shrink-0 w-7 h-7 rounded-lg border bg-transparent border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:text-[var(--danger)] text-[var(--subtext)] flex items-center justify-center transition-colors"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              close
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <p
                      className={`text-xs sm:text-sm font-semibold leading-relaxed m-0 break-words ${
                        n.is_read
                          ? "text-[var(--subtext)]"
                          : "text-[var(--text)]"
                      }`}
                    >
                      {n.message}
                    </p>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}
