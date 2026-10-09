"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";
import { btn, input } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-2">
        <span className="font-medium">Passphrase</span>
        <input
          name="passphrase"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className={input}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-gentle px-4 py-3">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={btn.primary}>
        {pending ? "Opening…" : "Open"}
      </button>
    </form>
  );
}
