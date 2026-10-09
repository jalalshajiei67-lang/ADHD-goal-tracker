"use client";

import { useState, useTransition } from "react";
import { sendTestPush } from "@/app/actions";
import { btn } from "@/components/ui";

export function TestPushButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">Check-ins come to this device.</p>
      <button
        className={btn.secondary}
        disabled={pending}
        onClick={() =>
          startTransition(async () =>
            setMessage((await sendTestPush()) ? "Sent. It should arrive in a few seconds." : "Couldn't send. Turn notifications on again."),
          )
        }
      >
        Send a test notification
      </button>
      {message && (
        <p role="status" className="text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
