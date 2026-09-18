import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
    await supabase.rpc("bootstrap_strength_defaults");
  }
  return NextResponse.redirect(new URL("/hoy", requestUrl.origin));
}
