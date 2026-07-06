"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function refresh() {
    setState("loading");
    setMessage("Checking official PIB sources…");
    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Refresh failed.");
      setState("success");
      setMessage(`Sync complete: ${body.data.enriched} enriched, ${body.data.failed} failed.`);
      router.refresh();
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

