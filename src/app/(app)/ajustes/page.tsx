import Link from "next/link";
import { retryGoogleSync } from "./actions";
import { createClient } from "@/lib/supabase/server";

type SyncLog = { id: string; direction: string; entity_type: string; status: string; attempted_at: string | null; completed_at: string | null; error_message: string | null };

function time(value: string | null) {
  return value ? new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(value)) : "Nunca";
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("sync_log").select("id,direction,entity_type,status,attempted_at,completed_at,error_message")
    .order("created_at", { ascending: false }).limit(30);
  const logs = (data ?? []) as SyncLog[];
  const latestInbound = logs.find((log) => log.direction === "inbound");
  const latestOutbound = logs.find((log) => log.direction === "outbound");
  const pending = logs.filter((log) => log.direction === "outbound" && log.status !== "success");
  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-end justify-between"><div><p className="eyebrow mb-2">Sistema</p><h1 className="text-4xl font-semibold tracking-[-0.045em]">Ajustes</h1></div><Link className="text-sm" href="/hoy">Cerrar</Link></div>
      <section className="card divide-y divide-[var(--line)]"><div className="flex items-center justify-between p-5"><div><p className="font-semibold">Supabase</p><p className="mt-1 text-xs text-[var(--muted)]">Fuente de verdad</p></div><span className="text-sm text-[var(--success)]">Guardado ✓</span></div><div className="flex items-center justify-between p-5"><div><p className="font-semibold">Planificación</p><p className="mt-1 text-xs text-[var(--muted)]">Última comprobación {time(latestInbound?.completed_at ?? null)}</p></div><span className={`text-sm ${latestInbound?.status === "failed" ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>{latestInbound?.status === "failed" ? "Revisar" : "Actualizada"}</span></div><div className="flex items-center justify-between p-5"><div><p className="font-semibold">Resultados</p><p className="mt-1 text-xs text-[var(--muted)]">Última sincronización {time(latestOutbound?.completed_at ?? null)}</p></div><span className={`text-sm ${pending.length ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>{pending.length ? `${pending.length} pendiente${pending.length === 1 ? "" : "s"}` : "Al día"}</span></div></section>
      {pending.length ? <section className="card mt-5 p-5"><p className="font-semibold">Sincronización pendiente</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Tus datos están guardados en Supabase. Google Sheets puede reintentarse sin perder información.</p><form action={retryGoogleSync}><button className="primary-button mt-5" type="submit">Reintentar</button></form></section> : null}
    </main>
  );
}
