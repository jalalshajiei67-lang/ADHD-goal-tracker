import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      <div>
        <h1 className="text-3xl font-bold">PriorityPulse</h1>
        <p className="mt-2 text-muted">One goal at a time. It checks in, so you don&apos;t have to remember.</p>
      </div>
      <Suspense>
        <LoginFormWithNext searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LoginFormWithNext({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : "/"} />;
}
