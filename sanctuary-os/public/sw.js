const CACHE_NAME = "sanctuary-os-pwa-v12";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: "Sanctuary OS",
        body: event.data.text(),
      };
    }
  }

  const title = payload.title || "Sanctuary OS";
  const body = payload.body || "New Sanctuary OS dispatch.";
  const actionTypeId = String(payload.actionTypeId || "GEN");
  const isUrgent =
    actionTypeId === "PASSKEY_HANDSHAKE" ||
    actionTypeId === "DEFCON" ||
    actionTypeId === "ALERT_BANNER";
  const tag =
    payload.tag ||
    payload.uniqueId ||
    `sanctuary_push_${actionTypeId}_${Date.now()}`;
  const rawSpokeId = String(payload.data?.spokeId || "").trim().toLowerCase();
  const basePath =
    rawSpokeId && rawSpokeId !== "global" ? `/${rawSpokeId}` : "/sims4";
  let targetUrl =
    payload.url ||
    (actionTypeId === "PASSKEY_HANDSHAKE"
      ? `${basePath}?open_passkey_handshake=1`
      : `${basePath}?open_notifications=1`);
  if (targetUrl.startsWith("/?")) {
    targetUrl = `${basePath}${targetUrl.slice(1)}`;
  }

  const notifOptions = {
    body,
    icon: "/pwa-192x192.png?v=sovereign_v8",
    badge: "/pwa-192x192.png?v=sovereign_v8",
    tag,
    renotify: true,
    requireInteraction: isUrgent,
    vibrate: isUrgent ? [200, 100, 200] : [150, 75, 150],
    data: {
      actionTypeId,
      url: targetUrl,
      ...(payload.data || {}),
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, notifOptions),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            client.postMessage({
              type: "SANCTUARY_PUSH_RECEIVED",
              data: {
                actionTypeId,
                ...(payload.data || {}),
              },
            });
          }
        })
        .catch(() => {}),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const actionTypeId = String(notifData.actionTypeId || "");
  const rawSpokeId = String(notifData.spokeId || "").trim().toLowerCase();
  const basePath =
    rawSpokeId && rawSpokeId !== "global" ? `/${rawSpokeId}` : "/sims4";
  let targetUrl =
    notifData.url ||
    (actionTypeId === "PASSKEY_HANDSHAKE"
      ? `${basePath}?open_passkey_handshake=1`
      : `${basePath}?open_notifications=1`);
  if (targetUrl.startsWith("/?")) {
    targetUrl = `${basePath}${targetUrl.slice(1)}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          try {
            const clientUrl = new URL(client.url);
            if (
              (clientUrl.pathname === "/" || clientUrl.pathname === "/index.html") &&
              "navigate" in client
            ) {
              await client.navigate(new URL(targetUrl, self.location.origin).href);
              return client.focus();
            }
          } catch {}
          client.postMessage({
            type: "SANCTUARY_NOTIFICATION_CLICK",
            data: notifData,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(new URL(targetUrl, self.location.origin).href);
      }
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    return;
  }

  // Never intercept Supabase API/Realtime or Vite HMR endpoints
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/__") ||
    url.pathname.includes("@vite") ||
    url.pathname.includes("node_modules")
  ) {
    return;
  }

  // Network-first with cache fallback for navigations and same-origin assets
  if (req.mode === "navigate" || url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => {
            if (cached) return cached;
            if (req.mode === "navigate") {
              return caches.match("/index.html");
            }
            return Response.error();
          })
        )
    );
  }
});
