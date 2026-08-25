import { useState, useEffect } from "react";
import { supabase, supabaseAuth } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { useStore } from "../store";
import { SidePanel, standardButtonClass, standardDangerButtonClass, ActionButton, PanelHeaderGroup, HoverTooltip, PanelHeaderButton } from "../shared";

interface NotificationSidebarProps {
  onClose: () => void;
  onOpenPost?: (post: any) => void;
}

export default function NotificationSidebar({ onClose, onOpenPost }: NotificationSidebarProps) {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

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

    window.addEventListener('new_notification_arrived', handleNewNotification);
    return () => {
      window.removeEventListener('new_notification_arrived', handleNewNotification);
    };
  }, [userId]);

  const fetchNotifications = async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const { data: gameData, error } = await supabase.rpc('secure_fetch_notifications', { p_token: token });

    if (error) {
      console.error("NOTIFICATIONS FETCH ERROR:", error);
    }

    let allData: any[] = [];
    if (gameData) allData = [...allData, ...gameData.map((n: any) => ({ ...n, _db: 'game' }))];

    allData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    allData = allData.slice(0, 50);

    if (allData.length > 0) {
      let validNotifications = allData;
      if (localStorage.getItem("sanctuary_notify_replies") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'reply');
      }
      if (localStorage.getItem("sanctuary_notify_support") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'support_reply');
      }
      if (localStorage.getItem("sanctuary_notify_new_posts") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'new_post');
      }
      if (localStorage.getItem("sanctuary_notify_system_dispatch") === "false") {
        validNotifications = validNotifications.filter((n: any) => n.type !== 'system_broadcast');
      }
      setNotifications(validNotifications);
    } else {
      setNotifications([]);
    }
    setLoading(false);
  };

  const notifyUpdate = () => {
    window.dispatchEvent(new Event('refresh_notifications'));
  };

  const markAllRead = async () => {
    if (!userId) return;
    const gameHasUnread = notifications.some(n => !n.is_read && n._db === 'game');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (gameHasUnread) {
      await supabase.rpc('secure_mark_notifications_read', { p_token: token });
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    notifyUpdate();
  };

  const clearAll = async () => {
    if (!userId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    await supabase.rpc('secure_delete_notifications', { p_token: token });

    setNotifications([]);
    notifyUpdate();
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.is_read) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      await supabase.rpc('secure_mark_notifications_read', { p_id: notif.id, p_token: token });
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
      notifyUpdate();
    }

    if (onOpenPost && notif.reference_id) {
      const targetDb = supabase;
      let { data } = await targetDb.from("mason_posts").select("*, masons(*)").eq("id", notif.reference_id).single();
      if (!data) {
        const { data: sysData } = await targetDb.from("system_broadcasts").select("*").eq("id", notif.reference_id).single();
        if (sysData) {
          const activeSchema = useStore.getState().activeGameSchema;
          data = { ...sysData, content: sysData.message || sysData.content, mason_id: 'system', masons: { name: `${activeSchema?.display_name || activeSchema?.name || "Wayfinders"} Team` }, views: 0, likes: 0, replies: 0 };
        }
      }
      if (data) {
        onOpenPost(data);
      }
    }
  };

  const clearNotification = async (e: React.MouseEvent, id: string, db: string) => {
    e.stopPropagation();
    if (!userId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    await supabase.rpc('secure_delete_notifications', { p_id: id, p_token: token });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    notifyUpdate();
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "reply": return "forum";
      case "support_reply": return "support_agent";
      case "new_post": return "campaign";
      default: return "notifications";
    }
  };

  const getNotificationColor = (type: string, isRead: boolean) => {
    if (isRead) return "var(--subtext)";
    switch (type) {
      case "support_reply": return "var(--success, #4ade80)";
      case "system_broadcast": return "var(--danger, #ef4444)";
      default: return "var(--accent)";
    }
  };

  return (
    <SidePanel
      isOpen={true}
      onClose={onClose}
      title={t("tab_notifs")}
      icon={t("icon_notifications")}
      backdropZ="z-[15000]"
      panelZ="z-[15001]"
      headerActions={
        <PanelHeaderGroup>
          {!notifications.some(n => !n.is_read) && (
            <PanelHeaderButton
              icon="close"
              tooltip={t("nav_cancel")}
              onClick={onClose}
            />
          )}
          {notifications.some(n => !n.is_read) && (
            <PanelHeaderButton
              icon="done_all"
              tooltip={t("notif_mark_read")}
              onClick={markAllRead}
            />
          )}
          {notifications.length > 0 && (
            <PanelHeaderButton
              icon="delete_sweep"
              tooltip={t("notif_clear_all")}
              onClick={clearAll}
            />
          )}
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-3">
        {
          loading ? (
            <div className="p-12 text-center text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-50 glass-panel rounded-2xl">
              {t("loading")}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-[10px] font-black capitalize tracking-widest text-[var(--subtext)] opacity-50 glass-panel rounded-2xl">
              {t("notif_empty")}
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-5 rounded-2xl cursor-pointer transition-all duration-300 group relative shadow-lg glass-panel border border-[color-mix(in_srgb,var(--text)_5%,transparent)] ${n.is_read
                  ? "opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]"
                  : "hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] border-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
                  }`}
              >


                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center w-full pr-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[14px]" style={{ color: getNotificationColor(n.type, n.is_read) }}>
                        {getNotificationIcon(n.type)}
                      </span>
                      <span className={`text-[10px] font-black capitalize tracking-widest ${n.is_read ? 'text-[var(--text)] opacity-60' : 'theme-text-accent'}`}>
                        {n.type === "reply" ? (t("ui_btn_reply")) : n.type === "support_reply" ? (t("notif_type_support")) : n.type === "new_post" ? (t("post_broadcast")) : (t("category_system"))}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-[var(--subtext)] opacity-50 tracking-widest">
                      {formatTime(n.created_at)}
                    </span>
                  </div>

                  <div className="flex justify-between items-end mt-1">
                    <p className={`text-sm font-semibold leading-relaxed line-clamp-3 pr-2 ${n.is_read ? 'text-[var(--subtext)] opacity-80' : 'text-[var(--text)]'}`}>
                      {n.message}
                    </p>

                    <div className="relative group/closebtn flex">
                      <HoverTooltip title={t("icon_close")} variant="danger" noIcon={true} className="!hidden group-hover/closebtn:!flex !bottom-full !mb-2 !right-0 z-[60000]" />
                      <button
                        onClick={(e) => clearNotification(e, n.id, n._db)}
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-red-500 text-[var(--subtext)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                      >
                        <span className="material-symbols-outlined !text-[16px]">close</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )
        }
      </div >
    </SidePanel >
  );
}

