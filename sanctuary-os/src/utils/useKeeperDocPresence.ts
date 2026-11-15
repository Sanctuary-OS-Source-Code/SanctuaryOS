import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseAuth } from "../supabase";

export interface KeeperDocPresenceEntry {
  sessionId: string;
  userId: string;
  username: string;
  docKey: string | null;
  docTitle?: string;
  hasUnsavedChanges: boolean;
  heartbeatAt: number;
}

export interface KeeperDocSavedBroadcast {
  docKey: string;
  revision: number;
  updatedBy: string;
  updatedAt: string;
  published: boolean;
  senderSessionId: string;
}

const PRESENCE_STALE_MS = 180_000;
const HEARTBEAT_INTERVAL_MS = 45_000;

function generateClientSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback below
  }
  return `keeper_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useKeeperDocPresence(options: {
  enabled?: boolean;
  userId?: string | null;
  username?: string;
  onRemoteDocSaved?: (event: KeeperDocSavedBroadcast) => void;
}) {
  const { enabled = true, userId, username, onRemoteDocSaved } = options;

  const clientSessionIdRef = useRef<string>(generateClientSessionId());
  const channelRef = useRef<ReturnType<typeof supabaseAuth.channel> | null>(null);
  const subscribedRef = useRef<boolean>(false);
  const onRemoteSavedRef = useRef(onRemoteDocSaved);
  onRemoteSavedRef.current = onRemoteDocSaved;

  const activeTrackingRef = useRef<{
    docKey: string | null;
    docTitle?: string;
    hasUnsavedChanges: boolean;
  }>({
    docKey: null,
    docTitle: undefined,
    hasUnsavedChanges: false,
  });

  const userIdRef = useRef(userId || "anon");
  const usernameRef = useRef(username || "Keeper");
  userIdRef.current = userId || "anon";
  usernameRef.current = username || "Keeper";

  const [peersByDocKey, setPeersByDocKey] = useState<
    Record<string, KeeperDocPresenceEntry[]>
  >({});

  const rebuildPeersMap = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) {
      setPeersByDocKey({});
      return;
    }
    try {
      const rawState = channel.presenceState() as Record<string, any[]>;
      const now = Date.now();
      const grouped: Record<string, KeeperDocPresenceEntry[]> = {};
      const seenSessions = new Set<string>();

      for (const key of Object.keys(rawState || {})) {
        const metas = rawState[key];
        if (!Array.isArray(metas)) continue;
        for (const meta of metas) {
          if (!meta || typeof meta !== "object") continue;
          const sid = String(meta.sessionId || key || "");
          if (!sid || sid === clientSessionIdRef.current) continue;
          const docKey = typeof meta.docKey === "string" ? meta.docKey : null;
          if (!docKey) continue;
          const heartbeatAt = Number(meta.heartbeatAt || 0);
          if (heartbeatAt > 0 && now - heartbeatAt > PRESENCE_STALE_MS) continue;
          if (seenSessions.has(`${docKey}::${sid}`)) continue;
          seenSessions.add(`${docKey}::${sid}`);

          if (!grouped[docKey]) grouped[docKey] = [];
          grouped[docKey].push({
            sessionId: sid,
            userId: String(meta.userId || "keeper"),
            username: String(meta.username || "Keeper"),
            docKey,
            docTitle: typeof meta.docTitle === "string" ? meta.docTitle : undefined,
            hasUnsavedChanges: Boolean(meta.hasUnsavedChanges),
            heartbeatAt: heartbeatAt || now,
          });
        }
      }

      setPeersByDocKey(grouped);
    } catch {
      // Safe fallback when offline
    }
  }, []);

  const pushPresenceTrack = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current) return;
    const current = activeTrackingRef.current;
    try {
      if (!current.docKey) {
        await channel.untrack();
        return;
      }
      const payload: KeeperDocPresenceEntry = {
        sessionId: clientSessionIdRef.current,
        userId: userIdRef.current,
        username: usernameRef.current,
        docKey: current.docKey,
        docTitle: current.docTitle,
        hasUnsavedChanges: current.hasUnsavedChanges,
        heartbeatAt: Date.now(),
      };
      await channel.track(payload);
    } catch {
      // Ignore realtime errors when offline
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPeersByDocKey({});
      return;
    }

    let isDisposed = false;
    let channel: ReturnType<typeof supabaseAuth.channel> | null = null;

    try {
      channel = supabaseAuth.channel("keepers_web_landing_collab", {
        config: {
          presence: { key: clientSessionIdRef.current },
        },
      });
      channelRef.current = channel;

      channel
        .on("presence", { event: "sync" }, () => {
          if (!isDisposed) rebuildPeersMap();
        })
        .on("broadcast", { event: "doc_saved" }, ({ payload }: { payload: any }) => {
          if (isDisposed || !payload || typeof payload !== "object") return;
          if (payload.senderSessionId === clientSessionIdRef.current) return;
          onRemoteSavedRef.current?.(payload as KeeperDocSavedBroadcast);
        })
        .subscribe((status: string) => {
          if (isDisposed) return;
          if (status === "SUBSCRIBED") {
            subscribedRef.current = true;
            if (activeTrackingRef.current.docKey) {
              void pushPresenceTrack();
            }
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            subscribedRef.current = false;
          }
        });
    } catch {
      // Offline / network disabled
    }

    const heartbeatTimer = setInterval(() => {
      if (!isDisposed && activeTrackingRef.current.docKey && subscribedRef.current) {
        void pushPresenceTrack();
      }
      if (!isDisposed) rebuildPeersMap();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      isDisposed = true;
      subscribedRef.current = false;
      clearInterval(heartbeatTimer);
      if (channel) {
        try {
          void channel.untrack();
          void supabaseAuth.removeChannel(channel);
        } catch {
          // Ignore teardown errors
        }
      }
      channelRef.current = null;
    };
  }, [enabled, pushPresenceTrack, rebuildPeersMap]);

  const trackDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trackEditingDoc = useCallback(
    (docKey: string | null, docTitle?: string, hasUnsavedChanges = false) => {
      activeTrackingRef.current = {
        docKey,
        docTitle,
        hasUnsavedChanges,
      };
      if (trackDebounceRef.current) {
        clearTimeout(trackDebounceRef.current);
      }
      if (!docKey) {
        void pushPresenceTrack();
        return;
      }
      trackDebounceRef.current = setTimeout(() => {
        void pushPresenceTrack();
      }, 250);
    },
    [pushPresenceTrack]
  );

  const broadcastDocSaved = useCallback(
    async (event: Omit<KeeperDocSavedBroadcast, "senderSessionId">) => {
      const channel = channelRef.current;
      if (!channel || !subscribedRef.current) return;
      try {
        await channel.send({
          type: "broadcast",
          event: "doc_saved",
          payload: {
            ...event,
            senderSessionId: clientSessionIdRef.current,
          } satisfies KeeperDocSavedBroadcast,
        });
      } catch {
        // Ignore broadcast failure when offline
      }
    },
    []
  );

  return {
    clientSessionId: clientSessionIdRef.current,
    peersByDocKey,
    trackEditingDoc,
    broadcastDocSaved,
  };
}

