"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/hoy", label: "Hoy", icon: "M4 6.5h16M7 3v3.5M17 3v3.5M5 10h14v10H5z" },
  { href: "/entrenar", label: "Entrenar", icon: "M4 9v6M8 6v12M16 6v12M20 9v6M8 12h8" },
  { href: "/progreso", label: "Progreso", icon: "M4 19V9m6 10V5m6 14v-7m4 7H2" },
  { href: "/salud", label: "Salud", icon: "M12 20S4 15.5 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 15.5 12 20 12 20Z" },
] as const;

export function AppNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación principal" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-[1.75rem] bg-[#11110f] p-2 shadow-[0_18px_55px_rgba(0,0,0,0.28)] md:bottom-auto md:left-5 md:right-auto md:top-1/2 md:m-0 md:max-w-none md:-translate-y-1/2">
      <div className="grid grid-cols-4 md:flex md:flex-col">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link aria-current={active ? "page" : undefined}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-[1.35rem] px-2 text-[0.65rem] font-semibold transition-all md:min-h-14 md:w-16 ${active ? "bg-[var(--accent)] text-white shadow-[0_8px_24px_rgba(255,103,18,0.42)]" : "text-white/45 hover:text-white/80"}`}
              href={item.href} key={item.href}>
              <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
