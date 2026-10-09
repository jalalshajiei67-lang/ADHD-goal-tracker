"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Registers the service worker and follows its "navigate" messages (notification taps). */
export function ServiceWorker() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });

    function onMessage(event: MessageEvent) {
      const { type, url } = (event.data ?? {}) as { type?: string; url?: string };
      if (type === "navigate" && typeof url === "string" && url.startsWith("/")) {
        router.push(url);
        router.refresh();
      } else if (type === "refresh") {
        router.refresh();
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
