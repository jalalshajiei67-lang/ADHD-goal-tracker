"use client";

import { useEffect, useState } from "react";
import { EnablePush } from "@/components/enable-push";
import { TestPushButton } from "./test-push-button";

/**
 * Check-ins go to one device: whichever subscribed last. This compares that device's
 * endpoint with this browser's own subscription, so any device can take over.
 */
export function PushStatus({ serverEndpoint }: { serverEndpoint: string | null }) {
  const [thisDevice, setThisDevice] = useState<boolean | null>(null);

  useEffect(() => {
    if (!serverEndpoint || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setThisDevice(sub?.endpoint === serverEndpoint))
      .catch(() => setThisDevice(false));
  }, [serverEndpoint]);

  if (!serverEndpoint) return <EnablePush compact />;
  if (thisDevice === null) return <p className="text-muted">Checking this device…</p>;
  if (thisDevice) return <TestPushButton />;
  return (
    <EnablePush
      compact
      label="Use this device instead"
      intro="Check-ins currently go to another device."
    />
  );
}
