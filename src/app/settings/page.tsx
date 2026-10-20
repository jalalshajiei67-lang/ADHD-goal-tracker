import { Suspense } from "react";
import { logout } from "@/app/actions";
import { Nav } from "@/components/nav";
import { btn, card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { FocusMode } from "./focus-mode";
import { SettingsForm } from "./settings-form";
import { PushStatus } from "./push-status";
import { Health } from "./health";

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const user = await requireUser();
  const focusUntil =
    user.focus_until && new Date(user.focus_until) > new Date() ? user.focus_until : null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <section className={`${card} flex flex-col gap-4`}>
        <h2 className="text-xl font-semibold">Notifications</h2>
        <PushStatus serverEndpoint={user.push_subscription?.endpoint ?? null} />
        {user.push_subscription && (
          <Health lastTickAt={user.last_tick_at} lastPushAt={user.last_push_at} />
        )}
      </section>

      <FocusMode focusUntil={focusUntil} />

      <SettingsForm
        zones={Intl.supportedValuesOf("timeZone")}
        initial={{
          timezone: user.timezone,
          nightly_hour: user.nightly_hour,
          checkin_start_hour: user.checkin_start_hour,
          checkin_end_hour: user.checkin_end_hour,
          checkin_interval_min: user.checkin_interval_min,
        }}
      />

      <form action={logout}>
        <button className={btn.secondary}>Log out</button>
      </form>
      <Nav />
    </div>
  );
}
