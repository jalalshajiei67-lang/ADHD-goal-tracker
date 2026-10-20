import Link from "next/link";

const links = [
  { href: "/", label: "Now" },
  { href: "/goals", label: "Goals" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  return (
    <nav aria-label="Main" className="mt-auto flex justify-around border-t border-line pt-3">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-xl px-2 font-medium text-muted hover:text-foreground"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
