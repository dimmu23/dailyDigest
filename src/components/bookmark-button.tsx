"use client";

import { useEffect, useState } from "react";

function getUserId() {
  const key = "pib-upsc-user";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export function BookmarkButton({ releaseId }: { releaseId: string }) {
  const storageKey = `pib-bookmark-${releaseId}`;
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSaved(localStorage.getItem(storageKey) === "true");
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

  async function toggle() {
    setBusy(true);
    const next = !saved;
    const userId = getUserId();
    try {
      const response = await fetch(
        next
          ? "/api/bookmarks"
          : `/api/bookmarks?releaseId=${encodeURIComponent(releaseId)}&userId=${encodeURIComponent(userId)}`,
        next
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ releaseId, userId })
            }
          : { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Bookmark request failed.");
      localStorage.setItem(storageKey, String(next));
      setSaved(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`bookmark ${saved ? "saved" : ""}`}
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? "Remove bookmark" : "Save bookmark"}
      title={saved ? "Remove bookmark" : "Save bookmark"}
    >
      {saved ? "★" : "☆"}
    </button>
  );
}
