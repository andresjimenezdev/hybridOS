import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-between px-5 py-[max(2rem,env(safe-area-inset-top))] sm:px-8">
      <header className="flex items-center justify-between">
        <p className="text-sm font-semibold tracking-[-0.02em]">HybridOS</p>
        <span className="eyebrow">Personal</span>
      </header>
      <section className="py-16">
        <p className="eyebrow mb-5">Salud · Entrenamiento · Rendimiento</p>
        <h1 className="max-w-md text-5xl font-semibold leading-[0.96] tracking-[-0.06em] sm:text-6xl">
          Entrena con claridad. Guarda lo que importa.
        </h1>
        <p className="mt-6 max-w-sm text-base leading-7 text-[var(--muted)]">
          Un sistema personal para saber qué toca hoy, registrar cada sesión y entender tu evolución.
        </p>
        <Link className="primary-button mt-10" href="/login">Entrar en HybridOS</Link>
      </section>
      <footer className="border-t border-[var(--line)] pb-[env(safe-area-inset-bottom)] pt-5 text-xs text-[var(--muted)]">
        Supabase es la única fuente de verdad.
      </footer>
    </main>
  );
}
