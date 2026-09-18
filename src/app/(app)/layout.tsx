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
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-28">
      <div className="mx-auto w-full max-w-5xl px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8">
        <header className="mb-10 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-[-0.02em]">HybridOS</span>
          <div className="flex items-center gap-4"><Link className="text-xs text-[var(--muted)]" href="/ajustes">Ajustes</Link><form action={signOut}><button className="text-xs text-[var(--muted)]" type="submit">Salir</button></form></div>
        </header>
        {children}
      </div>
      <AppNavigation />
    </div>
  );
}
