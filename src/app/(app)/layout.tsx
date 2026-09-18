import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { AppNavigation } from "@/components/app-navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-28">
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <header className="mb-8 flex items-center justify-between px-1">
          <Link className="flex items-center gap-2 text-sm font-bold tracking-[-0.03em]" href="/hoy"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--foreground)] text-xs text-white">H</span>HybridOS</Link>
          <div className="flex items-center gap-2"><Link aria-label="Ajustes" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)] text-[var(--muted)] shadow-sm" href="/ajustes"><span aria-hidden="true">•••</span></Link><form action={signOut}><button className="grid h-10 min-w-10 place-items-center rounded-full bg-[var(--surface)] px-3 text-xs text-[var(--muted)]" type="submit">Salir</button></form></div>
        </header>
        {children}
      </div>
      <AppNavigation />
    </div>
  );
}
