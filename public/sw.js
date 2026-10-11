// PriorityPulse service worker: shows pushes and handles notification taps.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : null;
  } catch (err) {
    console.error("push: bad payload", err);
  }
  if (!data) return;

  const basic = {
    body: data.body,
    icon: "/icons/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/", goalId: data.goalId || null },
  };
  const full = {
    ...basic,
    badge: "/icons/badge-96.png",
    renotify: data.tag === "checkin",
    requireInteraction: Boolean(data.requireInteraction),
    actions: data.actions || [],
    vibrate: data.tag === "checkin" ? [500, 250, 500, 250, 500, 250, 500] : [80, 40, 80],
    silent: false,
  };

  // Browsers differ in which options they accept (Firefox has no action buttons, for one).
  // If the full notification is rejected, still show a plain one: tapping it opens the check-in screen.
  event.waitUntil(
    self.registration.showNotification(data.title, full).catch((err) => {
      console.error("push: full notification failed, showing basic one", err);
      return self.registration.showNotification(data.title, basic);
    }),
  );
});

// Bring an open app window to `url`, or open a new one. Tries, in order:
// 1. client.navigate() on a window this worker controls (works in Chrome and Firefox),
// 2. a "navigate" message to the page (for windows not controlled yet, e.g. right after an update),
// 3. clients.openWindow().
async function openUrl(url) {
  const target = new URL(url, self.location.origin);
  const sameOrigin = (c) => new URL(c.url).origin === target.origin;

  const controlled = (await self.clients.matchAll({ type: "window" })).filter(sameOrigin);
  const all = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter(
    sameOrigin,
  );
  console.log("notificationclick: open", target.pathname, {
    controlled: controlled.length,
    all: all.length,
  });

  const client = controlled.find((c) => c.focused) || controlled[0];
  if (client) {
    try {
      // Focus first: browsers only allow it while the click is still "fresh".
      await client.focus().catch((err) => console.warn("notificationclick: focus failed", err));
      await client.navigate(target.href);
      console.log("notificationclick: navigated existing window");
      return;
    } catch (err) {
      console.warn("notificationclick: navigate() failed", err);
    }
  }

  const other = all[0];
  if (other) {
    other.postMessage({ type: "navigate", url: target.pathname + target.search });
    await other.focus().catch(() => {});
    console.log("notificationclick: asked page to navigate");
    return;
  }

  console.log("notificationclick: opening new window");
  return self.clients.openWindow(target.href);
}

async function acknowledge(goalId, response) {
  const res = await fetch("/api/checkin/ack", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goalId, response, source: "notification" }),
  });
  if (!res.ok) throw new Error(`ack failed: ${res.status}`);
  // Let any open app window show the new state (e.g. the next goal).
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: "refresh" });
}

self.addEventListener("notificationclick", (event) => {
  const { url, goalId } = event.notification.data || {};
  event.notification.close();

  // Only "done" is answered from the notification (see messages.checkin). Any other tap,
  // including "not_yet" from notifications sent before that change, opens the check-in screen.
  if (goalId && event.action === "done") {
    // If the ack fails (offline, logged out), fall back to opening the check-in screen.
    event.waitUntil(acknowledge(goalId, event.action).catch(() => openUrl(url)));
    return;
  }
  event.waitUntil(openUrl(url || "/"));
});
