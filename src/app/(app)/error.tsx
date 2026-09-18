"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="card mx-auto mt-16 max-w-md p-7 text-center"><p className="eyebrow">Algo no ha salido bien</p><h1 className="mt-3 text-2xl font-semibold">No pudimos completar la acción.</h1><p className="mt-2 text-sm text-[var(--muted)]">Tus datos guardados anteriormente siguen intactos.</p><button className="primary-button mt-6" onClick={reset} type="button">Reintentar</button></main>;
}
