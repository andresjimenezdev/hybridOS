"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string };

function credentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email.includes("@") || password.length < 8) return null;
  return { email, password };
}

export async function signIn(_state: AuthState, formData: FormData): Promise<AuthState> {
  const values = credentials(formData);
  if (!values) return { error: "Introduce un email válido y una contraseña de al menos 8 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(values);
  if (error) return { error: "No se ha podido iniciar sesión. Revisa tus credenciales." };
  await supabase.rpc("bootstrap_strength_defaults");
  redirect("/hoy");
}

export async function signUp(_state: AuthState, formData: FormData): Promise<AuthState> {
  const values = credentials(formData);
  if (!values) return { error: "Introduce un email válido y una contraseña de al menos 8 caracteres." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(values);
  if (error) return { error: "No se ha podido crear la cuenta." };
  if (!data.session) return { error: "Cuenta creada. Confirma el email antes de entrar." };
  await supabase.rpc("bootstrap_strength_defaults");
  redirect("/hoy");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
