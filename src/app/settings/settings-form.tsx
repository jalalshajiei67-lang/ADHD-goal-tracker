"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { saveSettings, type SettingsInput } from "@/app/actions";
import { btn, card } from "@/components/ui";

const select = "min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3 text-lg";
const hours = Array.from({ length: 25 }, (_, h) => h);
const label = (h: number) => `${String(h).padStart(2, "0")}:00`;

// The zone list comes from the server: browsers and Node ship different tz databases
// (e.g. "Africa/Asmara" vs "Africa/Asmera"), so building it here would break hydration.
export function SettingsForm({ initial, zones }: { initial: SettingsInput; zones: string[] }) {
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const deviceTz = useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );

  function set<K extends keyof SettingsInput>(key: K, value: SettingsInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setMessage(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => setMessage((await saveSettings(values)) ?? "Saved."));
  }

  return (
    <form onSubmit={submit} className={`${card} flex flex-col gap-5`}>
      <h2 className="text-xl font-semibold">Schedule</h2>

      <label className="flex flex-col gap-2">
        <span className="font-medium">Timezone</span>
        <select value={values.timezone} onChange={(e) => set("timezone", e.target.value)} className={select}>
          {(zones.includes(values.timezone) ? zones : [values.timezone, ...zones]).map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {deviceTz && deviceTz !== values.timezone && (
          <button type="button" onClick={() => set("timezone", deviceTz)} className={btn.quiet}>
            Use this device&apos;s: {deviceTz}
          </button>
        )}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2">
          <span className="font-medium">Check-ins start</span>
          <select
            value={values.checkin_start_hour}
            onChange={(e) => set("checkin_start_hour", Number(e.target.value))}
            className={select}
          >
            {hours.slice(0, 24).map((h) => (
              <option key={h} value={h}>
                {label(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-medium">and stop</span>
          <select
            value={values.checkin_end_hour}
            onChange={(e) => set("checkin_end_hour", Number(e.target.value))}
            className={select}
          >
            {hours.slice(1).map((h) => (
              <option key={h} value={h}>
                {label(h)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">Ask me every</legend>
        <div className="grid grid-cols-3 gap-2">
          {[15, 30, 60].map((m) => (
            <label
              key={m}
              className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 font-medium ${
                values.checkin_interval_min === m ? "border-accent bg-accent-soft" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="interval"
                value={m}
                checked={values.checkin_interval_min === m}
                onChange={() => set("checkin_interval_min", m)}
                className="sr-only"
              />
              {m} min
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="font-medium">Ask for tomorrow&apos;s goals at</span>
        <select
          value={values.nightly_hour}
          onChange={(e) => set("nightly_hour", Number(e.target.value))}
          className={select}
        >
          {hours.slice(0, 24).map((h) => (
            <option key={h} value={h}>
              {label(h)}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={pending} className={btn.primary}>
        {pending ? "Saving…" : "Save"}
      </button>
      {message && (
        <p role="status" className="text-center text-muted">
          {message}
        </p>
      )}
    </form>
  );
}
