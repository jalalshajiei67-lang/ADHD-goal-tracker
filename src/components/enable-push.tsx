"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { btn, card } from "./ui";

type State = "checking" | "unsupported" | "install-ios" | "blocked" | "ready" | "working" | "error";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detect(): State {
  if (isIos() && !isStandalone()) return "install-ios";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "ready";
}

const noSubscribe = () => () => {};

/** Subscribes this device to push. Shown on home until a subscription exists. */
export function EnablePush({
  compact = false,
  label = "Allow notifications",
  intro = "The app nudges you, so you don't have to remember.",
}: {
  compact?: boolean;
  label?: string;
  intro?: string;
}) {
  const router = useRouter();
  const detected = useSyncExternalStore(noSubscribe, detect, () => "checking" as State);
  const [override, setState] = useState<State | null>(null);
  const state = override ?? detected;

  async function enable() {
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState("blocked");
      const reg = await navigator.serviceWorker.ready;
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setState("error");
    }
  }

  const body = {
    checking: null,
    unsupported: <p>This browser can&apos;t receive check-ins. Try Chrome on Android.</p>,
    "install-ios": (
      <p>
        First add this app to your Home Screen: tap <strong>Share</strong>, then{" "}
        <strong>Add to Home Screen</strong>. Open it from there.
      </p>
    ),
    blocked: <p>Notifications are off for this site. Turn them on in your browser settings.</p>,
    ready: null,
    working: null,
    error: <p>That didn&apos;t work. Check your connection and try again.</p>,
  }[state];

  return (
    <section className={compact ? "flex flex-col gap-3" : `${card} flex flex-col gap-4`}>
      {!compact && <h2 className="text-xl font-semibold">Turn on check-ins</h2>}
      {body ?? <p className="text-muted">{intro}</p>}
      {(state === "ready" || state === "working" || state === "error") && (
        <button onClick={enable} disabled={state === "working"} className={btn.primary}>
          {state === "working" ? "Turning on…" : label}
        </button>
      )}
    </section>
  );
}
