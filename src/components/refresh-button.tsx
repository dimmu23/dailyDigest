"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const WORKER_REFRESH_INTERVAL_MS = 5000;
const WORKER_REFRESH_ATTEMPTS = 18;

export function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function pollForWorkerUpdates() {
    if (pollRef.current) clearInterval(pollRef.current);

    let attempts = 0;
    pollRef.current = setInterval(() => {
      attempts += 1;
      router.refresh();

      if (attempts >= WORKER_REFRESH_ATTEMPTS && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, WORKER_REFRESH_INTERVAL_MS);
  }

  async function refresh() {
    setState("loading");
    setMessage("Checking official PIB sources…");
    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const body = await response.json();
      if (response.status === 429 && body.error?.code === "refresh_cooldown") {
        setState("success");
        setMessage("Recent sync is still finishing. New articles will appear automatically.");
        router.refresh();
        pollForWorkerUpdates();
        return;
      }
      if (!response.ok) throw new Error(body.error?.message || "Refresh failed.");
      const queued = body.data.created + body.data.updated;
      setState("success");
      setMessage(
        queued > 0
          ? "Refresh started. New articles will appear automatically."
          : "You're up to date."
      );
      router.refresh();
      if (queued > 0) pollForWorkerUpdates();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Refresh failed.");
    }
  }

  return (
    <div className="refresh-wrap">
      <button className="button primary" onClick={refresh} disabled={state === "loading"}>
        <span aria-hidden="true" className={state === "loading" ? "spin" : ""}>↻</span>
        {state === "loading" ? "Syncing…" : "Refresh from PIB"}
      </button>
      <span className={`refresh-message ${state}`} role="status">{message}</span>
    </div>
  );
}
