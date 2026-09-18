"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function PlanSync() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const sync = useCallback(async (manual = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const response = await fetch("/api/google/sync-plan", { method: "POST" });
      if (!response.ok && response.status !== 207) throw new Error("sync unavailable");
      const result = await response.json() as { updated?: number; needsReview?: number; updatesAvailable?: number };
      sessionStorage.setItem("hybridos:last-plan-check", String(Date.now()));
      if ((result.updated ?? 0) > 0) setMessage("Plan actualizado");
      else if (manual) setMessage("Plan al día");
      if ((result.needsReview ?? 0) > 0 || (result.updatesAvailable ?? 0) > 0) setMessage("Plan actualizado · revisión necesaria");
      router.refresh();
    } catch {
      if (manual) setMessage("No se pudo comprobar el plan");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [router]);

  useEffect(() => {
    const lastCheck = Number(sessionStorage.getItem("hybridos:last-plan-check") ?? 0);
    if (Date.now() - lastCheck > CHECK_INTERVAL_MS) {
      const frame = requestAnimationFrame(() => { void sync(); });
      return () => cancelAnimationFrame(frame);
    }
  }, [sync]);

  return (
    <div className="flex items-center gap-3">
      {message ? <span className="text-xs text-[var(--muted)]">{message}</span> : null}
      <button className="min-h-11 text-xs font-medium" disabled={syncing} onClick={() => void sync(true)} type="button">
        {syncing ? "Comprobando…" : "Sincronizar"}
      </button>
    </div>
  );
}
