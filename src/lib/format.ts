import { NOT_AVAILABLE } from "@/lib/constants";

export function formatDate(value: Date | string | null | undefined, withTime = false): string {
  if (!value) return NOT_AVAILABLE;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return NOT_AVAILABLE;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(date);
}

export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

