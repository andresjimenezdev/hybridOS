"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";

const initialState: AuthState = {};

export function LoginForm() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [state, formAction, pending] = useActionState(mode === "sign-in" ? signIn : signUp, initialState);

  return (
    <form action={formAction} className="card mt-8 space-y-4 p-5">
      <label className="block text-sm font-medium">Email
        <input className="field mt-2" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="block text-sm font-medium">Contraseña
        <input className="field mt-2" name="password" type="password" minLength={8}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required />
      </label>
      {state.error ? <p className="text-sm leading-6 text-[var(--danger)]">{state.error}</p> : null}
      <button className="primary-button w-full" disabled={pending} type="submit">
        {pending ? "Espera…" : mode === "sign-in" ? "Entrar" : "Crear cuenta"}
      </button>
      <button className="min-h-11 w-full text-sm text-[var(--muted)]"
        onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")} type="button">
        {mode === "sign-in" ? "Crear la cuenta inicial" : "Ya tengo cuenta"}
      </button>
    </form>
  );
}
