import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-5 py-[max(2rem,env(safe-area-inset-top))] sm:px-8 sm:py-16">
      <Link className="text-sm text-[var(--muted)]" href="/">← Volver</Link>
      <p className="eyebrow mt-14">HybridOS</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">Tu espacio personal.</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Acceso privado mediante Supabase Auth.</p>
      <LoginForm />
    </main>
  );
}
